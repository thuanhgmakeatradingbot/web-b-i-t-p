const { allowMethods, readJson, sendJson } = require('./_lib/http');
const {
  DEFAULT_PERMS,
  PERMISSIONS,
  SUBJECTS,
  changeOwnPassword,
  deleteTeacher,
  listTeachers,
  login,
  requireStaff,
  saveTeacher
} = require('./_lib/staff-store');

const failures = new Map();
const MAX_FAILURES = 5;
// Theo tên đăng nhập: ngưỡng cao hơn để chặn dò mật khẩu từ nhiều máy
// mà người lạ cũng khó cố tình gõ sai để khoá tài khoản của người khác.
const MAX_USER_FAILURES = 20;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '');
  const first = forwarded.split(',')[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function loginState(key) {
  const now = Date.now();
  const state = failures.get(key);
  if (!state || now - state.firstAt > WINDOW_MS) {
    const fresh = { count: 0, firstAt: now, lockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return state;
}

function isLocked(key) {
  const state = loginState(key);
  return state.lockedUntil && Date.now() < state.lockedUntil;
}

function recordFailure(key, max) {
  const state = loginState(key);
  state.count += 1;
  if (state.count >= (max || MAX_FAILURES)) {
    state.lockedUntil = Date.now() + LOCK_MS;
    state.count = 0;
    state.firstAt = Date.now();
  }
}

// Một hàm máy chủ lo cả đăng nhập, phiên và quản lý giáo viên (gói Vercel Hobby giới hạn 12 hàm).
// GET                      : kiểm tra phiên hiện tại (admin hoặc giáo viên) + quyền
// GET  ?action=teachers    : danh sách giáo viên (chỉ admin)
// POST {username,password} : đăng nhập (bỏ trống username hoặc "admin" = admin)
// POST {action:'saveTeacher', teacher} / {action:'deleteTeacher', id}  : chỉ admin
// POST {action:'changePassword', currentPassword, newPassword}         : giáo viên tự đổi
async function handleGet(req, res) {
  const action = new URL(req.url, 'http://localhost').searchParams.get('action') || '';
  if (action === 'teachers') {
    if (!(await requireStaff(req, res, 'admin'))) return;
    return sendJson(res, 200, { ok: true, teachers: await listTeachers(), permissions: PERMISSIONS, defaultPerms: DEFAULT_PERMS, subjects: SUBJECTS });
  }
  const ctx = await requireStaff(req, res);
  if (!ctx) return;
  sendJson(res, 200, { ok: true, admin: true, ...ctx.session(), permissions: PERMISSIONS });
}

async function handleLogin(req, res, body) {
  const ipKey = 'ip:' + clientKey(req);
  const userKey = 'user:' + String(body.username || 'admin').trim().toLowerCase();
  if (isLocked(ipKey) || isLocked(userKey)) {
    return sendJson(res, 429, { ok: false, error: 'Đăng nhập sai nhiều lần, tạm khoá 10 phút. Vui lòng thử lại sau.' });
  }
  const session = await login(body.username, body.password || '');
  if (!session) {
    recordFailure(ipKey);
    recordFailure(userKey, MAX_USER_FAILURES);
    return sendJson(res, 401, { ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  failures.delete(ipKey);
  failures.delete(userKey);
  sendJson(res, 200, { ok: true, admin: true, ...session });
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    if (req.method === 'GET') return await handleGet(req, res);

    const body = await readJson(req, { maxBytes: 20 * 1024 });
    const action = String(body.action || 'login');

    if (action === 'login') return await handleLogin(req, res, body);

    if (action === 'saveTeacher') {
      if (!(await requireStaff(req, res, 'admin'))) return;
      const teacher = await saveTeacher(body.teacher || {});
      return sendJson(res, 200, { ok: true, teacher });
    }
    if (action === 'deleteTeacher') {
      if (!(await requireStaff(req, res, 'admin'))) return;
      await deleteTeacher(body.id);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'changePassword') {
      const ctx = await requireStaff(req, res);
      if (!ctx) return;
      const key = 'pw:' + clientKey(req);
      if (isLocked(key)) return sendJson(res, 429, { ok: false, error: 'Nhập sai nhiều lần, tạm khoá 10 phút.' });
      try {
        const session = await changeOwnPassword(ctx, body.currentPassword || '', body.newPassword || '');
        return sendJson(res, 200, { ok: true, ...session });
      } catch (error) {
        if (error.statusCode === 401) recordFailure(key);
        throw error;
      }
    }
    sendJson(res, 400, { ok: false, error: 'Unknown action.' });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
