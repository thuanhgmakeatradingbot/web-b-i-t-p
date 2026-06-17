const { signPayload, verifyPayload } = require('./crypto-store');

const TYPE_ORDER = ['mc', 'truefalse', 'short', 'essay'];
const MC_RAW_POINT = 0.25;
const SHORT_RAW_POINT = 0.25;
const TRUEFALSE_RAW_POINT = 1;
const TRUEFALSE_SCORE_BY_WRONG = [1, 0.5, 0.25, 0.1, 0];

function getSubjectKeys(subject) {
  if (subject === 'khtn_all') return ['khtn_hoa', 'khtn_sinh', 'khtn_ly'];
  return [subject];
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sanitizeQuestion(q) {
  const clean = {
    id: q.id,
    subjectKey: q.subjectKey,
    grade: q.grade,
    lesson: q.lesson || '',
    type: q.type,
    content: q.content || '',
    image: q.image || ''
  };

  if (q.type === 'mc') clean.options = Array.isArray(q.options) ? q.options.slice() : [];
  if (q.type === 'truefalse') {
    clean.subItems = (q.subItems || []).map(item => ({ text: item.text || '' }));
  }
  if (q.type === 'essay') clean.points = q.points;
  return clean;
}

function sanitizeExam(exam) {
  return {
    id: exam.id,
    random: !!exam.random,
    secure: true,
    subjectKey: exam.subjectKey || '',
    subjectName: exam.subjectName || '',
    grade: exam.grade,
    title: exam.title || '',
    timeMinutes: parseInt(exam.timeMinutes, 10) || 45,
    items: (exam.items || []).map(sanitizeQuestion)
  };
}

function normalizeShort(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(',', '.');
}

function orderedByRenderType(items) {
  const out = [];
  for (const type of TYPE_ORDER) {
    out.push(...items.filter(q => q.type === type));
  }
  return out;
}

function trueFalseRawScore(wrongCount) {
  const safeWrongCount = Math.max(0, Math.min(4, wrongCount));
  return TRUEFALSE_SCORE_BY_WRONG[safeWrongCount] || 0;
}

function scoreExamItems(items, answers) {
  let essayPoints = 0;
  let rawMax = 0;
  for (const q of items) {
    if (q.type === 'essay') essayPoints += parseFloat(q.points) || 1;
    else if (q.type === 'truefalse' && (q.subItems || []).length) rawMax += TRUEFALSE_RAW_POINT;
    else if (q.type === 'mc') rawMax += MC_RAW_POINT;
    else if (q.type === 'short') rawMax += SHORT_RAW_POINT;
  }

  const autoPortion = rawMax > 0 ? Math.max(0, 10 - essayPoints) : 0;
  const scale = rawMax > 0 ? autoPortion / rawMax : 0;
  const result = {
    autoTotal: 0,
    autoTotalStr: '0.00',
    rawTotal: 0,
    rawTotalStr: '0.00',
    rawMax,
    rawMaxStr: rawMax.toFixed(2),
    scale,
    autoPortion,
    essayPoints,
    hasEssay: essayPoints > 0,
    correctCount: 0,
    wrongCount: 0,
    correctMap: {},
    questionsDetail: [],
    breakdown: {
      mc: { count: 0, rawScore: 0, score: 0 },
      truefalse: { count: 0, rawScore: 0, score: 0 },
      short: { count: 0, rawScore: 0, score: 0 }
    }
  };

  let qIndex = 0;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  for (const q of orderedByRenderType(items)) {
    if (q.type === 'mc') {
      qIndex++;
      result.breakdown.mc.count++;
      const name = `q${qIndex}`;
      const picked = answers[name] || '';
      result.correctMap[name] = q.answer || '';
      const ok = !!picked && picked === q.answer;
      if (ok) {
        result.correctCount++;
        result.breakdown.mc.rawScore += MC_RAW_POINT;
        result.rawTotal += MC_RAW_POINT;
      } else {
        result.wrongCount++;
      }
      result.questionsDetail.push({
        sec: 'mc',
        no: result.breakdown.mc.count,
        type: 'mc',
        lesson: q.lesson || '',
        content: q.content || '',
        image: q.image || '',
        options: (q.options || []).map((text, index) => ({ L: letters[index], text })),
        correct: q.answer || '',
        student: picked
      });
    } else if (q.type === 'truefalse') {
      result.breakdown.truefalse.count++;
      const detailItems = [];
      let wrongSubItems = 0;
      const subItems = q.subItems || [];
      for (const item of subItems) {
        qIndex++;
        const name = `q${qIndex}`;
        const picked = answers[name] || '';
        const correct = String(item.answer);
        result.correctMap[name] = correct;
        const ok = !!picked && picked === correct;
        if (ok) {
          result.correctCount++;
        } else {
          result.wrongCount++;
          wrongSubItems++;
        }
        detailItems.push({
          text: item.text || '',
          correct,
          student: picked
        });
      }
      const rawScore = subItems.length ? trueFalseRawScore(wrongSubItems) : 0;
      result.breakdown.truefalse.rawScore += rawScore;
      result.rawTotal += rawScore;
      result.questionsDetail.push({
        sec: 'tf',
        no: result.breakdown.truefalse.count,
        type: 'truefalse',
        lesson: q.lesson || '',
        content: q.content || '',
        image: q.image || '',
        items: detailItems
      });
    } else if (q.type === 'short') {
      qIndex++;
      result.breakdown.short.count++;
      const name = `q${qIndex}`;
      const picked = String(answers[name] || '').trim();
      const accepts = q.answers || [];
      result.correctMap[name] = accepts.join(' / ');
      const ok = picked !== '' && accepts.map(normalizeShort).includes(normalizeShort(picked));
      if (ok) {
        result.correctCount++;
        result.breakdown.short.rawScore += SHORT_RAW_POINT;
        result.rawTotal += SHORT_RAW_POINT;
      } else {
        result.wrongCount++;
      }
      result.questionsDetail.push({
        sec: 'short',
        no: result.breakdown.short.count,
        type: 'short',
        lesson: q.lesson || '',
        content: q.content || '',
        image: q.image || '',
        accepts,
        student: picked
      });
    } else if (q.type === 'essay') {
      qIndex++;
      const name = `q${qIndex}`;
      result.questionsDetail.push({
        sec: 'essay',
        no: result.questionsDetail.filter(item => item.type === 'essay').length + 1,
        type: 'essay',
        lesson: q.lesson || '',
        content: q.content || '',
        image: q.image || '',
        student: answers[name] || ''
      });
    }
  }

  result.autoTotal = result.rawTotal * scale;
  result.autoTotalStr = result.autoTotal.toFixed(2);
  result.rawTotalStr = result.rawTotal.toFixed(2);
  result.breakdown.mc.score = result.breakdown.mc.rawScore * scale;
  result.breakdown.truefalse.score = result.breakdown.truefalse.rawScore * scale;
  result.breakdown.short.score = result.breakdown.short.rawScore * scale;
  return result;
}

function createAttemptToken(payload) {
  const now = Date.now();
  const minutes = Math.max(1, Math.min(240, parseInt(payload.timeMinutes, 10) || 45));
  return signPayload({
    ...payload,
    v: 1,
    iat: now,
    exp: now + (minutes + 15) * 60 * 1000
  });
}

function readAttemptToken(token) {
  const payload = verifyPayload(token);
  if (!payload || payload.v !== 1) throw new Error('Invalid attempt token');
  if (!payload.exp || Date.now() > payload.exp) throw new Error('Attempt token expired');
  return payload;
}

module.exports = {
  createAttemptToken,
  getSubjectKeys,
  readAttemptToken,
  sanitizeExam,
  sanitizeQuestion,
  scoreExamItems,
  shuffle
};
