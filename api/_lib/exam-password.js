const crypto = require('crypto');

// Mật khẩu riêng từng đề (lưu trong danh sách đề đã mã hoá, không bao giờ gửi ra trang công khai):
//   exam.examPassword   -> học sinh phải nhập mới mở được đề (trống = không cần)
//   exam.reviewPassword -> mật khẩu xem đáp án của riêng đề đó (trống = dùng mật khẩu chung)

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '');
  return forwarded.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Nhập sai quá nhiều lần thì khoá tạm (theo IP + loại mật khẩu)
function createLimiter({ maxFailures = 5, windowMs = 10 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map();
  function state(key) {
    const now = Date.now();
    const current = failures.get(key);
    if (!current || now - current.firstAt > windowMs) {
      const fresh = { count: 0, firstAt: now, lockedUntil: 0 };
      failures.set(key, fresh);
      return fresh;
    }
    return current;
  }
  return {
    isLocked(key) {
      const s = state(key);
      return !!(s.lockedUntil && Date.now() < s.lockedUntil);
    },
    fail(key) {
      const s = state(key);
      s.count += 1;
      if (s.count >= maxFailures) {
        s.count = 0;
        s.firstAt = Date.now();
        s.lockedUntil = Date.now() + lockMs;
      }
    },
    reset(key) {
      failures.delete(key);
    }
  };
}

module.exports = { clientKey, createLimiter, safeEqual };
