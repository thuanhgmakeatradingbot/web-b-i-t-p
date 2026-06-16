/* ============================================================
   mathjax-config.js - CẤU HÌNH MATHJAX DÙNG CHUNG
   ------------------------------------------------------------
   - Phải nạp TRƯỚC thẻ <script async src=...tex-chtml.js> bằng
     một thẻ <script src="mathjax-config.js"></script> THƯỜNG
     (không async) để config chạy xong trước khi MathJax tải.
   - Bật mhchem để render công thức/phản ứng hoá học: \ce{H2O},
     \ce{2H2 + O2 -> 2H2O}.
   - Dùng ở: tao-de.html, ngan-hang.html, lam-bai.html, ket-qua.html,
     de-ngau-nhien.html và các mẫu đề thi template-de-*.html.
   - Cung cấp window.typesetMath(el) để render lại sau khi đổi nội
     dung động (an toàn với việc MathJax nạp bất đồng bộ).
   ============================================================ */
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    packages: { '[+]': ['mhchem'] },
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']]
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
  }
};

/* Render lại công thức, AN TOÀN với việc nạp bất đồng bộ: đợi MathJax tải
   xong (startup.promise) rồi mới typeset. Trước đây nhiều trang dùng
   "if (MathJax.typesetPromise)" nên nếu MathJax chưa tải xong sẽ âm thầm bỏ
   qua -> công thức không hiện. el là phần tử (bỏ trống = render cả trang). */
window.typesetMath = function (el) {
  var MJ = window.MathJax;
  if (!MJ) return;
  var run = function () {
    if (!MJ.typesetPromise) return;
    return MJ.typesetPromise(el ? [el] : undefined).catch(function () {});
  };
  if (MJ.startup && MJ.startup.promise) { MJ.startup.promise.then(run); }
  else { run(); }
};
