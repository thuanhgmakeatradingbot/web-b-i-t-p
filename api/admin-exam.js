const { encryptJsonPayload } = require('./_lib/crypto-store');
const { getExamListAsync, resetExamListCache } = require('./_lib/exam-list-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');
const { buildPublicExamListText, publicExamList, requireAdmin, saveTextFile } = require('./_lib/admin-store');
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

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const badRequest = message => Object.assign(new Error(message), { statusCode: 400 });

// Áp các mục có trong meta vào 1 đề (mục nào không gửi thì giữ nguyên);
// không đụng tới câu hỏi/đáp án. Dùng cho cả sửa 1 đề và sửa hàng loạt.
function applyMeta(exam, meta) {
  if (meta.title !== undefined) {
    const title = text(meta.title, 200);
    if (!title) throw badRequest('Tên đề không được để trống.');
    exam.title = title;
  }
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
  // Mật khẩu riêng của đề: để trống = bỏ mật khẩu
  for (const key of ['examPassword', 'reviewPassword']) {
    if (meta[key] === undefined) continue;
    const value = text(meta[key], 100);
    if (value) exam[key] = value;
    else delete exam[key];
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

// Sửa tên & thông tin hiển thị của 1 đề.
function updateExamMeta(examList, id, meta) {
  if (meta.title === undefined) throw badRequest('Tên đề không được để trống.');
  for (const subject of Object.keys(examList || {})) {
    const exam = (examList[subject] || []).find(item => item.id === id);
    if (exam) return applyMeta(exam, meta);
  }
  return null;
}

function checkIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw badRequest('Chưa chọn đề nào.');
  if (ids.length > 500) throw badRequest('Chọn tối đa 500 đề một lần.');
  return new Set(ids.map(String));
}

// Sửa hàng loạt: change.set = các mục đặt cùng giá trị; change.titles = tên mới riêng
// từng đề (đổi toàn bộ tên theo mẫu {X}, trang chủ đã đánh số); sau đó thêm/bỏ chữ.
function bulkUpdateMeta(examList, ids, change) {
  const idSet = checkIds(ids);
  const set = change.set && typeof change.set === 'object' ? { ...change.set } : {};
  delete set.title;
  const titles = change.titles && typeof change.titles === 'object' ? change.titles : {};
  const prefix = text(change.titlePrefix, 100);
  const suffix = text(change.titleSuffix, 100);
  const remove = text(change.titleRemove, 100);
  let count = 0;
  for (const subject of Object.keys(examList || {})) {
    for (const exam of examList[subject] || []) {
      if (!idSet.has(exam.id)) continue;
      applyMeta(exam, set);
      let title = titles[exam.id] !== undefined ? text(titles[exam.id], 200) : String(exam.title || '');
      if (remove) title = title.split(remove).join(' ').replace(/\s{2,}/g, ' ').trim();
      if (prefix && !title.startsWith(prefix)) title = prefix + ' ' + title;
      if (suffix && !title.endsWith(suffix)) title = title + ' ' + suffix;
      applyMeta(exam, { title });
      count++;
    }
  }
  return count;
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const examList = await getExamListAsync();
      // ?meta=1: chỉ thông tin + mật khẩu từng đề (cho hộp Sửa thông tin), không kèm câu hỏi
      if (new URL(req.url, 'http://localhost').searchParams.get('meta') === '1') {
        const metaList = {};
        for (const subject of Object.keys(examList || {})) {
          metaList[subject] = (examList[subject] || []).map(({ items, ...meta }) => meta);
        }
        return sendJson(res, 200, { ok: true, examList: metaList });
      }
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
    } else if (body.bulkUpdate && typeof body.bulkUpdate === 'object') {
      const current = await getExamListAsync();
      examList = JSON.parse(JSON.stringify(current));
      updated = { count: bulkUpdateMeta(examList, body.bulkUpdate.ids, body.bulkUpdate) };
      if (!updated.count) return sendJson(res, 404, { ok: false, error: 'Không tìm thấy đề nào trong danh sách đã chọn.' });
    } else if (body.bulkDelete && typeof body.bulkDelete === 'object') {
      if (body.bulkDelete.confirm !== 'XOA') throw badRequest('Thiếu xác nhận xoá.');
      const idSet = checkIds(body.bulkDelete.ids);
      examList = JSON.parse(JSON.stringify(await getExamListAsync()));
      for (const subject of Object.keys(examList)) {
        const before = examList[subject].length;
        examList[subject] = examList[subject].filter(item => !idSet.has(item.id));
        removed += before - examList[subject].length;
      }
      if (!removed) return sendJson(res, 404, { ok: false, error: 'Không tìm thấy đề nào trong danh sách đã chọn.' });
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
    const exam = updated && updated.id ? (({ items, ...meta }) => meta)(updated) : undefined;
    const count = updated && updated.count;
    // Trả luôn danh sách công khai mới để trang chủ cập nhật ngay (không chờ bộ đệm máy chủ khác)
    sendJson(res, 200, { ok: true, removed, count, exam, examList: publicExamList(examList), saved: [savedEncrypted, savedPublic] });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
