/* ============================================================
   auth.js - Dang nhap & phan quyen client
   ------------------------------------------------------------
   Admin password is no longer stored in this public file.
   Admin login is verified by /api/admin-login using .env values.
   Tai khoan giao vien (admin tao) dang nhap bang ten + mat khau;
   quyen cua tung nguoi do may chu tra ve va KIEM TRA LAI o moi API,
   phan hien/an nut o day chi de giao dien gon.
   ============================================================ */

const KiroAuth = {
  ROLE_KEY: 'AUTH_ROLE',
  STUDENT_KEY: 'AUTH_STUDENT',
  ADMIN_TOKEN_KEY: 'AUTH_ADMIN_TOKEN',
  ADMIN_EXPIRES_KEY: 'AUTH_ADMIN_EXPIRES_AT',
  _adminVerified: false,
  _session: null,

  getRole: function(){
    try { return sessionStorage.getItem(this.ROLE_KEY) || localStorage.getItem(this.ROLE_KEY) || ''; }
    catch(e){ return ''; }
  },

  getAdminToken: function(){
    try { return sessionStorage.getItem(this.ADMIN_TOKEN_KEY) || ''; }
    catch(e){ return ''; }
  },

  adminHeaders: function(){
    const token = this.getAdminToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  },

  // Đã đăng nhập quản trị (admin hoặc giáo viên) và máy chủ đã xác nhận phiên
  isStaff: function(){
    return this._adminVerified === true;
  },

  // Admin thật (mật khẩu ADMIN_PASSWORD)
  isAdmin: function(){
    return this._adminVerified === true && !!this._session && this._session.role === 'admin';
  },

  getSession: function(){
    return this._session;
  },

  // Quyền: admin có mọi quyền; giáo viên theo admin đặt. perm 'admin' = chỉ admin.
  can: function(perm){
    if (!this.isStaff()) return false;
    if (this.isAdmin()) return true;
    if (perm === 'admin') return false;
    return !!(this._session.perms && this._session.perms[perm]);
  },

  hasAdminToken: function(){
    return !!this.getAdminToken();
  },

  isStudent: function(){
    return this.getRole() === 'student';
  },

  isLoggedIn: function(){
    return this.isStudent() || this.hasAdminToken();
  },

  getStudent: function(){
    try {
      var raw = sessionStorage.getItem(this.STUDENT_KEY) || localStorage.getItem(this.STUDENT_KEY) || 'null';
      return JSON.parse(raw);
    }
    catch(e){ return null; }
  },

  // Trả về { ok, error }. Tên đăng nhập "admin" (hoặc bỏ trống) = admin.
  // Môn/lớp giáo viên được giao (admin: mọi môn). Ngân hàng: khtn_hoa/khtn_sinh/... thuộc khtn.
  allowedSubject: function(key){
    if (this.isAdmin()) return true;
    const s = this._session;
    if (!s) return false;
    key = String(key || '');
    return (s.subjects || []).indexOf(key.indexOf('khtn') === 0 ? 'khtn' : key) >= 0;
  },

  allowedGrade: function(grade){
    if (this.isAdmin()) return true;
    const grades = (this._session && this._session.grades) || [];
    return !grades.length || grades.indexOf(parseInt(grade, 10)) >= 0;
  },

  // Bỏ các lựa chọn môn/lớp ngoài phạm vi trong 1 ô <select> (máy chủ vẫn tự kiểm tra lại)
  limitSelect: function(sel, kind){
    if (!sel || this.isAdmin()) return;
    const self = this;
    Array.from(sel.options).forEach(function(opt){
      if (!opt.value) return;
      const ok = kind === 'grade' ? self.allowedGrade(opt.value) : self.allowedSubject(opt.value);
      if (!ok) opt.remove();
    });
  },

  loginStaff: async function(username, password){
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: String(username || ''), password: String(password || '') })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.token) return { ok: false, error: data.error || 'Sai tên đăng nhập hoặc mật khẩu.' };

    this.storeSession(data);
    return { ok: true };
  },

  loginAdmin: async function(password){
    return (await this.loginStaff('admin', password)).ok;
  },

  storeSession: function(data){
    sessionStorage.setItem(this.ADMIN_TOKEN_KEY, data.token);
    sessionStorage.setItem(this.ADMIN_EXPIRES_KEY, String(data.expiresAt || ''));
    sessionStorage.setItem(this.ROLE_KEY, data.role === 'teacher' ? 'teacher' : 'admin');
    try {
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.STUDENT_KEY);
    } catch(e){}
    sessionStorage.removeItem(this.STUDENT_KEY);
  },

  verifyAdmin: async function(){
    const token = this.getAdminToken();
    if (!token) {
      this._adminVerified = false;
      return false;
    }
    try {
      const res = await fetch('/api/admin-login', {
        method: 'GET',
        headers: this.adminHeaders(),
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      this._adminVerified = !!(res.ok && data.ok && data.admin);
      this._session = this._adminVerified ? data : null;
      if (!this._adminVerified && (res.status === 401 || res.status === 403)) this.clearAdmin();
      return this._adminVerified;
    } catch(e) {
      this._adminVerified = false;
      return false;
    }
  },

  clearAdmin: function(){
    try {
      sessionStorage.removeItem(this.ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(this.ADMIN_EXPIRES_KEY);
      sessionStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.ROLE_KEY);
    } catch(e){}
    this._adminVerified = false;
    this._session = null;
  },

  loginStudent: function(name, cls){
    name = (name || '').trim();
    cls = (cls || '').trim();
    if (!name || !cls) return false;

    this.clearAdmin();
    var info = JSON.stringify({ name: name, class: cls });
    sessionStorage.setItem(this.ROLE_KEY, 'student');
    sessionStorage.setItem(this.STUDENT_KEY, info);
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
      sessionStorage.removeItem(this.ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(this.ADMIN_EXPIRES_KEY);
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.STUDENT_KEY);
    } catch(e){}
    this._adminVerified = false;
    this._session = null;
  },

  requireLogin: function(){
    if (!this.isLoggedIn()){ window.location.href = 'login.html'; return false; }
    return true;
  },

  // perm: quyền cần có để vào trang ('admin' = chỉ admin; bỏ trống = admin hoặc giáo viên)
  requireAdmin: function(perm){
    if (!this.hasAdminToken()){
      alert('Khu vuc nay chi danh cho giao vien. Vui long dang nhap.');
      window.location.href = 'login.html';
      return false;
    }

    // Ẩn trang cho tới khi máy chủ xác nhận phiên (token giả không thấy được gì)
    const root = document.documentElement;
    root.style.visibility = 'hidden';
    const self = this;
    // KiroAuth.ready: trang dùng để chờ biết vai trò/quyền rồi mới chỉnh giao diện
    this.ready = self.verifyAdmin().then(function(ok){
      if (!ok) {
        alert('Phien dang nhap khong hop le hoac da het han. Vui long dang nhap lai.');
        window.location.href = 'login.html';
        return;
      }
      if (perm && !self.can(perm)) {
        alert('Tài khoản của bạn không có quyền vào trang này.');
        window.location.href = 'index.html';
        return;
      }
      root.style.visibility = '';
      return true;
    });
    return true;
  }
};

// const ở cấp trên cùng không gắn vào window; github-sync.js (tải/dọn ảnh) kiểm tra window.KiroAuth
window.KiroAuth = KiroAuth;
