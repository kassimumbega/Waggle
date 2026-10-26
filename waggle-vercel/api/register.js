const crypto = require('crypto');
const c = require('../lib/core');

module.exports = c.handle('POST', async (req, res, body) => {
  const name = String(body.name || '').trim().slice(0, c.MAX_NAME);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!name) throw new c.HttpError(400, 'Enter your full name.');
  if (!c.EMAIL_RE.test(email)) throw new c.HttpError(400, 'Enter a valid email address.');
  if (password.length < 8 || password.length > 200) throw new c.HttpError(400, 'Password must be 8 to 200 characters.');
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await c.sql('INSERT INTO wg_users (id, name, email, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, name, email, c.hashPassword(password), now]);
  } catch (e) {
    if (e.code === '23505') throw new c.HttpError(409, 'An account with this email already exists. Try signing in.');
    throw e;
  }
  await c.sql("INSERT INTO wg_states (user_id, data, updated_at) VALUES ($1, '{}', $2)", [id, now]);
  const cookie = await c.startSession(id, true);
  return c.send(res, 201, { user: { name, email }, state: {} }, { 'Set-Cookie': cookie });
});
