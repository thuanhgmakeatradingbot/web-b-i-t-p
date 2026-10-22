const path = require('path');
const { decryptJsonFile, decryptJsonFileAsync } = require('./crypto-store');

let examListCache = null;
let examListLoadedAt = 0;
// Đề sửa trên web được lưu vào Vercel Blob; mỗi máy chủ Vercel giữ bản đệm riêng,
// nên đọc lại sau một lúc để mọi máy chủ thấy thay đổi.
const CACHE_MS = 15 * 1000;

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
  if (!examListCache || Date.now() - examListLoadedAt > CACHE_MS) {
    const filePath = 'api/_data/exam-list.enc.json';
    const data = await decryptJsonFileAsync(filePath, 'QUESTION_BANK_SECRET');
    examListCache = normalizeList(data);
    examListLoadedAt = Date.now();
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
  examListLoadedAt = nextList ? Date.now() : 0;
}

module.exports = {
  findExamById,
  findExamByIdAsync,
  getExamList,
  getExamListAsync,
  resetExamListCache
};
