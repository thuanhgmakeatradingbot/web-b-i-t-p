const crypto = require('crypto');
const { createAdminToken } = require('./_lib/admin-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const failures = new Map();
const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validPassword(password) {
  if (process.env.ADMIN_PASSWORD && safeEqual(password, process.env.ADMIN_PASSWORD)) return true;
  return false;
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '');
  const first = forwarded.split(',')[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function loginState(key) {
  const now = Date.now();
  const state = failures.get(key);
  if (!state || now - state.firstAt > WINDOW_MS) {
    const fresh = { count: 0, firstAt: now, lockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return state;
}

function isLocked(key) {
  const state = loginState(key);
  return state.lockedUntil && Date.now() < state.lockedUntil;
}

function recordFailure(key) {
  const state = loginState(key);
  state.count += 1;
  if (state.count >= MAX_FAILURES) {
    state.lockedUntil = Date.now() + LOCK_MS;
    state.count = 0;
    state.firstAt = Date.now();
  }
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const key = clientKey(req);
    if (isLocked(key)) {
      return sendJson(res, 429, { ok: false, error: 'Dang bi khoa tam thoi. Vui long thu lai sau.' });
    }

    const body = await readJson(req, { maxBytes: 10 * 1024 });
    if (!process.env.ADMIN_PASSWORD) {
      return sendJson(res, 500, { ok: false, error: 'Missing ADMIN_PASSWORD on server.' });
    }
    if (!validPassword(body.password || '')) {
      recordFailure(key);
      return sendJson(res, 401, { ok: false, error: 'Sai mat khau admin.' });
    }

    failures.delete(key);
    const session = createAdminToken();
    sendJson(res, 200, { ok: true, admin: true, ...session });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
