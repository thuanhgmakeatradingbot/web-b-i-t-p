const { getQuestionBankAsync } = require('./_lib/bank-store');
const { allowMethods, sendJson } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const bank = await getQuestionBankAsync();
    const items = bank.map(q => ({
      id: q.id,
      subjectKey: q.subjectKey,
      grade: q.grade,
      lesson: q.lesson || '',
      type: q.type
    }));
    sendJson(res, 200, { ok: true, items });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
