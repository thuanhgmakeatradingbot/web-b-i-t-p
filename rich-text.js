/* ============================================================
   rich-text.js - ĐỊNH DẠNG NỘI DUNG DÙNG CHUNG
   ------------------------------------------------------------
   - renderRich(s): đổi **đậm**, *nghiêng* thành HTML, giữ nguyên
     công thức $...$ / \(...\) để MathJax tự render sau.
   - attachToolbar(el): gắn 1 hàng nút định dạng phía trên 1 ô
     <textarea> hoặc <input> (chèn cú pháp tại vị trí con trỏ) +
     khung XEM TRƯỚC SỐNG bên dưới (thấy ký hiệu ngay khi gõ).
   - attachMathInput(el): bản gọn cho ô đáp án/phương án — chỉ có
     nút "Công thức" (mở bảng công thức trực quan) + xem trước.
   - openMathEditor(el): mở bảng công thức trực quan (MathLive) kiểu
     máy tính; dựng công thức thấy ký hiệu luôn rồi chèn vào ô.
   - attachToolbarsIn(container): gắn cho .rich (đầy đủ) và .rich-math
     (gọn). Dùng ở: tao-de.html, ngan-hang.html, lam-bai.html.
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

  // Con trỏ có đang nằm TRONG một vùng công thức $...$ hay không.
  // Đếm số dấu $ chưa-escape đứng trước con trỏ; lẻ = đang ở trong.
  function insideMath(value, pos) {
    var n = 0;
    for (var i = 0; i < pos; i++) {
      if (value[i] === '$' && value[i - 1] !== '\\') n++;
    }
    return n % 2 === 1;
  }

  // Chèn công thức TOÁN/HOÁ. Nếu con trỏ đang ở trong $...$ thì chèn LaTeX
  // trần (tránh lồng $...$); nếu ở ngoài thì TỰ BỌC $...$ để MathJax render
  // được (đây là lý do trước đây bấm nút chỉ ra chữ thô như \sqrt{x}).
  // Có vùng chọn thì bọc luôn vùng chọn vào trong công thức.
  function insertMath(el, before, after, placeholder) {
    el.focus();
    var start = el.selectionStart, end = el.selectionEnd;
    var val = el.value;
    var sel = val.slice(start, end) || (placeholder || '');
    var wrap = !insideMath(val, start);
    var pre = wrap ? '$' : '';
    var post = wrap ? '$' : '';
    var insert = pre + before + sel + after + post;
    el.value = val.slice(0, start) + insert + val.slice(end);
    // Bôi đen phần nội dung ngay sau "before" để gõ đè tiếp
    var selStart = start + pre.length + before.length;
    el.selectionStart = selStart;
    el.selectionEnd = selStart + sel.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- XEM TRƯỚC SỐNG (thấy ký hiệu ngay khi gõ) ---------- */

  // Vị trí chèn khung xem trước: nếu ô nằm trong 1 dòng đáp án/ý (flex ngang)
  // thì đặt khung NGAY DƯỚI cả dòng cho gọn; nếu không thì đặt ngay sau ô.
  function previewAnchor(el) {
    var row = el.closest ? el.closest('.opt-row, .tf-row') : null;
    return row || el;
  }

  // Tạo (1 lần) khung xem trước.
  function ensurePreview(el) {
    if (el._mathPreview) return el._mathPreview;
    var p = document.createElement('div');
    p.className = 'rich-preview';
    p.style.cssText = 'display:none;margin:3px 0 8px;padding:7px 11px;background:#f6f9ff;' +
      'border:1px dashed #c7d3f2;border-radius:8px;font-size:11.5pt;line-height:1.7;color:#1a1a1a;' +
      'overflow-x:auto';
    var anchor = previewAnchor(el);
    if (anchor.parentNode) anchor.parentNode.insertBefore(p, anchor.nextSibling);
    el._mathPreview = p;
    return p;
  }

  // Cập nhật khung xem trước: render **đậm**/công thức rồi gọi MathJax.
  function updatePreview(el) {
    var p = ensurePreview(el);
    var v = el.value || '';
    if (!v.trim()) { p.style.display = 'none'; p.innerHTML = ''; return; }
    p.style.display = 'block';
    p.innerHTML = '<span style="color:#7a86b8;font-size:9.5pt;user-select:none">Xem trước: </span>' + renderRich(v);
    if (window.typesetMath) window.typesetMath(p);
  }

  // Gắn nghe sự kiện gõ (có chống dội) để cập nhật xem trước.
  function wirePreview(el) {
    if (el.dataset.previewWired === '1') return;
    el.dataset.previewWired = '1';
    var t = null;
    el.addEventListener('input', function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { updatePreview(el); }, 180);
    });
    // Hiện luôn nếu ô đã có sẵn nội dung (lúc mở "Sửa câu hỏi")
    if (el.value && el.value.trim()) updatePreview(el);
  }

  /* ---------- BẢNG CÔNG THỨC TRỰC QUAN (MathLive) ---------- */

  var mlState = { el: null, start: 0, end: 0, overlay: null, field: null };

  // Tạo (1 lần) hộp thoại chứa <math-field> của MathLive.
  function buildMathModal() {
    if (mlState.overlay) return;

    // QUAN TRỌNG: bàn phím công thức của MathLive (.ML__keyboard) mặc định
    // z-index=105, thấp hơn lớp nền hộp thoại (99999) nên bị nền che -> bấm
    // phím không ăn. Nâng z-index bàn phím lên trên mọi thứ để bấm được.
    var kbFix = document.createElement('style');
    kbFix.textContent = '.ML__keyboard{z-index:2147483600 !important}';
    document.head.appendChild(kbFix);

    var ov = document.createElement('div');
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);' +
      'z-index:99999;align-items:center;justify-content:center;padding:16px';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:14px;max-width:680px;width:100%;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.3);padding:20px;font-family:inherit';
    panel.innerHTML =
      '<div style="font-size:14pt;font-weight:700;margin-bottom:4px">🧮 Soạn công thức</div>' +
      '<div style="font-size:10.5pt;color:#666;margin-bottom:12px">Bấm vào ô bên dưới để hiện bàn phím công thức. ' +
      'Gõ phím thường cũng được: <code>/</code> = phân số, <code>^</code> = mũ, <code>sqrt</code> = căn.</div>';
    var mf = document.createElement('math-field');
    mf.style.cssText = 'display:block;width:100%;min-height:64px;font-size:22pt;padding:10px 12px;' +
      'border:2px solid #1a1a1a;border-radius:10px;background:#fff';
    panel.appendChild(mf);
    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:16px';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Huỷ';
    cancel.style.cssText = 'padding:10px 18px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-size:11pt';
    var ok = document.createElement('button');
    ok.type = 'button'; ok.textContent = '✓ Chèn vào ô';
    ok.style.cssText = 'padding:10px 20px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;cursor:pointer;font-weight:700;font-size:11pt';
    btns.appendChild(cancel); btns.appendChild(ok);
    panel.appendChild(btns);
    ov.appendChild(panel);
    document.body.appendChild(ov);

    cancel.addEventListener('click', closeMathModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeMathModal(); });
    ok.addEventListener('click', confirmMathModal);

    mlState.overlay = ov; mlState.field = mf;
  }

  function closeMathModal() {
    if (mlState.overlay) mlState.overlay.style.display = 'none';
    mlState.el = null;
  }

  // Chèn LaTeX từ bảng công thức vào ô đích (tại vị trí con trỏ đã lưu).
  function confirmMathModal() {
    var el = mlState.el, mf = mlState.field;
    if (!el || !mf) { closeMathModal(); return; }
    var latex = (mf.value || '').trim();
    if (!latex) { closeMathModal(); return; }
    var val = el.value;
    var start = mlState.start, end = mlState.end;
    // Không bọc $ nếu con trỏ đang ở trong một vùng $...$ sẵn có.
    var wrap = !insideMath(val, start);
    var ins = (wrap ? '$' : '') + latex + (wrap ? '$' : '');
    el.value = val.slice(0, start) + ins + val.slice(end);
    var pos = start + ins.length;
    el.selectionStart = el.selectionEnd = pos;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    closeMathModal();
    el.focus();
  }

  // Mở bảng công thức cho ô el. Nếu vùng đang chọn là $...$ thì nạp sẵn để sửa.
  function openMathEditor(el) {
    if (!el) return;
    if (!(window.customElements && customElements.get('math-field'))) {
      alert('Bảng công thức đang tải, vui lòng thử lại sau giây lát.');
      return;
    }
    buildMathModal();
    mlState.el = el;
    mlState.start = el.selectionStart;
    mlState.end = el.selectionEnd;
    var sel = (el.value || '').slice(mlState.start, mlState.end);
    var m = /^\$([\s\S]+)\$$/.exec(sel);   // sửa lại nếu đang chọn đúng 1 công thức $...$
    mlState.field.value = m ? m[1] : '';
    mlState.overlay.style.display = 'flex';
    setTimeout(function () { try { mlState.field.focus(); } catch (e) {} }, 30);
  }

  // Nút "Công thức" dùng chung cho cả 2 loại thanh công cụ.
  function makeMathButton(el) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🧮 Công thức';
    btn.title = 'Mở bảng công thức trực quan (kiểu máy tính)';
    btn.style.cssText = 'padding:3px 10px;border:1px solid #1a1a1a;border-radius:6px;' +
      'background:#1a1a1a;color:#fff;cursor:pointer;font-size:10.5pt;line-height:1.2;font-weight:600';
    btn.addEventListener('click', function () { openMathEditor(el); });
    return btn;
  }

  var BUTTONS = [
    { label: 'B', title: 'In đậm', style: 'font-weight:bold', run: function (el) { surround(el, '**', '**', 'đậm'); } },
    { label: 'I', title: 'In nghiêng', style: 'font-style:italic', run: function (el) { surround(el, '*', '*', 'nghiêng'); } },
    { label: 'x²', title: 'Số mũ (lũy thừa)', run: function (el) { insertMath(el, '', '^{2}', 'x'); } },
    { label: 'x₂', title: 'Chỉ số dưới', run: function (el) { insertMath(el, '', '_{2}', 'x'); } },
    { label: '√', title: 'Căn thức', run: function (el) { insertMath(el, '\\sqrt{', '}', 'x'); } },
    { label: '½', title: 'Phân số', run: function (el) { insertMath(el, '\\frac{', '}{b}', 'a'); } },
    { label: '⚗️', title: 'Công thức hoá học (vd H₂O, 2H₂ + O₂ → 2H₂O)', run: function (el) { insertMath(el, '\\ce{', '}', 'H2O'); } },
    { label: 'fx', title: 'Bọc công thức toán $…$', style: 'font-style:italic', run: function (el) { surround(el, '$', '$', 'x'); } }
  ];

  // Thanh công cụ ĐẦY ĐỦ (cho ô nội dung): B I x² x₂ √ ½ ⚗️ fx + Công thức.
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
    bar.appendChild(makeMathButton(el));
    el.parentNode.insertBefore(bar, el);
    wirePreview(el);
  }

  // Bản GỌN cho ô đáp án/phương án (nằm trong dòng flex): đặt nút "Công thức"
  // ngay sau ô (inline), khung xem trước nằm dưới cả dòng.
  function attachMathInput(el) {
    if (!el || el.dataset.tbAttached === '1') return;
    el.dataset.tbAttached = '1';
    var btn = makeMathButton(el);
    btn.style.flex = '0 0 auto';
    if (el.parentNode) el.parentNode.insertBefore(btn, el.nextSibling);
    wirePreview(el);
  }

  function attachToolbarsIn(container) {
    if (!container) return;
    container.querySelectorAll('.rich').forEach(attachToolbar);
    container.querySelectorAll('.rich-math').forEach(attachMathInput);
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
  window.attachMathInput = attachMathInput;
  window.attachToolbarsIn = attachToolbarsIn;
  window.openMathEditor = openMathEditor;
  window.updatePreview = updatePreview;
  window.imageFieldHtml = imageFieldHtml;
  window.showImagePreview = showImagePreview;
  window.onPickImage = onPickImage;
})();
