const { encryptJsonPayload } = require('./_lib/crypto-store');
const { getQuestionBankAsync, resetQuestionBankCache } = require('./_lib/bank-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');
const { saveTextFile } = require('./_lib/admin-store');
const { requireStaff } = require('./_lib/staff-store');
const { validateQuestionItems } = require('./_lib/question-validation');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const ctx = await requireStaff(req, res, 'bank');
  if (!ctx) return;

  try {
    if (req.method === 'GET') {
      const bank = await getQuestionBankAsync();
      // Admin thấy cả người thêm câu (createdBy); giáo viên chỉ thấy câu thuộc môn/lớp được giao
      return sendJson(res, 200, {
        ok: true,
        bank: ctx.isAdmin ? bank : bank.filter(q => ctx.bankItemInScope(q)).map(({ createdBy, ...q }) => q)
      });
    }

    const body = await readJson(req);
    // Đọc kho mới nhất (không dùng bản đệm) để không ghi đè câu người khác vừa thêm
    resetQuestionBankCache(null);
    const current = await getQuestionBankAsync();
    const currentById = new Map(current.map(q => [q.id, q]));
    let bank;
    if (!ctx.isAdmin) {
      // Giáo viên CHỈ ĐƯỢC THÊM câu mới: không sửa, không xoá câu đã có trong kho
      if (!Array.isArray(body.addItems)) {
        return sendJson(res, 403, { ok: false, error: 'Tài khoản giáo viên chỉ được thêm câu hỏi mới, không sửa/xoá câu đã có.' });
      }
      if (!body.addItems.length) return sendJson(res, 400, { ok: false, error: 'Chưa có câu hỏi mới nào để lưu.' });
      if (body.addItems.length > 500) return sendJson(res, 400, { ok: false, error: 'Tối đa 500 câu mỗi lần lưu.' });
      const ids = new Set();
      for (const q of body.addItems) {
        if (!q || typeof q !== 'object' || !/^[A-Za-z0-9_.-]{1,120}$/.test(String(q.id || ''))) {
          return sendJson(res, 400, { ok: false, error: 'Câu hỏi thiếu mã hoặc mã không hợp lệ.' });
        }
        if (currentById.has(q.id) || ids.has(q.id)) {
          return sendJson(res, 403, { ok: false, error: 'Câu "' + q.id + '" đã có trong kho: giáo viên không được sửa câu đã lưu.' });
        }
        if (!ctx.bankItemInScope(q)) {
          return sendJson(res, 403, { ok: false, error: 'Có câu hỏi không thuộc môn/lớp bạn được giao.' });
        }
        ids.add(q.id);
      }
      const author = ctx.author();
      bank = current.concat(body.addItems.map(q => ({ ...q, createdBy: author })));
    } else {
      bank = Array.isArray(body.bank) ? body.bank : null;
      if (!bank) return sendJson(res, 400, { ok: false, error: 'Missing bank array.' });
      // Người thêm câu do máy chủ giữ: câu cũ lấy lại createdBy đã lưu, câu mới ghi là admin
      const author = ctx.author();
      bank = bank.map(q => {
        if (!q || typeof q !== 'object') return q;
        const { createdBy, ...rest } = q;
        const old = currentById.get(q.id);
        if (old && old.createdBy) return { ...rest, createdBy: old.createdBy };
        return old ? rest : { ...rest, createdBy: author };
      });
    }
    validateQuestionItems(bank, 'Question bank');

    // Nếu có githubToken trong request, dùng nó thay thế env var (chỉ lần này)
    if (body.githubToken) {
      const original = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = body.githubToken;
      try {
        const encrypted = encryptJsonPayload(bank, 'QUESTION_BANK_SECRET');
        const saved = await saveTextFile(
          'api/_data/question-bank.enc.json',
          JSON.stringify(encrypted),
          `Cap nhat ngan hang cau hoi (${bank.length} cau)`
        );
        resetQuestionBankCache(bank);
        return sendJson(res, 200, { ok: true, count: bank.length, saved });
      } finally {
        process.env.GITHUB_TOKEN = original;
      }
    }

    const encrypted = encryptJsonPayload(bank, 'QUESTION_BANK_SECRET');
    const saved = await saveTextFile(
      'api/_data/question-bank.enc.json',
      JSON.stringify(encrypted),
      `Cap nhat ngan hang cau hoi (${bank.length} cau)`
    );
    resetQuestionBankCache(bank);
    sendJson(res, 200, { ok: true, count: bank.length, saved });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
