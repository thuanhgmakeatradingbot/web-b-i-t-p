const path = require('path');
const { decryptJsonFile, decryptJsonFileAsync } = require('./crypto-store');

let bankCache = null;

// Sync version - chỉ đọc file local (dùng khi không có Blob)
function getQuestionBank() {
  if (!bankCache) {
    const filePath = path.join(__dirname, '..', '_data', 'question-bank.enc.json');
    bankCache = decryptJsonFile(filePath, 'QUESTION_BANK_SECRET');
  }
  return bankCache;
}

// Async version - đọc từ Vercel Blob trước, fallback local
async function getQuestionBankAsync() {
  if (!bankCache) {
    const filePath = 'api/_data/question-bank.enc.json';
    bankCache = await decryptJsonFileAsync(filePath, 'QUESTION_BANK_SECRET');
  }
  return bankCache;
}

async function getQuestionByIdMapAsync() {
  const map = new Map();
  const bank = await getQuestionBankAsync();
  for (const q of bank) map.set(q.id, q);
  return map;
}

function getQuestionByIdMap() {
  const map = new Map();
  for (const q of getQuestionBank()) map.set(q.id, q);
  return map;
}

function resetQuestionBankCache(nextBank) {
  bankCache = Array.isArray(nextBank) ? nextBank : null;
}

module.exports = {
  getQuestionBank,
  getQuestionBankAsync,
  getQuestionByIdMap,
  getQuestionByIdMapAsync,
  resetQuestionBankCache
};
