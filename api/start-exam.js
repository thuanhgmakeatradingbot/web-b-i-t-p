const { getQuestionBank } = require('./_lib/bank-store');
const {
  createAttemptToken,
  getSubjectKeys,
  sanitizeExam,
  shuffle
} = require('./_lib/exam-core');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const TYPES = ['mc', 'truefalse', 'short', 'essay'];
const MAX_RANDOM_QUESTIONS = 120;

function poolFor(bank, subject, grade, type, allowedLessons) {
  const keys = getSubjectKeys(subject);
  const lessonSet = Array.isArray(allowedLessons) ? new Set(allowedLessons) : null;
  return bank.filter(q =>
    keys.includes(q.subjectKey) &&
    String(q.grade) === String(grade) &&
    q.type === type &&
    (!lessonSet || lessonSet.has(q.lesson))
  );
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await readJson(req);
    const bank = getQuestionBank();
    const subject = String(body.subject || '');
    const subjectName = String(body.subjectName || subject);
    const grade = String(body.grade || '');
    const counts = body.counts || {};
    const allowedLessons = Array.isArray(body.allowedLessons) ? body.allowedLessons : null;
    const timeMinutes = Math.max(1, Math.min(240, parseInt(body.timeMinutes, 10) || 45));
    const scopeLabel = String(body.scopeLabel || '');

    let selected = [];
    let total = 0;
    for (const type of TYPES) {
      const count = Math.max(0, parseInt(counts[type], 10) || 0);
      total += count;
      if (total > MAX_RANDOM_QUESTIONS) {
        return sendJson(res, 400, { ok: false, error: `Too many questions. Maximum is ${MAX_RANDOM_QUESTIONS}.` });
      }
      if (!count) continue;

      const pool = poolFor(bank, subject, grade, type, allowedLessons);
      if (count > pool.length) {
        return sendJson(res, 400, {
          ok: false,
          error: `Not enough questions for ${type}. Need ${count}, have ${pool.length}.`
        });
      }
      selected = selected.concat(shuffle(pool).slice(0, count));
    }

    if (!total) return sendJson(res, 400, { ok: false, error: 'No questions selected.' });

    selected = shuffle(selected);
    const title = `De ngau nhien - ${subjectName} - Lop ${grade}` +
      (allowedLessons ? ` (${scopeLabel || `${allowedLessons.length} bai`})` : '');

    const exam = {
      id: `secure-random-${Date.now()}`,
      random: true,
      secure: true,
      subjectKey: subject,
      subjectName,
      grade: parseInt(grade, 10),
      title,
      timeMinutes,
      items: selected
    };

    const attemptToken = createAttemptToken({
      source: 'bank',
      questionIds: selected.map(q => q.id),
      subjectKey: subject,
      subjectName,
      grade: parseInt(grade, 10),
      title,
      timeMinutes
    });

    sendJson(res, 200, { ok: true, exam: sanitizeExam(exam), attemptToken });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
