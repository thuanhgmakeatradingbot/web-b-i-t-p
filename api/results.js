const { requireStaff } = require('./_lib/staff-store');
const { getExamListAsync } = require('./_lib/exam-list-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

function resultsConfig() {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL || '';
  const secret = process.env.RESULTS_SECRET || '';
  if (!scriptUrl || !secret) {
    const error = new Error('Missing GOOGLE_SCRIPT_URL or RESULTS_SECRET on server.');
    error.statusCode = 500;
    throw error;
  }
  return { scriptUrl, secret };
}

async function parseScriptResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('Apps Script did not return JSON.');
    invalid.statusCode = 502;
    throw invalid;
  }
}

// Cột "Môn" trong Sheet là tên môn của đề (vd "Hóa học", "Khoa học tự nhiên", "KHTN - Hóa").
function subjectKeyOfName(name) {
  const n = String(name || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  if (/khtn|khoa hoc tu nhien/.test(n)) return 'khtn';
  if (/toan/.test(n)) return 'toan';
  if (/hoa/.test(n)) return 'hoa';
  if (/sinh/.test(n)) return 'sinh';
  if (/vat ly|vat li|^ly|^li/.test(n)) return 'vatly';
  return '';
}

async function filterRowsForTeacher(ctx, rows) {
  const restrictedGrades = (ctx.teacher.grades || []).length > 0;
  let titles = null;
  if (restrictedGrades) {
    // Giới hạn theo lớp: chỉ giữ bài của các đề thuộc phạm vi (so theo tên đề)
    const list = await getExamListAsync();
    titles = new Set(Object.values(list || {}).flat().filter(exam => ctx.examInScope(exam)).map(exam => String(exam.title || '')));
  }
  return rows.filter(row => ctx.subjectAllowed(subjectKeyOfName(row.subject)) && (!titles || titles.has(String(row.exam || ''))));
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'DELETE'])) return;
  // Xem kết quả: admin hoặc giáo viên có quyền (chỉ thấy môn/lớp được giao). Xoá kết quả: chỉ admin.
  const ctx = await requireStaff(req, res, req.method === 'GET' ? 'viewResults' : 'admin');
  if (!ctx) return;

  try {
    const { scriptUrl, secret } = resultsConfig();

    if (req.method === 'GET') {
      const url = new URL(scriptUrl);
      url.searchParams.set('action', 'results');
      url.searchParams.set('secret', secret);

      const response = await fetch(url);
      const data = await parseScriptResponse(response);
      if (!response.ok || data.status !== 'success') {
        return sendJson(res, response.ok ? 502 : response.status, {
          ok: false,
          error: data.message || 'Could not load results.'
        });
      }

      if (!ctx.isAdmin) data.rows = await filterRowsForTeacher(ctx, data.rows || []);
      return sendJson(res, 200, data);
    }

    const body = await readJson(req, { maxBytes: 64 * 1024 });
    const deleteAll = body.scope === 'all';
    const rowNumbers = Array.isArray(body.rowNumbers)
      ? Array.from(new Set(body.rowNumbers.map(Number).filter(n => Number.isInteger(n) && n >= 2)))
      : [];

    if (!deleteAll && !rowNumbers.length) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Choose at least one submitted result to delete.'
      });
    }
    if (rowNumbers.length > 1000) {
      return sendJson(res, 400, { ok: false, error: 'Too many rows in one delete request.' });
    }

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deleteResults',
        secret,
        scope: deleteAll ? 'all' : 'selected',
        rowNumbers
      })
    });
    const data = await parseScriptResponse(response);
    if (!response.ok || data.status !== 'success') {
      return sendJson(res, response.ok ? 502 : response.status, {
        ok: false,
        error: data.message || 'Could not delete results.'
      });
    }

    sendJson(res, 200, {
      ok: true,
      status: 'success',
      deleted: Number(data.deleted) || 0
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
