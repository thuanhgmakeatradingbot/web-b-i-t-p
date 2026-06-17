const { requireAdmin } = require('./_lib/admin-store');
const { allowMethods, sendJson } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL || '';
    const secret = process.env.RESULTS_SECRET || '';
    if (!scriptUrl || !secret) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Missing GOOGLE_SCRIPT_URL or RESULTS_SECRET on server.'
      });
    }

    const url = new URL(scriptUrl);
    url.searchParams.set('action', 'results');
    url.searchParams.set('secret', secret);

    const response = await fetch(url);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: 'Apps Script did not return JSON.' });
    }

    if (!response.ok || data.status !== 'success') {
      return sendJson(res, response.ok ? 502 : response.status, {
        ok: false,
        error: data.message || 'Could not load results.'
      });
    }

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
