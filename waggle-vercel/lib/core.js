// Shared server code for Waggle on Vercel: database, passwords, sessions, request helpers.
const crypto = require('crypto');
const { Pool } = require('pg');

const MAX_BODY = 4 * 1024 * 1024;   // Vercel rejects bodies over 4.5 MB anyway
const MAX_NAME = 80;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COOKIE_SECURE = process.env.COOKIE_SECURE !== '0'; // HTTPS on Vercel, so Secure is on by default

class HttpError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

// ---- database (Postgres, e.g. Neon free tier) ----
const SCHEMA = `
CREATE TABLE IF NOT EXISTS wg_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS wg_states (
  user_id TEXT PRIMARY KEY REFERENCES wg_users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS wg_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES wg_users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS wg_login_fails (
  key TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS wg_login_fails_key ON wg_login_fails (key);
`;

let pool = null;
let ready = null;
function connect() {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new HttpError(500, 'The server is not set up yet: DATABASE_URL is missing.');
  const local = /localhost|127\.0\.0\.1/.test(cs);
  pool = new Pool({ connectionString: cs, max: 1, idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: true } });
  ready = pool.query(SCHEMA).catch((e) => { ready = null; throw e; });
  return pool;
}
async function sql(text, params) {
  const p = connect();
  await ready;
  return p.query(text, params);
}

// ---- passwords: scrypt with a random salt per password ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3) return false;
  const want = Buffer.from(parts[2], 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(parts[1], 'base64'), want.length);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// ---- login throttling: at most 10 failed attempts per email+IP in 15 minutes ----
const WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 10;
async function recentFails(key) {
  const r = await sql('SELECT COUNT(*)::int AS n FROM wg_login_fails WHERE key = $1 AND at > $2', [key, Date.now() - WINDOW_MS]);
  return r.rows[0].n;
}
async function noteFail(key) {
  await sql('INSERT INTO wg_login_fails (key, at) VALUES ($1, $2)', [key, Date.now()]);
  await sql('DELETE FROM wg_login_fails WHERE at < $1', [Date.now() - WINDOW_MS]);
}
async function clearFails(key) {
  await sql('DELETE FROM wg_login_fails WHERE key = $1', [key]);
}
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || '';
}

// ---- sessions and cookies ----
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function cookieFlags() { return 'HttpOnly; SameSite=Lax; Path=/' + (COOKIE_SECURE ? '; Secure' : ''); }
async function currentSession(req) {
  const token = getCookie(req, 'wg_sid');
  if (!token) return null;
  const r = await sql(
    `SELECT u.id, u.name, u.email, s.expires_at, s.token_hash FROM wg_sessions s
     JOIN wg_users u ON u.id = s.user_id WHERE s.token_hash = $1`, [sha256(token)]);
  const row = r.rows[0];
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await sql('DELETE FROM wg_sessions WHERE token_hash = $1', [row.token_hash]);
    return null;
  }
  return row;
}
async function startSession(userId, remember) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = remember ? 30 : 1;
  await sql('DELETE FROM wg_sessions WHERE expires_at < $1', [Date.now()]);
  await sql('INSERT INTO wg_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [sha256(token), userId, Date.now() + days * 86400000]);
  return `wg_sid=${token}; Max-Age=${days * 86400}; ${cookieFlags()}`;
}
async function loadState(userId) {
  const r = await sql('SELECT data FROM wg_states WHERE user_id = $1', [userId]);
  if (!r.rows[0]) return {};
  try { return JSON.parse(r.rows[0].data); } catch (e) { return {}; }
}
function publicUser(row) { return { name: row.name, email: row.email }; }

// ---- request and response helpers ----
function send(res, code, obj, extraHeaders) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); }
    catch (e) { return Promise.reject(new HttpError(400, 'Request data is not valid.')); }
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'That is too much data at once.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new HttpError(400, 'Request data is not valid.')); }
    });
    req.on('error', reject);
  });
}
// Wrap an endpoint: checks the HTTP method, reads the body, and turns errors into JSON replies.
function handle(method, fn) {
  return async (req, res) => {
    try {
      if (req.method !== method) { res.setHeader('Allow', method); throw new HttpError(405, 'Method not allowed.'); }
      const body = await readBody(req);
      await fn(req, res, body);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.code, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Something went wrong on the server. Try again.' });
    }
  };
}

module.exports = {
  HttpError, MAX_NAME, EMAIL_RE, MAX_BODY,
  sql, hashPassword, checkPassword, sha256,
  recentFails, noteFail, clearFails, clientIp, MAX_FAILS,
  getCookie, cookieFlags, currentSession, startSession, loadState, publicUser,
  send, handle,
};
