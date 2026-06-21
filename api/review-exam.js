const crypto = require('crypto');
const { getQuestionByIdMap } = require('./_lib/bank-store');
const { findExamById } = require('./_lib/exam-list-store');
const { readAttemptToken, scoreExamItems } = require('./_lib/exam-core');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const failures = new Map();
const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '');
  return forwarded.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function loginState(key) {
  const now = Date.now();
  const current = failures.get(key);
  if (!current || now - current.firstAt > WINDOW_MS) {
    const fresh = { count: 0, firstAt: now, lockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return current;
}

function recordFailure(key) {
  const state = loginState(key);
  state.count += 1;
  if (state.count >= MAX_FAILURES) {
    state.count = 0;
    state.firstAt = Date.now();
    state.lockedUntil = Date.now() + LOCK_MS;
  }
}

function resolveItems(payload) {
  if (payload.source === 'bank') {
    const map = getQuestionByIdMap();
    return (payload.questionIds || []).map(id => map.get(id)).filter(Boolean);
  }
  if (payload.source === 'exam') {
    const exam = findExamById(payload.examId);
    return exam && Array.isArray(exam.items) ? exam.items : [];
  }
  return [];
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const expectedPassword = process.env.ANSWER_REVIEW_PASSWORD || '';
    if (!expectedPassword) {
      return sendJson(res, 500, { ok: false, error: 'Chua cau hinh mat khau xem dap an.' });
    }

    const key = clientKey(req);
    const state = loginState(key);
    if (state.lockedUntil && Date.now() < state.lockedUntil) {
      return sendJson(res, 429, {
        ok: false,
        error: 'Nhap sai qua nhieu lan. Vui long thu lai sau 15 phut.'
      });
    }

    const body = await readJson(req, { maxBytes: 256 * 1024 });
    if (!safeEqual(body.password, expectedPassword)) {
      recordFailure(key);
      return sendJson(res, 401, { ok: false, error: 'Mat khau xem dap an khong dung.' });
    }

    const payload = readAttemptToken(body.attemptToken);
    const items = resolveItems(payload);
    if (!items.length) {
      return sendJson(res, 404, { ok: false, error: 'Khong tim thay cau hoi cua bai thi.' });
    }

    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const score = scoreExamItems(items, answers);
    failures.delete(key);
    sendJson(res, 200, {
      ok: true,
      questionsDetail: score.questionsDetail
    });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
  }
};
