const { findExamByIdAsync } = require('./_lib/exam-list-store');
const { createAttemptToken, sanitizeExam } = require('./_lib/exam-core');
const { clientKey, createLimiter, safeEqual } = require('./_lib/exam-password');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const limiter = createLimiter();

// GET ?id=...  hoặc  POST {id, password}  (đề có mật khẩu làm đề thì phải POST kèm mật khẩu)
module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  try {
    let id = '';
    let password = '';
    if (req.method === 'POST') {
      const body = await readJson(req, { maxBytes: 10 * 1024 });
      id = String(body.id || '');
      password = String(body.password || '');
    } else {
      id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
    }

    const exam = id ? await findExamByIdAsync(id) : null;
    if (!exam || !Array.isArray(exam.items)) {
      return sendJson(res, 404, { ok: false, error: 'Exam not found.' });
    }

    if (exam.examPassword) {
      const key = 'exam:' + clientKey(req);
      if (limiter.isLocked(key)) {
        return sendJson(res, 429, { ok: false, needPassword: true, error: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
      }
      if (!password) {
        return sendJson(res, 401, { ok: false, needPassword: true, title: exam.title || '', error: 'Đề này cần mật khẩu.' });
      }
      if (!safeEqual(password, exam.examPassword)) {
        limiter.fail(key);
        return sendJson(res, 401, { ok: false, needPassword: true, title: exam.title || '', error: 'Mật khẩu làm đề không đúng.' });
      }
      limiter.reset(key);
    }

    const attemptToken = createAttemptToken({
      source: 'exam',
      examId: exam.id,
      subjectKey: exam.subjectKey || '',
      subjectName: exam.subjectName || '',
      grade: exam.grade,
      title: exam.title || '',
      timeMinutes: parseInt(exam.timeMinutes, 10) || 45
    });

    sendJson(res, 200, { ok: true, exam: sanitizeExam(exam), attemptToken });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
