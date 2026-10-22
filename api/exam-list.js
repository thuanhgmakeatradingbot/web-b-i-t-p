const { getExamListAsync } = require('./_lib/exam-list-store');
const { publicExamList } = require('./_lib/admin-store');
const { allowMethods, sendJson } = require('./_lib/http');

// Danh sách đề cho trang chủ: chỉ thông tin hiển thị (tên, thời gian, chủ đề...),
// không có câu hỏi/đáp án. Lấy từ dữ liệu mới nhất nên đề sửa/xóa trên web hiện ngay.
module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const examList = await getExamListAsync();
    sendJson(res, 200, { ok: true, examList: publicExamList(examList) });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};
