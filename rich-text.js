/* ============================================================
   rich-text.js - ĐỊNH DẠNG NỘI DUNG DÙNG CHUNG
   ------------------------------------------------------------
   - renderRich(s): đổi **đậm**, *nghiêng* thành HTML, giữ nguyên
     công thức $...$ / \(...\) để MathJax tự render sau.
   - attachToolbar(el): gắn 1 hàng nút định dạng phía trên 1 ô
     <textarea> hoặc <input> (chèn cú pháp tại vị trí con trỏ).
   - attachToolbarsIn(container): gắn toolbar cho mọi phần tử .rich.
   - Dùng ở: tao-de.html, ngan-hang.html, lam-bai.html
   ============================================================ */
(function () {
  'use strict';

  // Token bọc placeholder cho đoạn math: dùng ký tự điều khiển không bao giờ
  // xuất hiện trong chuỗi đã escape HTML, nên không đụng số/chữ thật.
  var TK = String.fromCharCode(1); // 

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Đổi **đậm** / *nghiêng* -> HTML; xuống dòng -> <br>.
  // Bảo vệ các đoạn công thức ($...$ và \(...\)) để dấu * trong công thức
  // (vd $a*b$) không bị hiểu nhầm thành in nghiêng, và để MathJax render sau.
  function renderRich(s) {
    if (s == null) return '';
    var text = escapeHtml(s);

    // 1) Tách các đoạn math ra, thay bằng placeholder an toàn
    var math = [];
    var stash = function (m) { math.push(m); return TK + (math.length - 1) + TK; };
    text = text.replace(/\$[^$\n]+\$/g, stash);        // $...$ trên một dòng
    text = text.replace(/\\\([\s\S]+?\\\)/g, stash);   // \(...\)

    // 2) Xuống dòng
    text = text.replace(/\n/g, '<br>');

    // 3) Đậm trước, nghiêng sau (để **...** không bị * nuốt mất)
    text = text.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    // 4) Trả lại các đoạn math nguyên văn
    text = text.replace(new RegExp(TK + '(\\d+)' + TK, 'g'), function (_, i) { return math[+i]; });
    return text;
  }

  // Chèn văn bản tại con trỏ; nếu có vùng chọn thì bọc quanh vùng chọn.
  function surround(el, before, after, placeholder) {
    el.focus();
    var start = el.selectionStart, end = el.selectionEnd;
    var val = el.value;
    var sel = val.slice(start, end) || (placeholder || '');
    var insert = before + sel + after;
    el.value = val.slice(0, start) + insert + val.slice(end);
    // Bôi đen phần nội dung giữa before/after để gõ đè tiếp
    var selStart = start + before.length;
    el.selectionStart = selStart;
    el.selectionEnd = selStart + sel.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var BUTTONS = [
    { label: 'B', title: 'In đậm', style: 'font-weight:bold', run: function (el) { surround(el, '**', '**', 'đậm'); } },
    { label: 'I', title: 'In nghiêng', style: 'font-style:italic', run: function (el) { surround(el, '*', '*', 'nghiêng'); } },
    { label: 'x²', title: 'Số mũ (lũy thừa)', run: function (el) { surround(el, '^{', '}', '2'); } },
    { label: 'x₂', title: 'Chỉ số dưới', run: function (el) { surround(el, '_{', '}', '2'); } },
    { label: '√', title: 'Căn thức', run: function (el) { surround(el, '\\sqrt{', '}', 'x'); } },
    { label: '½', title: 'Phân số', run: function (el) { surround(el, '\\frac{', '}{}', 'a'); } },
    { label: 'fx', title: 'Bọc công thức toán $…$', style: 'font-style:italic', run: function (el) { surround(el, '$', '$', 'x'); } }
  ];

  function attachToolbar(el) {
    if (!el || el.dataset.tbAttached === '1') return;
    el.dataset.tbAttached = '1';
    var bar = document.createElement('div');
    bar.className = 'rich-toolbar';
    bar.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin:2px 0 4px';
    BUTTONS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.title = b.title;
      btn.style.cssText = 'min-width:30px;padding:3px 8px;border:1px solid #ccc;border-radius:6px;' +
        'background:#fff;cursor:pointer;font-size:10.5pt;line-height:1.2;' + (b.style || '');
      btn.onmouseover = function () { btn.style.background = '#eef'; };
      btn.onmouseout = function () { btn.style.background = '#fff'; };
      btn.addEventListener('click', function () { b.run(el); });
      bar.appendChild(btn);
    });
    el.parentNode.insertBefore(bar, el);
  }

  function attachToolbarsIn(container) {
    if (!container) return;
    container.querySelectorAll('.rich').forEach(attachToolbar);
  }

  /* ---------- Ô ẢNH: dán link HOẶC tải ảnh lên GitHub ---------- */

  // Sinh HTML khối ảnh. linkId là id ô text giữ đường dẫn ảnh (giữ nguyên
  // để setVal/val cũ vẫn chạy). Các id phụ phái sinh từ linkId.
  function imageFieldHtml(linkId) {
    return '' +
      '<label>Hình ảnh (không bắt buộc)</label>' +
      '<input type="text" id="' + linkId + '" placeholder="Dán link ảnh, hoặc bấm ‘Tải ảnh lên’">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap">' +
        '<input type="file" accept="image/*" style="display:none" id="' + linkId + '_file" ' +
          'onchange="onPickImage(this,\'' + linkId + '\')">' +
        '<button type="button" class="btn btn-gray" ' +
          'onclick="document.getElementById(\'' + linkId + '_file\').click()">🖼️ Tải ảnh lên</button>' +
        '<span class="hint" id="' + linkId + '_status"></span>' +
      '</div>' +
      '<div id="' + linkId + '_prev" style="margin-top:6px"></div>';
  }

  function showImagePreview(linkId, src) {
    var prev = document.getElementById(linkId + '_prev');
    if (!prev) return;
    prev.innerHTML = src
      ? '<img src="' + escapeHtml(src) + '" alt="xem trước" ' +
        'style="max-width:200px;max-height:200px;border:1px solid #ddd;border-radius:8px">'
      : '';
  }

  async function onPickImage(fileInput, linkId) {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var status = document.getElementById(linkId + '_status');
    var setStatus = function (msg, color) { if (status) { status.textContent = msg; status.style.color = color || '#666'; } };
    setStatus('⏳ Đang tải ảnh lên GitHub...', '#666');
    try {
      if (!window.GitHubSync) throw new Error('Thiếu github-sync.js');
      var r = await window.GitHubSync.uploadImage(f);
      var link = document.getElementById(linkId);
      if (link) link.value = r.path;
      showImagePreview(linkId, r.dataUrl); // xem trước ngay bằng dữ liệu trên máy
      setStatus('✅ Đã tải lên: ' + r.path, '#2e7d32');
    } catch (e) {
      setStatus('❌ ' + e.message, '#c62828');
      if (/401|token/i.test(e.message) && window.GitHubSync) window.GitHubSync.clearToken();
    } finally {
      fileInput.value = '';
    }
  }

  window.renderRich = renderRich;
  window.attachToolbar = attachToolbar;
  window.attachToolbarsIn = attachToolbarsIn;
  window.imageFieldHtml = imageFieldHtml;
  window.showImagePreview = showImagePreview;
  window.onPickImage = onPickImage;
})();
