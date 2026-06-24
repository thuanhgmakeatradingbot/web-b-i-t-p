const { getQuestionByIdMap } = require('./_lib/bank-store');
const { findExamById } = require('./_lib/exam-list-store');
const { readAttemptToken, scoreExamItems } = require('./_lib/exam-core');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const submissions = new Map();
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMITS_PER_WINDOW = 8;

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

function normalizeExitCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 999);
}

async function saveToGoogleSheets(payload, student, answers, score, meta) {
  const url = process.env.GOOGLE_SCRIPT_URL || '';
  if (!url) return { ok: false, skipped: true };

  const data = {
    secret: process.env.RESULTS_SECRET || '',
    timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    name: student.name || '',
    class: student.class || '',
    subject: payload.subjectName || '',
    exam: payload.title || '',
    correct: score.correctCount || 0,
    wrong: score.wrongCount || 0,
    score: score.autoTotalStr,
    answers: JSON.stringify(answers || {}),
    correctAnswers: JSON.stringify(score.correctMap || {}),
    explanations: JSON.stringify({ v: 1, q: score.questionsDetail || [] }),
    fullscreenExitCount: normalizeExitCount(meta && meta.fullscreenExitCount)
  };

  if (student.essayImages && Object.keys(student.essayImages).length) {
    data.essayImages = JSON.stringify(student.essayImages);
  }

  const response = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
  return { ok: response.ok, status: response.status };
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '');
  return forwarded.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function submitKey(req, token) {
  return `${clientIp(req)}:${String(token || '').slice(-32)}`;
}

function checkSubmitLimit(req, token) {
  const key = submitKey(req, token);
  const now = Date.now();
  const state = submissions.get(key);
  if (!state || now - state.firstAt > SUBMIT_WINDOW_MS) {
    submissions.set(key, { firstAt: now, count: 1 });
    return true;
  }
  state.count += 1;
  return state.count <= MAX_SUBMITS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await readJson(req, { maxBytes: 12 * 1024 * 1024 });
    if (!checkSubmitLimit(req, body.attemptToken)) {
      return sendJson(res, 429, { ok: false, error: 'Nop bai qua nhieu lan. Vui long thu lai sau.' });
    }
    const payload = readAttemptToken(body.attemptToken);
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const student = body.student && typeof body.student === 'object' ? body.student : {};
    student.essayImages = body.essayImages && typeof body.essayImages === 'object' ? body.essayImages : {};
    const meta = {
      fullscreenExitCount: normalizeExitCount(body.fullscreenExitCount)
    };

    const items = resolveItems(payload);
    if (!items.length) return sendJson(res, 404, { ok: false, error: 'Attempt questions not found.' });

    const score = scoreExamItems(items, answers);
    let saved = { ok: false };
    try {
      saved = await saveToGoogleSheets(payload, student, answers, score, meta);
    } catch (error) {
      saved = { ok: false, error: error.message };
    }

    sendJson(res, 200, {
      ok: true,
      saved,
      score: score.autoTotalStr,
      rawScore: score.rawTotalStr,
      rawMax: score.rawMaxStr,
      autoPortion: score.autoPortion,
      essayPoints: score.essayPoints,
      hasEssay: score.hasEssay,
      correctCount: score.correctCount,
      wrongCount: score.wrongCount,
      fullscreenExitCount: meta.fullscreenExitCount,
      breakdown: score.breakdown
    });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
  }
};
