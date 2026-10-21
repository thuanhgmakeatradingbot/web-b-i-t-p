const path = require('path');
const { decryptJsonFile, decryptJsonFileAsync } = require('./crypto-store');

let examListCache = null;

const EMPTY_LIST = { khtn: [], toan: [], hoa: [], sinh: [], vatly: [] };

function normalizeList(data) {
  return (Array.isArray(data) || !data || typeof data !== 'object')
    ? { khtn: [], toan: [], hoa: [], sinh: [], vatly: [] }
    : data;
}

function getExamList() {
  if (!examListCache) {
    const filePath = path.join(__dirname, '..', '_data', 'exam-list.enc.json');
    const data = decryptJsonFile(filePath, 'QUESTION_BANK_SECRET');
    examListCache = normalizeList(data);
  }
  return examListCache;
}

async function getExamListAsync() {
  if (!examListCache) {
    const filePath = 'api/_data/exam-list.enc.json';
    const data = await decryptJsonFileAsync(filePath, 'QUESTION_BANK_SECRET');
    examListCache = normalizeList(data);
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

async function findExamByIdAsync(id) {
  const list = await getExamListAsync();
  for (const subject of Object.keys(list || {})) {
    const found = (list[subject] || []).find(exam => exam && exam.id === id);
    if (found) return found;
  }
  return null;
}

function resetExamListCache(nextList) {
  examListCache = nextList || null;
}

module.exports = {
  findExamById,
  findExamByIdAsync,
  getExamList,
  getExamListAsync,
  resetExamListCache
};
