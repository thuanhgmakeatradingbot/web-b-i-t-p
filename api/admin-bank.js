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
      // Giáo viên chỉ thấy câu hỏi thuộc môn/lớp được giao
      return sendJson(res, 200, { ok: true, bank: ctx.isAdmin ? bank : bank.filter(q => ctx.bankItemInScope(q)) });
    }

    const body = await readJson(req);
    let bank = Array.isArray(body.bank) ? body.bank : null;
    if (!bank) return sendJson(res, 400, { ok: false, error: 'Missing bank array.' });
    if (!ctx.isAdmin) {
      // Giáo viên gửi lên phần của mình; câu ngoài phạm vi giữ nguyên như cũ
      if (body.githubToken) return sendJson(res, 403, { ok: false, error: 'Không dùng được githubToken với tài khoản giáo viên.' });
      if (bank.some(q => !ctx.bankItemInScope(q))) {
        return sendJson(res, 403, { ok: false, error: 'Có câu hỏi không thuộc môn/lớp bạn được giao.' });
      }
      const current = await getQuestionBankAsync();
      const mine = new Set(bank.map(q => q && q.id));
      if (current.some(q => !ctx.bankItemInScope(q) && mine.has(q.id))) {
        return sendJson(res, 403, { ok: false, error: 'Mã câu hỏi trùng với câu ngoài phạm vi của bạn.' });
      }
      bank = current.filter(q => !ctx.bankItemInScope(q)).concat(bank);
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
