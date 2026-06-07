/* ============================================================
   github-sync.js - ĐẨY ĐỀ LÊN GITHUB TỪ TRÌNH DUYỆT
   ------------------------------------------------------------
   Dùng GitHub API để cập nhật trực tiếp file danh-sach-de.js
   trên repo, ngay khi bấm "Xác nhận đẩy lên GitHub".

   ⚠️ BẢO MẬT - ĐỌC KỸ:
   - Cần 1 GitHub Personal Access Token (PAT) có quyền ghi nội dung repo.
   - Token KHÔNG được lưu trong bất kỳ file nào đẩy lên GitHub.
     Nó chỉ lưu trong bộ nhớ trình duyệt máy bạn (localStorage).
   - Repo này công khai -> nếu token lọt vào file công khai, người khác
     có thể chiếm quyền sửa repo. .gitignore đã chặn các file token.

   👉 CÁCH TẠO TOKEN (fine-grained, an toàn nhất):
   1. Vào https://github.com/settings/personal-access-tokens/new
   2. Token name: tùy ý. Expiration: chọn thời hạn.
   3. Repository access: "Only select repositories" -> chọn repo web-b-i-t-p
   4. Permissions -> Repository permissions -> Contents: Read and write
   5. Generate token -> COPY (chuỗi bắt đầu bằng github_pat_...)
   6. Vào trình tạo đề, dán token khi được hỏi.
   ============================================================ */

const GITHUB_CONFIG = {
  owner: 'thuanhgmakeatradingbot',
  repo: 'web-b-i-t-p',
  branch: 'main',
  path: 'danh-sach-de.js',
  tokenKey: 'GITHUB_TOKEN'
};

// ---- Mã hóa/giải mã base64 an toàn cho tiếng Việt (UTF-8) ----
function b64EncodeUtf8(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64DecodeUtf8(b64){ return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }

// ---- Tách object EXAM_LIST từ nội dung file danh-sach-de.js ----
function parseExamListFromText(text){
  const i = text.indexOf('window.EXAM_LIST');
  if (i < 0) throw new Error('File trên GitHub không đúng định dạng (thiếu window.EXAM_LIST).');
  const start = text.indexOf('{', i);
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Không đọc được dữ liệu đề từ file GitHub.');
  return JSON.parse(text.slice(start, end + 1));
}

// ---- Dựng lại nội dung file danh-sach-de.js từ object ----
function buildExamListFileText(list){
  const header =
`/* ============================================================
   DANH SÁCH ĐỀ THI - NGUỒN DỮ LIỆU DUY NHẤT
   ------------------------------------------------------------
   - File này được cập nhật tự động khi bấm "Đẩy lên GitHub".
   - Đề mới mở bằng lam-bai.html?id=...
   - Đề cũ (có "link") mở file riêng như trước.
   ============================================================ */

window.EXAM_LIST = `;
  return header + JSON.stringify(list, null, 2) + ';\n';
}

// ---- Tách mảng QUESTION_BANK từ nội dung file ngan-hang.js ----
function parseBankFromText(text){
  const i = text.indexOf('window.QUESTION_BANK');
  if (i < 0) throw new Error('File ngân hàng không đúng định dạng (thiếu window.QUESTION_BANK).');
  const start = text.indexOf('[', i);
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('Không đọc được dữ liệu ngân hàng từ GitHub.');
  return JSON.parse(text.slice(start, end + 1));
}

// ---- Dựng lại nội dung file ngan-hang.js từ mảng ----
function buildBankFileText(arr){
  const header =
`/* ============================================================
   ngan-hang.js - NGÂN HÀNG CÂU HỎI (NGUỒN DỮ LIỆU)
   ------------------------------------------------------------
   - File này được cập nhật tự động khi bấm "Đẩy lên GitHub".
   - Dùng "ngan-hang.html" để thêm/sửa/xóa câu hỏi.
   ============================================================ */

window.QUESTION_BANK = `;
  return header + JSON.stringify(arr, null, 2) + ';\n';
}

const GitHubSync = {
  getToken(){ try { return localStorage.getItem(GITHUB_CONFIG.tokenKey) || ''; } catch(e){ return ''; } },
  setToken(t){ try { localStorage.setItem(GITHUB_CONFIG.tokenKey, (t||'').trim()); } catch(e){} },
  hasToken(){ return !!this.getToken(); },
  clearToken(){ try { localStorage.removeItem(GITHUB_CONFIG.tokenKey); } catch(e){} },

  // Đảm bảo có token; nếu chưa có thì hỏi 1 lần
  ensureToken(){
    let t = this.getToken();
    if (!t){
      t = prompt('Dán GitHub Token (chỉ nhập 1 lần, lưu trên máy này).\nHướng dẫn tạo token xem trong file github-sync.js:');
      if (t) this.setToken(t.trim());
    }
    return this.getToken();
  },

  _headers(){
    return {
      'Authorization': 'Bearer ' + this.getToken(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  },

  // ---- Helper chung: đọc/ghi 1 file bất kỳ trên repo theo path ----
  async _getRaw(path){
    const { owner, repo, branch } = GITHUB_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
    const res = await fetch(url, { headers: this._headers() });
    if (res.status === 404) return { sha: null, text: '' };
    if (res.status === 401) throw new Error('Token không hợp lệ hoặc hết hạn (401). Hãy nhập lại token.');
    if (!res.ok) throw new Error('Lỗi đọc file GitHub: ' + res.status + ' - ' + (await res.text()));
    const data = await res.json();
    return { sha: data.sha, text: b64DecodeUtf8(data.content || '') };
  },
  async _putRaw(path, content, sha, message){
    const { owner, repo, branch } = GITHUB_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = { message: message || ('Cập nhật ' + path), content: b64EncodeUtf8(content), branch: branch };
    if (sha) body.sha = sha;
    const res = await fetch(url, { method: 'PUT', headers: this._headers(), body: JSON.stringify(body) });
    if (res.status === 401) throw new Error('Token không hợp lệ hoặc hết hạn (401).');
    if (res.status === 403) throw new Error('Token thiếu quyền ghi (403). Cần quyền Contents: Read and write.');
    if (res.status === 409) throw new Error('Xung đột phiên bản (409). Thử lại lần nữa.');
    if (!res.ok) throw new Error('Lỗi ghi file GitHub: ' + res.status + ' - ' + (await res.text()));
    return res.json();
  },

  // Lấy file hiện tại trên GitHub -> { sha, list }
  async getFile(){
    const { owner, repo, path, branch } = GITHUB_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
    const res = await fetch(url, { headers: this._headers() });
    if (res.status === 404) return { sha: null, list: { khtn:[], toan:[], hoa:[], sinh:[], vatly:[] } };
    if (res.status === 401) throw new Error('Token không hợp lệ hoặc hết hạn (401). Hãy nhập lại token.');
    if (!res.ok) throw new Error('Lỗi đọc file GitHub: ' + res.status + ' - ' + (await res.text()));
    const data = await res.json();
    const text = b64DecodeUtf8(data.content || '');
    let list;
    try { list = parseExamListFromText(text); }
    catch(e){ list = { khtn:[], toan:[], hoa:[], sinh:[], vatly:[] }; }
    return { sha: data.sha, list };
  },

  // Ghi file mới lên GitHub
  async putFile(list, sha, message){
    const { owner, repo, path, branch } = GITHUB_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message: message || 'Cập nhật danh sách đề',
      content: b64EncodeUtf8(buildExamListFileText(list)),
      branch: branch
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, { method: 'PUT', headers: this._headers(), body: JSON.stringify(body) });
    if (res.status === 401) throw new Error('Token không hợp lệ hoặc hết hạn (401).');
    if (res.status === 403) throw new Error('Token thiếu quyền ghi (403). Cần quyền Contents: Read and write.');
    if (res.status === 409) throw new Error('Xung đột phiên bản (409). Thử lại lần nữa.');
    if (!res.ok) throw new Error('Lỗi ghi file GitHub: ' + res.status + ' - ' + (await res.text()));
    return res.json();
  },

  // Đẩy 1 đề lên GitHub (thêm mới hoặc cập nhật theo id)
  async pushExam(exam, message){
    if (!this.ensureToken()) throw new Error('Bạn chưa nhập token.');
    const { sha, list } = await this.getFile();
    ['khtn','toan','hoa','sinh','vatly'].forEach(k => { if (!list[k]) list[k] = []; });
    // Xóa bản cũ cùng id (ở mọi môn) rồi thêm bản mới
    Object.keys(list).forEach(k => { list[k] = (list[k]||[]).filter(e => e.id !== exam.id); });
    const key = exam.subjectKey || 'khtn';
    if (!list[key]) list[key] = [];
    const clean = JSON.parse(JSON.stringify(exam));
    delete clean._local; // bỏ cờ nội bộ
    list[key].push(clean);
    return this.putFile(list, sha, message || ('Thêm/cập nhật đề: ' + (exam.title || exam.id)));
  },

  // Xóa 1 đề khỏi GitHub theo id. Trả về true nếu có thay đổi.
  async deleteExam(id, title){
    if (!this.ensureToken()) throw new Error('Bạn chưa nhập token.');
    const { sha, list } = await this.getFile();
    let removed = 0;
    Object.keys(list).forEach(k => {
      const before = (list[k]||[]).length;
      list[k] = (list[k]||[]).filter(e => e.id !== id);
      removed += before - list[k].length;
    });
    if (removed === 0) return false; // không có trên GitHub -> khỏi tạo commit thừa
    await this.putFile(list, sha, 'Xóa đề: ' + (title || id));
    return true;
  },

  // ===== NGÂN HÀNG CÂU HỎI (file ngan-hang.js) =====
  BANK_PATH: 'ngan-hang.js',

  async getBank(){
    const { sha, text } = await this._getRaw(this.BANK_PATH);
    let arr = [];
    if (text){ try { arr = parseBankFromText(text); } catch(e){ arr = []; } }
    return { sha: sha, arr: Array.isArray(arr) ? arr : [] };
  },

  // Đẩy toàn bộ mảng câu hỏi lên (ghi đè) - dùng khi sync nhiều thay đổi 1 lần
  async pushBankAll(arr, message){
    if (!this.ensureToken()) throw new Error('Bạn chưa nhập token.');
    const { sha } = await this.getBank();
    const clean = JSON.parse(JSON.stringify(arr)).map(q => { delete q._local; return q; });
    await this._putRaw(this.BANK_PATH, buildBankFileText(clean), sha, message || 'Cập nhật ngân hàng câu hỏi');
    return true;
  },

  // Thêm/cập nhật 1 câu hỏi theo id
  async pushBankQuestion(q, message){
    if (!this.ensureToken()) throw new Error('Bạn chưa nhập token.');
    const { sha, arr } = await this.getBank();
    const next = arr.filter(x => x.id !== q.id);
    const clean = JSON.parse(JSON.stringify(q)); delete clean._local;
    next.push(clean);
    await this._putRaw(this.BANK_PATH, buildBankFileText(next), sha, message || ('Thêm/sửa câu hỏi: ' + q.id));
    return true;
  },

  // Xóa 1 câu hỏi khỏi ngân hàng theo id
  async deleteBankQuestion(id){
    if (!this.ensureToken()) throw new Error('Bạn chưa nhập token.');
    const { sha, arr } = await this.getBank();
    const next = arr.filter(x => x.id !== id);
    if (next.length === arr.length) return false;
    await this._putRaw(this.BANK_PATH, buildBankFileText(next), sha, 'Xóa câu hỏi: ' + id);
    return true;
  }
};
