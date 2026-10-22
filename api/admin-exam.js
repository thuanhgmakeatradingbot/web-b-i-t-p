const { encryptJsonPayload } = require('./_lib/crypto-store');
const { getExamListAsync, resetExamListCache } = require('./_lib/exam-list-store');
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

// Sửa tên & thông tin hiển thị của 1 đề; không đụng tới câu hỏi/đáp án.
function updateExamMeta(examList, id, meta) {
  for (const subject of Object.keys(examList || {})) {
    const exam = (examList[subject] || []).find(item => item.id === id);
    if (!exam) continue;

    const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
    const title = text(meta.title, 200);
    if (!title) throw Object.assign(new Error('Tên đề không được để trống.'), { statusCode: 400 });
    exam.title = title;
    for (const key of ['content', 'questions', 'topics', 'difficulty']) {
      if (meta[key] !== undefined) exam[key] = text(meta[key], 500);
    }
    if (meta.timeMinutes !== undefined) {
      const minutes = parseInt(meta.timeMinutes, 10);
      if (!(minutes >= 1 && minutes <= 240)) {
        throw Object.assign(new Error('Thời gian phải từ 1 đến 240 phút.'), { statusCode: 400 });
      }
      exam.timeMinutes = minutes;
      exam.time = minutes + ' phút';
    }
    if (meta.grade !== undefined) {
      const grade = parseInt(meta.grade, 10);
      if (!(grade >= 1 && grade <= 12)) {
        throw Object.assign(new Error('Lớp phải từ 1 đến 12.'), { statusCode: 400 });
      }
      exam.grade = grade;
    }
    return exam;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const examList = await getExamListAsync();
      return sendJson(res, 200, { ok: true, examList });
    }

    const body = await readJson(req);
    let examList;
    let removed = 0;
    let updated = null;
    if (body.updateMeta && typeof body.updateMeta === 'object') {
      const current = await getExamListAsync();
      examList = JSON.parse(JSON.stringify(current));
      updated = updateExamMeta(examList, String(body.updateMeta.id || ''), body.updateMeta);
      if (!updated) return sendJson(res, 404, { ok: false, error: 'Không tìm thấy đề cần sửa.' });
    } else if (body.deleteRef) {
      const current = await getExamListAsync();
      const result = deleteExam(JSON.parse(JSON.stringify(current)), String(body.deleteRef));
      examList = result.examList;
      removed = result.removed;
    } else if (body.examList && typeof body.examList === 'object') {
      examList = body.examList;
    } else if (body.exam && typeof body.exam === 'object') {
      const current = await getExamListAsync();
      examList = upsertExam(JSON.parse(JSON.stringify(current)), body.exam);
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
    const exam = updated ? (({ items, ...meta }) => meta)(updated) : undefined;
    sendJson(res, 200, { ok: true, removed, exam, saved: [savedEncrypted, savedPublic] });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
