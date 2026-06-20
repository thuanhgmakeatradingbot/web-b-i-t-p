const { requireAdmin } = require('./_lib/admin-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

function resultsConfig() {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL || '';
  const secret = process.env.RESULTS_SECRET || '';
  if (!scriptUrl || !secret) {
    const error = new Error('Missing GOOGLE_SCRIPT_URL or RESULTS_SECRET on server.');
    error.statusCode = 500;
    throw error;
  }
  return { scriptUrl, secret };
}

async function parseScriptResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('Apps Script did not return JSON.');
    invalid.statusCode = 502;
    throw invalid;
  }
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const { scriptUrl, secret } = resultsConfig();

    if (req.method === 'GET') {
      const url = new URL(scriptUrl);
      url.searchParams.set('action', 'results');
      url.searchParams.set('secret', secret);

      const response = await fetch(url);
      const data = await parseScriptResponse(response);
      if (!response.ok || data.status !== 'success') {
        return sendJson(res, response.ok ? 502 : response.status, {
          ok: false,
          error: data.message || 'Could not load results.'
        });
      }

      return sendJson(res, 200, data);
    }

    const body = await readJson(req, { maxBytes: 64 * 1024 });
    const deleteAll = body.scope === 'all';
    const rowNumbers = Array.isArray(body.rowNumbers)
      ? Array.from(new Set(body.rowNumbers.map(Number).filter(n => Number.isInteger(n) && n >= 2)))
      : [];

    if (!deleteAll && !rowNumbers.length) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Choose at least one submitted result to delete.'
      });
    }
    if (rowNumbers.length > 1000) {
      return sendJson(res, 400, { ok: false, error: 'Too many rows in one delete request.' });
    }

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deleteResults',
        secret,
        scope: deleteAll ? 'all' : 'selected',
        rowNumbers
      })
    });
    const data = await parseScriptResponse(response);
    if (!response.ok || data.status !== 'success') {
      return sendJson(res, response.ok ? 502 : response.status, {
        ok: false,
        error: data.message || 'Could not delete results.'
      });
    }

    sendJson(res, 200, {
      ok: true,
      status: 'success',
      deleted: Number(data.deleted) || 0
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
