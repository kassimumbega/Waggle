const c = require('../lib/core');

module.exports = c.handle('PUT', async (req, res, body) => {
  const s = await c.currentSession(req);
  if (!s) throw new c.HttpError(401, 'Your session has ended. Sign in again.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new c.HttpError(400, 'Saved data is not valid.');
  const text = JSON.stringify(body);
  if (text.length > c.MAX_BODY) throw new c.HttpError(413, 'That is too much data at once.');
  await c.sql(`INSERT INTO wg_states (user_id, data, updated_at) VALUES ($1, $2, $3)
               ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [s.id, text, Date.now()]);
  return c.send(res, 200, { ok: true, saved_at: Date.now() });
});
