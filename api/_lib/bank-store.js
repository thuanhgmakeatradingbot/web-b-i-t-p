const path = require('path');
const { decryptJsonFile } = require('./crypto-store');

let bankCache = null;

function getQuestionBank() {
  if (!bankCache) {
    const filePath = path.join(__dirname, '..', '_data', 'question-bank.enc.json');
    bankCache = decryptJsonFile(filePath, 'QUESTION_BANK_SECRET');
  }
  return bankCache;
}

function getQuestionByIdMap() {
  const map = new Map();
  for (const q of getQuestionBank()) map.set(q.id, q);
  return map;
}

function resetQuestionBankCache(nextBank) {
  bankCache = Array.isArray(nextBank) ? nextBank : null;
}

module.exports = { getQuestionBank, getQuestionByIdMap, resetQuestionBankCache };
