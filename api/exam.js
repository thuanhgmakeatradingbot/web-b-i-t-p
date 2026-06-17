const { findExamById } = require('./_lib/exam-list-store');
const { createAttemptToken, sanitizeExam } = require('./_lib/exam-core');
const { allowMethods, sendJson } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || '';
    const exam = id ? findExamById(id) : null;
    if (!exam || !Array.isArray(exam.items)) {
      return sendJson(res, 404, { ok: false, error: 'Exam not found.' });
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
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
