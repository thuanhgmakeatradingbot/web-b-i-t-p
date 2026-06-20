const { encryptJsonPayload } = require('./_lib/crypto-store');
const { getExamList, resetExamListCache } = require('./_lib/exam-list-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');
const { buildPublicExamListText, requireAdmin, saveTextFile } = require('./_lib/admin-store');
const { validateExamList } = require('./_lib/question-validation');

function upsertExam(examList, exam) {
  const key = exam.subjectKey || 'khtn';
  if (!exam.id) exam.id = `de-${key}-${Date.now()}`;
  if (!examList[key]) examList[key] = [];
  for (const subject of Object.keys(examList)) {
    examList[subject] = (examList[subject] || []).filter(item => item.id !== exam.id);
  }
  examList[key].push(exam);
  return examList;
}

function deleteExam(examList, ref) {
  let removed = 0;
  for (const subject of Object.keys(examList || {})) {
    const before = (examList[subject] || []).length;
    examList[subject] = (examList[subject] || []).filter(item => item.id !== ref && item.link !== ref);
    removed += before - examList[subject].length;
  }
  return { examList, removed };
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, examList: getExamList() });
    }

    const body = await readJson(req);
    let examList;
    let removed = 0;
    if (body.deleteRef) {
      const result = deleteExam(JSON.parse(JSON.stringify(getExamList())), String(body.deleteRef));
      examList = result.examList;
      removed = result.removed;
    } else if (body.examList && typeof body.examList === 'object') {
      examList = body.examList;
    } else if (body.exam && typeof body.exam === 'object') {
      examList = upsertExam(JSON.parse(JSON.stringify(getExamList())), body.exam);
    } else {
      return sendJson(res, 400, { ok: false, error: 'Missing exam or examList.' });
    }
    validateExamList(examList);

    const encrypted = encryptJsonPayload(examList, 'QUESTION_BANK_SECRET');
    const savedEncrypted = await saveTextFile(
      'api/_data/exam-list.enc.json',
      JSON.stringify(encrypted),
      'Cap nhat danh sach de ma hoa'
    );
    const savedPublic = await saveTextFile(
      'danh-sach-de.js',
      buildPublicExamListText(examList),
      'Cap nhat danh sach de public metadata'
    );

    resetExamListCache(examList);
    sendJson(res, 200, { ok: true, removed, saved: [savedEncrypted, savedPublic] });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
