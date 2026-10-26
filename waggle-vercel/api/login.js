const c = require('../lib/core');

module.exports = c.handle('POST', async (req, res, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const key = email + '|' + c.clientIp(req);
  if (await c.recentFails(key) >= c.MAX_FAILS) throw new c.HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
  const r = await c.sql('SELECT * FROM wg_users WHERE email = $1', [email]);
  const row = r.rows[0];
  if (!row || !c.checkPassword(password, row.pass_hash)) {
    await c.noteFail(key);
    throw new c.HttpError(401, 'Email or password is not correct.');
  }
  await c.clearFails(key);
  const cookie = await c.startSession(row.id, !!body.remember);
  return c.send(res, 200, { user: c.publicUser(row), state: await c.loadState(row.id) }, { 'Set-Cookie': cookie });
});
