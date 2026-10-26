const c = require('../lib/core');

module.exports = c.handle('POST', async (req, res) => {
  const token = c.getCookie(req, 'wg_sid');
  if (token) await c.sql('DELETE FROM wg_sessions WHERE token_hash = $1', [c.sha256(token)]);
  return c.send(res, 200, { ok: true }, { 'Set-Cookie': `wg_sid=; Max-Age=0; ${c.cookieFlags()}` });
});
