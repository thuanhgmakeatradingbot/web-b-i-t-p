const { encryptJsonPayload } = require('./_lib/crypto-store');
const { getQuestionBankAsync, resetQuestionBankCache } = require('./_lib/bank-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');
const { requireAdmin, saveTextFile } = require('./_lib/admin-store');
const { validateQuestionItems } = require('./_lib/question-validation');

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const bank = await getQuestionBankAsync();
      return sendJson(res, 200, { ok: true, bank });
    }

    const body = await readJson(req);
    const bank = Array.isArray(body.bank) ? body.bank : null;
    if (!bank) return sendJson(res, 400, { ok: false, error: 'Missing bank array.' });
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
