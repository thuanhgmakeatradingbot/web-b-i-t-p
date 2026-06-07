/* ============================================================
   auth.js - ĐĂNG NHẬP & PHÂN QUYỀN (dùng chung cho cả web)
   ------------------------------------------------------------
   - Học sinh: đăng nhập bằng Họ tên + Lớp -> chỉ được làm bài.
   - Giáo viên (admin): đăng nhập bằng mật khẩu -> được tạo/sửa/xóa đề.

   ⚠️ LƯU Ý BẢO MẬT (đọc kỹ):
   Đây là web tĩnh nên KHÔNG thể bảo mật tuyệt đối. Cổng đăng nhập này
   đủ để ngăn học sinh vào khu vực admin, nhưng người rành kỹ thuật vẫn
   có thể vượt qua. Bảo vệ thật sự nằm ở chỗ: đề chính thức trên GitHub
   chỉ mình bạn push được.

   👉 ĐỔI MẬT KHẨU ADMIN:
   1. Mở web, vào trang đăng nhập, mở Console (F12) gõ:
        sha256('matkhau_moi_cua_ban')
   2. Copy chuỗi kết quả, dán vào ADMIN_PASSWORD_HASH bên dưới.
   (Mật khẩu mặc định hiện tại là: giaovien123 — hãy đổi ngay.)
   ============================================================ */

// Hash SHA-256 của mật khẩu admin (mặc định = "giaovien123")
const ADMIN_PASSWORD_HASH = 'e88d908c9e5872a47e8e4fdd686d7ed136b82f8c57f5a126fd8c5ab195f2e6d4';

/* ---------- SHA-256 thuần JS (chạy được cả khi mở file trực tiếp) ---------- */
function sha256(ascii){
  function rightRotate(value, amount){ return (value>>>amount) | (value<<(32-amount)); }
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var result = '';
  var words = [];
  var asciiBitLength = ascii.length * 8;

  var hash = sha256.h = sha256.h || [];
  var k = sha256.k = sha256.k || [];
  var primeCounter = k.length;

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++){
    if (!isComposite[candidate]){
      for (var i = 0; i < 313; i += candidate){ isComposite[i] = candidate; }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
    }
  }

  // Mã hóa chuỗi UTF-8
  ascii = unescape(encodeURIComponent(ascii));
  asciiBitLength = ascii.length * 8;

  hash = hash.slice(0, 8);
  var h = hash.slice(0);

  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (var i = 0; i < ascii.length; i++){
    var j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (var j = 0; j < words.length;){
    var w = words.slice(j, j += 16);
    var oldHash = h;
    h = h.slice(0, 8);

    for (var i = 0; i < 64; i++){
      var w15 = w[i - 15], w2 = w[i - 2];
      var a = h[0], e = h[4];
      var temp1 = h[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & h[5]) ^ ((~e) & h[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));

      h = [(temp1 + temp2) | 0].concat(h);
      h[4] = (h[4] + temp1) | 0;
    }

    for (var i = 0; i < 8; i++){
      h[i] = (h[i] + oldHash[i]) | 0;
    }
  }

  for (var i = 0; i < 8; i++){
    for (var j = 3; j + 1; j--){
      var b = (h[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/* ---------- API ĐĂNG NHẬP / PHÂN QUYỀN ---------- */
const KiroAuth = {
  ROLE_KEY: 'AUTH_ROLE',        // 'admin' | 'student'
  STUDENT_KEY: 'AUTH_STUDENT',  // {name, class}

  getRole: function(){
    try { return sessionStorage.getItem(this.ROLE_KEY) || localStorage.getItem(this.ROLE_KEY) || ''; } catch(e){ return ''; }
  },
  isAdmin: function(){ return this.getRole() === 'admin'; },
  isStudent: function(){ return this.getRole() === 'student'; },
  isLoggedIn: function(){ return this.isAdmin() || this.isStudent(); },

  getStudent: function(){
    try {
      var raw = sessionStorage.getItem(this.STUDENT_KEY) || localStorage.getItem(this.STUDENT_KEY) || 'null';
      return JSON.parse(raw);
    }
    catch(e){ return null; }
  },

  loginAdmin: function(password){
    if (sha256(String(password)) === ADMIN_PASSWORD_HASH){
      sessionStorage.setItem(this.ROLE_KEY, 'admin');
      try { localStorage.setItem(this.ROLE_KEY, 'admin'); } catch(e){}
      sessionStorage.removeItem(this.STUDENT_KEY);
      try { localStorage.removeItem(this.STUDENT_KEY); } catch(e){}
      return true;
    }
    return false;
  },

  loginStudent: function(name, cls){
    name = (name || '').trim();
    cls = (cls || '').trim();
    if (!name || !cls) return false;
    var info = JSON.stringify({ name: name, class: cls });
    sessionStorage.setItem(this.ROLE_KEY, 'student');
    sessionStorage.setItem(this.STUDENT_KEY, info);
    // Lưu thêm vào localStorage để chia sẻ giữa các tab và khi mở file:// trực tiếp
    try {
      localStorage.setItem(this.ROLE_KEY, 'student');
      localStorage.setItem(this.STUDENT_KEY, info);
    } catch(e){}
    return true;
  },

  logout: function(){
    try {
      sessionStorage.removeItem(this.ROLE_KEY);
      sessionStorage.removeItem(this.STUDENT_KEY);
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.STUDENT_KEY);
    } catch(e){}
  },

  // Gọi ở đầu trang cần đăng nhập. Nếu chưa đăng nhập -> chuyển về login.
  requireLogin: function(){
    if (!this.isLoggedIn()){ window.location.href = 'login.html'; return false; }
    return true;
  },
  // Gọi ở trang chỉ dành cho admin.
  requireAdmin: function(){
    if (!this.isAdmin()){
      alert('Khu vực này chỉ dành cho giáo viên. Vui lòng đăng nhập tài khoản giáo viên.');
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }
};
