/* ============================================================
   auth.js - Dang nhap & phan quyen client
   ------------------------------------------------------------
   Admin password is no longer stored in this public file.
   Admin login is verified by /api/admin-login using .env values.
   ============================================================ */

const KiroAuth = {
  ROLE_KEY: 'AUTH_ROLE',
  STUDENT_KEY: 'AUTH_STUDENT',
  ADMIN_TOKEN_KEY: 'AUTH_ADMIN_TOKEN',
  ADMIN_EXPIRES_KEY: 'AUTH_ADMIN_EXPIRES_AT',
  _adminVerified: false,

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

  isAdmin: function(){
    return this._adminVerified === true;
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

  loginAdmin: async function(password){
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: String(password || '') })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.token) return false;

    sessionStorage.setItem(this.ADMIN_TOKEN_KEY, data.token);
    sessionStorage.setItem(this.ADMIN_EXPIRES_KEY, String(data.expiresAt || ''));
    sessionStorage.setItem(this.ROLE_KEY, 'admin');
    try {
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem(this.STUDENT_KEY);
    } catch(e){}
    sessionStorage.removeItem(this.STUDENT_KEY);
    this._adminVerified = true;
    return true;
  },

  verifyAdmin: async function(){
    const token = this.getAdminToken();
    if (!token) {
      this._adminVerified = false;
      return false;
    }
    try {
      const res = await fetch('/api/admin-me', {
        method: 'GET',
        headers: this.adminHeaders(),
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      this._adminVerified = !!(res.ok && data.ok && data.admin);
      if (!this._adminVerified) this.clearAdmin();
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
  },

  requireLogin: function(){
    if (!this.isLoggedIn()){ window.location.href = 'login.html'; return false; }
    return true;
  },

  requireAdmin: function(){
    if (!this.hasAdminToken()){
      alert('Khu vuc nay chi danh cho giao vien. Vui long dang nhap admin.');
      window.location.href = 'login.html';
      return false;
    }

    const self = this;
    self.verifyAdmin().then(function(ok){
      if (!ok) {
        alert('Phien admin khong hop le hoac da het han. Vui long dang nhap lai.');
        window.location.href = 'login.html';
      }
    });
    return true;
  }
};
