const c = require('../lib/core');

module.exports = c.handle('GET', async (req, res) => {
  const s = await c.currentSession(req);
  if (!s) throw new c.HttpError(401, 'Not signed in.');
  return c.send(res, 200, { user: c.publicUser(s), state: await c.loadState(s.id) });
});
