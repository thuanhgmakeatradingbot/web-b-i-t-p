const crypto = require('crypto');
const { signPayload, verifyPayload } = require('./crypto-store');

// Lượt làm bài được ghi ở trang "Lượt làm" của Google Sheet (qua Apps Script), nên
// giờ bắt đầu và số lần thoát fullscreen không phụ thuộc vào trình duyệt học sinh.
// Script cũ (chưa có các action này) sẽ hiểu nhầm mọi POST là bài nộp, nên phải hỏi
// phiên bản trước; chưa đủ phiên bản thì web chạy như cũ (không theo dõi lượt).
const MIN_SCRIPT_VERSION = 2;
let versionCache = { ok: false, at: 0 };

function scriptConfig() {
  return {
    url: process.env.GOOGLE_SCRIPT_URL || '',
    secret: process.env.RESULTS_SECRET || ''
  };
}

async function trackingEnabled() {
  const { url, secret } = scriptConfig();
  if (!url || !secret) return false;
  const ttl = versionCache.ok ? 10 * 60 * 1000 : 60 * 1000;
  if (Date.now() - versionCache.at < ttl) return versionCache.ok;
  let ok = false;
  try {
    const u = new URL(url);
    u.searchParams.set('action', 'version');
    u.searchParams.set('secret', secret);
    const res = await fetch(u);
    const data = JSON.parse(await res.text());
    ok = data.status === 'success' && Number(data.version) >= MIN_SCRIPT_VERSION;
  } catch (e) {
    ok = false;
  }
  versionCache = { ok, at: Date.now() };
  return ok;
}

async function callScript(action, payload) {
  const { url, secret } = scriptConfig();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action, secret })
  });
  const data = JSON.parse(await res.text());
  if (data.status !== 'success') throw new Error(data.message || 'Apps Script error');
  return data;
}

// Khoá đề: đề cố định dùng id; đề ngẫu nhiên dùng dấu vân tay của bộ câu hỏi.
function examKeyOf(payload) {
  if (payload.source === 'exam') return 'exam:' + payload.examId;
  const ids = (payload.questionIds || []).join(',');
  return 'bank:' + crypto.createHash('sha256').update(ids).digest('hex').slice(0, 16);
}

function createSessionToken(info) {
  return signPayload({
    v: 1,
    kind: 'attempt-session',
    attemptId: info.attemptId,
    examKey: info.examKey,
    startedAt: info.startedAt,
    timeMinutes: info.timeMinutes,
    exp: info.startedAt + (info.timeMinutes + 24 * 60) * 60 * 1000
  });
}

function readSessionToken(token) {
  const p = verifyPayload(token);
  if (!p || p.kind !== 'attempt-session' || !p.attemptId) throw new Error('Invalid session token');
  if (!p.exp || Date.now() > p.exp) throw new Error('Session token expired');
  return p;
}

module.exports = { callScript, createSessionToken, examKeyOf, readSessionToken, trackingEnabled };
