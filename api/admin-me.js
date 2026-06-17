const { verifyAdminToken } = require('./_lib/admin-store');
const { allowMethods, sendJson } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const auth = req.headers.authorization || req.headers.Authorization || '';
    const match = String(auth).match(/^Bearer\s+(.+)$/i);
    const payload = verifyAdminToken(match ? match[1] : '');
    if (!payload) return sendJson(res, 401, { ok: false, admin: false });
    sendJson(res, 200, { ok: true, admin: true, expiresAt: payload.exp });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
