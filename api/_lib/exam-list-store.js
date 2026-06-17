const path = require('path');
const { decryptJsonFile } = require('./crypto-store');

let examListCache = null;

function getExamList() {
  if (!examListCache) {
    const filePath = path.join(__dirname, '..', '_data', 'exam-list.enc.json');
    examListCache = decryptJsonFile(filePath, 'QUESTION_BANK_SECRET');
  }
  return examListCache;
}

function findExamById(id) {
  const list = getExamList();
  for (const subject of Object.keys(list || {})) {
    const found = (list[subject] || []).find(exam => exam && exam.id === id);
    if (found) return found;
  }
  return null;
}

function resetExamListCache(nextList) {
  examListCache = nextList || null;
}

module.exports = { findExamById, getExamList, resetExamListCache };
