// Tài khoản giáo viên (admin tạo) + kiểm tra quyền cho mọi API quản trị.
// - Admin = mật khẩu ADMIN_PASSWORD (biến môi trường), làm được mọi việc.
// - Giáo viên: tên đăng nhập + mật khẩu (băm scrypt), quyền & môn do admin đặt riêng từng người.
// Danh sách giáo viên lưu mã hoá AES-256-GCM ở api/_data/teachers.enc.json (Vercel Blob khi chạy thật).
// Quyền được đọc lại từ kho ở MỖI lần gọi API, nên admin đổi quyền / khoá / xoá là có hiệu lực ngay.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { BlobClient, createAdminToken, getBearerToken, saveTextFile, signAdminPayload, verifySignedPayload } = require('./admin-store');
const { encryptJsonPayload } = require('./crypto-store');
const { sendJson } = require('./http');

const scrypt = promisify(crypto.scrypt);
const FILE_PATH = 'api/_data/teachers.enc.json';
const SECRET_NAME = 'QUESTION_BANK_SECRET';
const CACHE_MS = 10 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;

const PERMISSIONS = {
  viewExams: 'Xem đề và mật khẩu đề',
  editPasswords: 'Sửa mật khẩu đề',
  editExams: 'Sửa thông tin đề đã đăng',
  deleteExams: 'Xoá đề',
  createExams: 'Tạo đề mới',
  viewResults: 'Xem kết quả học sinh',
  bank: 'Ngân hàng câu hỏi',
  uploadImages: 'Tải ảnh lên'
};
const DEFAULT_PERMS = { viewExams: true, editPasswords: true };

const SUBJECTS = {
  khtn: { name: 'Khoa học tự nhiên', grades: [6, 7, 8, 9] },
  toan: { name: 'Toán học', grades: [10, 11, 12] },
  hoa: { name: 'Hóa học', grades: [10, 11, 12] },
  sinh: { name: 'Sinh học', grades: [10, 11, 12] },
  vatly: { name: 'Vật lý', grades: [10, 11, 12] }
};

let cache = null;
let cacheAt = 0;

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

function cryptoKey() {
  const secret = process.env[SECRET_NAME];
  if (!secret) throw new Error(`Missing ${SECRET_NAME}`);
  return crypto.createHash('sha256').update(secret).digest();
}

function decrypt(content) {
  const payload = JSON.parse(content);
  if (payload.alg !== 'aes-256-gcm') throw new Error('Kho giáo viên sai định dạng.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
  const data = JSON.parse(plain);
  return Array.isArray(data.teachers) ? data.teachers : [];
}

// Khác readBlobFile: lỗi đọc/giải mã thì BÁO LỖI chứ không coi như kho trống,
// để lần lưu sau không lỡ tay xoá sạch tài khoản giáo viên.
async function readRaw() {
  if (BlobClient && process.env.BLOB_READ_WRITE_TOKEN) {
    const { list } = require('@vercel/blob');
    const result = await list({ prefix: 'api/_data/', limit: 1000 });
    const match = (result.blobs || [])
      .filter(b => b.pathname === FILE_PATH)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
    if (!match) return null;
    const res = await fetch(match.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Không đọc được kho giáo viên (' + res.status + ').');
    return res.text();
  }
  const local = path.join(process.cwd(), FILE_PATH);
  return fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : null;
}

async function loadTeachers(fresh) {
  if (!fresh && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const raw = await readRaw();
  cache = raw ? decrypt(raw) : [];
  cacheAt = Date.now();
  return cache;
}

async function saveTeachers(teachers) {
  const encrypted = encryptJsonPayload({ v: 1, teachers }, SECRET_NAME);
  await saveTextFile(FILE_PATH, JSON.stringify(encrypted), 'Cap nhat tai khoan giao vien');
  cache = teachers;
  cacheAt = Date.now();
}

// ===== Mật khẩu =====
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Vẫn băm để thời gian trả lời giống nhau (không dò được tên đăng nhập có tồn tại hay không)
    await scrypt(String(password), 'dummy-salt', 64, { N: 16384, r: 8, p: 1 });
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

function checkNewPassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw httpError(400, 'Mật khẩu phải có ít nhất 8 ký tự.');
  if (value.length > 100) throw httpError(400, 'Mật khẩu tối đa 100 ký tự.');
  return value;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

// ===== Phiên đăng nhập =====
function createTeacherToken(teacher) {
  const now = Date.now();
  const exp = now + SESSION_MS;
  const token = signAdminPayload({
    role: 'teacher',
    sub: teacher.id,
    ver: teacher.tokenVersion || 1,
    iat: now,
    exp,
    nonce: crypto.randomBytes(12).toString('base64url')
  });
  return { token, expiresAt: exp };
}

function publicTeacher(t) {
  const { passHash, ...rest } = t;
  return rest;
}

function buildContext(role, teacher) {
  const perms = role === 'admin' ? null : (teacher.perms || {});
  const subjects = role === 'admin' ? null : (teacher.subjects || []);
  const grades = role === 'admin' ? null : (teacher.grades || []).map(Number);
  const ctx = {
    role,
    teacher,
    isAdmin: role === 'admin',
    can(perm) {
      return role === 'admin' || (perm !== 'admin' && perms[perm] === true);
    },
    subjectAllowed(subjectKey) {
      return role === 'admin' || subjects.includes(subjectKey);
    },
    gradeAllowed(grade) {
      return role === 'admin' || !grades.length || grades.includes(parseInt(grade, 10));
    },
    examInScope(exam) {
      return !!exam && ctx.subjectAllowed(exam.subjectKey || 'khtn') && ctx.gradeAllowed(exam.grade);
    },
    // Ngân hàng: khtn_hoa / khtn_sinh / khtn_ly / khtn_all thuộc môn khtn
    bankItemInScope(q) {
      const key = String((q && q.subjectKey) || '');
      return !!q && ctx.subjectAllowed(key.startsWith('khtn') ? 'khtn' : key) && ctx.gradeAllowed(q.grade);
    },
    // Ghi người đăng đề / câu hỏi (máy chủ tự đặt, không tin dữ liệu trình duyệt gửi)
    author() {
      const at = new Date().toISOString();
      if (role === 'admin') return { id: 'admin', username: 'admin', name: 'Admin', at };
      return { id: teacher.id, username: teacher.username, name: teacher.name || teacher.username, at };
    },
    session() {
      if (role === 'admin') return { role, name: 'Admin', username: 'admin' };
      return {
        role,
        id: teacher.id,
        name: teacher.name || teacher.username,
        username: teacher.username,
        perms: { ...perms },
        subjects: [...subjects],
        grades: [...grades]
      };
    }
  };
  return ctx;
}

// Trả về ngữ cảnh phiên (admin / giáo viên) hoặc null nếu phiên không hợp lệ.
async function getStaffContext(req) {
  const payload = verifySignedPayload(getBearerToken(req));
  if (!payload) return null;
  if (payload.role === 'admin') return buildContext('admin', null);
  if (payload.role !== 'teacher') return null;
  const teachers = await loadTeachers();
  const teacher = teachers.find(t => t.id === payload.sub);
  if (!teacher || teacher.disabled || (teacher.tokenVersion || 1) !== payload.ver) return null;
  return buildContext('teacher', teacher);
}

// perm: tên quyền cần có, 'admin' = chỉ admin, bỏ trống = admin hoặc giáo viên đều được.
async function requireStaff(req, res, perm) {
  let ctx;
  try {
    ctx = await getStaffContext(req);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
    return null;
  }
  if (!ctx) {
    sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return null;
  }
  if (perm && !ctx.can(perm)) {
    sendJson(res, 403, { ok: false, error: 'Tài khoản của bạn không có quyền làm việc này.' });
    return null;
  }
  req.staff = ctx;
  return ctx;
}

// ===== Admin quản lý giáo viên =====
function cleanTeacherInput(input) {
  const name = String(input.name || '').trim().slice(0, 100);
  const perms = {};
  for (const key of Object.keys(PERMISSIONS)) perms[key] = !!(input.perms && input.perms[key]);
  const subjects = Array.from(new Set((Array.isArray(input.subjects) ? input.subjects : []).map(String)))
    .filter(key => SUBJECTS[key]);
  const grades = Array.from(new Set((Array.isArray(input.grades) ? input.grades : []).map(n => parseInt(n, 10))))
    .filter(n => n >= 1 && n <= 12)
    .sort((a, b) => a - b);
  return { name, perms, subjects, grades, disabled: !!input.disabled };
}

async function saveTeacher(input) {
  const teachers = (await loadTeachers(true)).map(t => ({ ...t }));
  const clean = cleanTeacherInput(input || {});
  const now = new Date().toISOString();
  let teacher = input.id ? teachers.find(t => t.id === String(input.id)) : null;
  if (input.id && !teacher) throw httpError(404, 'Không tìm thấy giáo viên.');

  if (!teacher) {
    const username = normalizeUsername(input.username);
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw httpError(400, 'Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.');
    }
    if (username === 'admin') throw httpError(400, 'Tên đăng nhập "admin" dành cho admin.');
    if (teachers.some(t => t.username === username)) throw httpError(400, 'Tên đăng nhập đã có người dùng.');
    teacher = {
      id: 'gv-' + crypto.randomBytes(8).toString('hex'),
      username,
      passHash: await hashPassword(checkNewPassword(input.password)),
      tokenVersion: 1,
      createdAt: now
    };
    teachers.push(teacher);
  } else if (input.password) {
    teacher.passHash = await hashPassword(checkNewPassword(input.password));
    teacher.tokenVersion = (teacher.tokenVersion || 1) + 1; // đặt lại mật khẩu -> đăng xuất phiên cũ
  }
  if (teacher.disabled !== clean.disabled && clean.disabled) {
    teacher.tokenVersion = (teacher.tokenVersion || 1) + 1;
  }
  Object.assign(teacher, clean, { updatedAt: now });
  if (!teacher.name) teacher.name = teacher.username;
  await saveTeachers(teachers);
  return publicTeacher(teacher);
}

async function deleteTeacher(id) {
  const teachers = await loadTeachers(true);
  const next = teachers.filter(t => t.id !== String(id || ''));
  if (next.length === teachers.length) throw httpError(404, 'Không tìm thấy giáo viên.');
  await saveTeachers(next);
}

async function listTeachers() {
  return (await loadTeachers(true)).map(publicTeacher);
}

// ===== Đăng nhập & đổi mật khẩu =====
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Trả về { role, token, expiresAt } hoặc null nếu sai.
async function login(usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  // Bỏ trống tên đăng nhập = admin (giữ tương thích cách đăng nhập cũ chỉ bằng mật khẩu)
  if (!username || username === 'admin') {
    if (!process.env.ADMIN_PASSWORD) throw httpError(500, 'Missing ADMIN_PASSWORD on server.');
    return safeEqual(password, process.env.ADMIN_PASSWORD) ? { role: 'admin', ...createAdminToken() } : null;
  }
  const teachers = await loadTeachers(true);
  const teacher = teachers.find(t => t.username === username);
  const ok = await checkPassword(password, teacher && teacher.passHash);
  if (!ok || !teacher || teacher.disabled) return null;
  return { role: 'teacher', ...createTeacherToken(teacher) };
}

async function changeOwnPassword(ctx, currentPassword, newPassword) {
  if (ctx.isAdmin) throw httpError(400, 'Mật khẩu admin nằm trong cấu hình máy chủ (ADMIN_PASSWORD trên Vercel), không đổi ở đây.');
  const next = checkNewPassword(newPassword);
  const teachers = (await loadTeachers(true)).map(t => ({ ...t }));
  const teacher = teachers.find(t => t.id === ctx.teacher.id);
  if (!teacher) throw httpError(404, 'Không tìm thấy tài khoản.');
  if (!(await checkPassword(currentPassword, teacher.passHash))) throw httpError(401, 'Mật khẩu hiện tại không đúng.');
  teacher.passHash = await hashPassword(next);
  teacher.tokenVersion = (teacher.tokenVersion || 1) + 1;
  teacher.updatedAt = new Date().toISOString();
  await saveTeachers(teachers);
  return createTeacherToken(teacher);
}

module.exports = {
  DEFAULT_PERMS,
  PERMISSIONS,
  SUBJECTS,
  changeOwnPassword,
  deleteTeacher,
  getStaffContext,
  listTeachers,
  login,
  requireStaff,
  saveTeacher
};
