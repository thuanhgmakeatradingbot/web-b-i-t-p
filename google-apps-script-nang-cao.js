// ===== GOOGLE APPS SCRIPT NÂNG CAO =====
// Tính năng:
// 1. Lưu kết quả thi
// 2. Tô đậm câu trả lời SAI (màu đỏ)
// 3. Hiển thị hình ảnh trong Sheet
// 4. Phân tích chi tiết từng câu
// 5. GỬI EMAIL kết quả về cho giáo viên sau mỗi lần học sinh nộp bài

// ⚙️ CẤU HÌNH EMAIL GIÁO VIÊN
// Đổi địa chỉ bên dưới thành email của bạn để nhận kết quả.
// (Để trống '' nếu KHÔNG muốn nhận email.)
var TEACHER_EMAIL = 'tktthuanhg@gmail.com';

// ⚙️ KHÓA BÍ MẬT để giáo viên xem kết quả từ trang ket-qua.html
// Đổi thành chuỗi bí mật của riêng bạn (giống y hệt chuỗi RESULTS_SECRET trong ket-qua.html).
var RESULTS_SECRET = 'thaythuan-2026';

// ⚙️ TÊN THƯ MỤC trên Google Drive để lưu ảnh bài làm của học sinh.
var IMAGE_FOLDER_NAME = 'AnhBaiLam_HocSinh';

// ===== LẤY (HOẶC TẠO) THƯ MỤC ẢNH TRÊN DRIVE =====
function getImageFolder_() {
  var folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

// ===== TẢI 1 ẢNH BASE64 LÊN DRIVE -> TRẢ VỀ LINK XEM ĐƯỢC =====
function uploadBase64ToDrive_(dataUrl, filename) {
  try {
    var parts = String(dataUrl).split(',');
    var meta = parts[0] || '';
    var b64 = parts[1] || parts[0];
    var mime = 'image/png';
    var m = meta.match(/data:([^;]+);/);
    if (m) mime = m[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, filename);
    var folder = getImageFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // Dùng link thumbnail -> hiển thị ảnh inline ổn định hơn uc?export=view
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  } catch (err) {
    Logger.log('Lỗi upload ảnh: ' + err.toString());
    return '';
  }
}

// ===== LƯU CÁC ẢNH BÀI LÀM (gửi từ lam-bai.html dạng essayImages JSON) =====
// Trả về chuỗi: "q5: <link> | q6: <link>"
function saveEssayImagesToDrive_(data, studentName, studentClass) {
  if (!data.essayImages) return '';
  var obj = {};
  try { obj = JSON.parse(data.essayImages); } catch (e) { return ''; }
  var links = [];
  var stamp = new Date().getTime();
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && obj[key]) {
      var fname = (studentName || 'hs') + '_' + (studentClass || '') + '_' + key + '_' + stamp + '.png';
      fname = fname.replace(/[^\w.\-]/g, '_');
      var link = uploadBase64ToDrive_(obj[key], fname);
      if (link) links.push(key + ': ' + link);
    }
  }
  return links.join(' | ');
}

function doPost(e) {
  try {
    // [DEBUG] Log raw request
    Logger.log('=== RAW REQUEST ===');
    Logger.log('e: ' + JSON.stringify(e));
    Logger.log('e.postData: ' + JSON.stringify(e.postData));
    Logger.log('e.postData.contents: ' + e.postData.contents);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mainSheet = ss.getSheetByName('Kết quả') || ss.getActiveSheet();
    
    // Parse dữ liệu
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
        Logger.log('✅ Parse JSON thành công');
      } catch(parseErr) {
        Logger.log('❌ Lỗi parse JSON: ' + parseErr.toString());
        // Thử parse từ parameter (form data)
        if (e.parameter) {
          data = e.parameter;
          Logger.log('✅ Sử dụng e.parameter thay thế');
        }
      }
    } else {
      Logger.log('❌ Không có postData.contents');
      // Fallback: Thử lấy từ parameter
      if (e && e.parameter) {
        data = e.parameter;
        Logger.log('✅ Sử dụng e.parameter');
      }
    }
    
    Logger.log('=== PARSED DATA ===');
    Logger.log('data: ' + JSON.stringify(data));
    
    // Chuẩn bị dữ liệu cơ bản
    var timestamp = data.timestamp || new Date().toLocaleString('vi-VN');
    var name = data.name || '';
    var studentClass = data.class || '';
    var subject = data.subject || 'KHTN';
    var exam = data.exam || '';
    var correct = data.correct || 0;
    var wrong = data.wrong || 0;
    var score = data.score || 0;
    
    // Parse answers
    var answersObj = {};
    try {
      answersObj = JSON.parse(data.answers);
    } catch(err) {
      answersObj = {};
    }
    
    // Tạo chuỗi đáp án với format đẹp
    var answersText = formatAnswers(answersObj);
    
    // Xử lý giải thích (CHỈ text giải thích, KHÔNG phải tự luận)
    var explanations = data.explanations || '';
    
    // Lưu ảnh bài làm lên Google Drive -> lấy link (cách mới, gọn nhẹ)
    var driveImageLinks = saveEssayImagesToDrive_(data, name, studentClass);
    // Tương thích ngược với cách cũ (ảnh nhúng base64 trong data.images/essays)
    var imageLinks = driveImageLinks || processImages(data);
    
    // Xử lý tự luận (essay1, essay2, essay3, essay4 HOẶC data.essays)
    var essayText = processEssays(data);
    
    // [DEBUG] Log để kiểm tra
    Logger.log('=== DEBUG DATA ===');
    Logger.log('explanations: ' + explanations);
    Logger.log('essayText: ' + essayText);
    Logger.log('data.essay1: ' + data.essay1);
    Logger.log('data.essay2: ' + data.essay2);
    Logger.log('data.essays: ' + data.essays);
    
    // Thêm dòng mới vào sheet chính
    var newRow = mainSheet.getLastRow() + 1;
    mainSheet.appendRow([
      timestamp,
      name,
      studentClass,
      subject,
      exam,
      correct,
      wrong,
      score,
      answersText,
      explanations,
      imageLinks,
      essayText,
      data.correctAnswers || ''   // Cột M: đáp án đúng (JSON) - dùng cho trang kết quả
    ]);
    
    // Tô màu câu trả lời SAI
    highlightWrongAnswers(mainSheet, newRow, answersObj, data.correctAnswers);

    // Hiển thị ảnh ngay trong ô Sheet (cột K) bằng =IMAGE(), kèm ghi chú link
    showImagesInCell_(mainSheet, newRow, imageLinks);
    
    // (Đã chuyển sang lưu ảnh trên Drive + link, không nhúng ảnh nặng vào ô nữa)
    // Nếu vẫn nhận ảnh kiểu cũ (base64) mà CHƯA có link Drive thì mới nhúng để tương thích.
    if (!driveImageLinks && (data.images || data.essays)) {
      insertImages(mainSheet, newRow, data);
    }
    
    // GỬI EMAIL kết quả cho giáo viên (nếu đã cấu hình TEACHER_EMAIL)
    try {
      sendResultEmail(data, answersObj, answersText, essayText);
    } catch(mailErr) {
      Logger.log('Lỗi gửi email: ' + mailErr.toString());
    }
    
    // Tạo sheet chi tiết cho học sinh này (tùy chọn)
    // createDetailSheet(ss, data, answersObj);
    
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'message': 'Đã lưu kết quả thành công',
      'row': newRow
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== FORMAT ĐÁP ÁN =====
function formatAnswers(answersObj) {
  var result = [];
  for (var key in answersObj) {
    if (answersObj.hasOwnProperty(key)) {
      result.push(key + ': ' + answersObj[key]);
    }
  }
  return result.join(', ');
}

// ===== GỬI EMAIL KẾT QUẢ CHO GIÁO VIÊN =====
function sendResultEmail(data, answersObj, answersText, essayText) {
  // Chưa cấu hình email -> bỏ qua
  if (!TEACHER_EMAIL || TEACHER_EMAIL.indexOf('@') < 0 || TEACHER_EMAIL.indexOf('email-cua-ban') === 0) {
    Logger.log('Chưa cấu hình TEACHER_EMAIL hợp lệ, bỏ qua gửi email.');
    return;
  }

  var name = data.name || '(không tên)';
  var studentClass = data.class || '';
  var subject = data.subject || '';
  var exam = data.exam || '';
  var score = data.score || '0';
  var timestamp = data.timestamp || new Date().toLocaleString('vi-VN');

  var subjectLine = '[Kết quả] ' + name + ' - ' + studentClass + ' - ' + exam;

  // Bảng chi tiết câu trả lời (HTML)
  var rows = '';
  for (var key in answersObj) {
    if (answersObj.hasOwnProperty(key)) {
      var v = answersObj[key];
      if (v === '' || v == null) v = '<i style="color:#c62828">(bỏ trống)</i>';
      rows += '<tr><td style="border:1px solid #ddd;padding:6px 10px">' + key +
              '</td><td style="border:1px solid #ddd;padding:6px 10px">' + v + '</td></tr>';
    }
  }

  var essayHtml = '';
  if (essayText && essayText.trim() !== '') {
    essayHtml = '<h3>✍️ Bài tự luận</h3><pre style="background:#f8f9fa;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:inherit">' +
                escapeHtmlGas(essayText) + '</pre>';
  }

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222">' +
      '<h2 style="color:#1a1a1a">📩 Có học sinh vừa nộp bài</h2>' +
      '<table style="border-collapse:collapse;margin:15px 0">' +
        '<tr><td style="padding:4px 12px"><b>Họ tên</b></td><td style="padding:4px 12px">' + escapeHtmlGas(name) + '</td></tr>' +
        '<tr><td style="padding:4px 12px"><b>Lớp</b></td><td style="padding:4px 12px">' + escapeHtmlGas(studentClass) + '</td></tr>' +
        '<tr><td style="padding:4px 12px"><b>Môn</b></td><td style="padding:4px 12px">' + escapeHtmlGas(subject) + '</td></tr>' +
        '<tr><td style="padding:4px 12px"><b>Đề</b></td><td style="padding:4px 12px">' + escapeHtmlGas(exam) + '</td></tr>' +
        '<tr><td style="padding:4px 12px"><b>Thời gian nộp</b></td><td style="padding:4px 12px">' + escapeHtmlGas(timestamp) + '</td></tr>' +
        '<tr><td style="padding:4px 12px"><b>Điểm (tự động)</b></td><td style="padding:4px 12px;font-size:18px;color:#2e7d32"><b>' + escapeHtmlGas(String(score)) + '</b></td></tr>' +
      '</table>' +
      '<h3>📝 Chi tiết câu trả lời</h3>' +
      '<table style="border-collapse:collapse;width:100%">' +
        '<tr><th style="border:1px solid #ddd;padding:6px 10px;background:#f0f0f0">Câu</th><th style="border:1px solid #ddd;padding:6px 10px;background:#f0f0f0">Trả lời</th></tr>' +
        rows +
      '</table>' +
      essayHtml +
      '<p style="color:#888;font-size:12px;margin-top:20px">Email tự động từ Hệ thống ôn tập trực tuyến.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: TEACHER_EMAIL,
    subject: subjectLine,
    htmlBody: html
  });
  Logger.log('✅ Đã gửi email kết quả tới ' + TEACHER_EMAIL);
}

// Escape HTML cho nội dung email (tránh lỗi hiển thị)
function escapeHtmlGas(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== XỬ LÝ HÌNH ẢNH =====
function processImages(data) {
  var imageLinks = [];
  
  // Xử lý hình ảnh giải thích
  if (data.images) {
    try {
      var imagesObj = JSON.parse(data.images);
      for (var key in imagesObj) {
        if (imagesObj[key].image) {
          imageLinks.push(key + ': Có hình');
        }
      }
    } catch(err) {}
  }
  
  // Xử lý hình ảnh tự luận
  if (data.essays) {
    try {
      var essaysObj = JSON.parse(data.essays);
      for (var key in essaysObj) {
        if (essaysObj[key].image) {
          imageLinks.push(key + ': Có hình');
        }
      }
    } catch(err) {}
  }
  
  return imageLinks.length > 0 ? imageLinks.join(', ') : '';
}

// ===== XỬ LÝ TỰ LUẬN =====
function processEssays(data) {
  var essays = [];
  
  // Cách 1: Từ data.essays (JSON)
  if (data.essays) {
    try {
      var essaysObj = JSON.parse(data.essays);
      for (var key in essaysObj) {
        if (essaysObj[key].text) {
          essays.push(key + ': ' + essaysObj[key].text);
        }
      }
    } catch(err) {}
  }
  
  // Cách 2: Từ data.essay1, essay2, essay3, essay4
  for (var i = 1; i <= 10; i++) {
    var essayKey = 'essay' + i;
    if (data[essayKey]) {
      essays.push('Câu ' + i + ': ' + data[essayKey]);
    }
  }
  
  return essays.length > 0 ? essays.join('\n\n') : '';
}

// ===== HIỂN THỊ ẢNH NGAY TRONG Ô SHEET (cột K) =====
// imageLinks dạng: "essay1: https://drive.google.com/thumbnail?id=... | essay2: https://..."
function showImagesInCell_(sheet, row, imageLinks) {
  try {
    if (!imageLinks) return;
    // Lấy tất cả URL trong chuỗi
    var urls = String(imageLinks).match(/https?:\/\/[^\s|]+/g);
    if (!urls || urls.length === 0) return;

    // Giữ nguyên link text ở cột K (cho trang ket-qua.html đọc).
    // Hiển thị ảnh thật ở cột N (14) bằng =IMAGE để xem ngay trong Sheet.
    var imgCell = sheet.getRange(row, 14); // Cột N
    imgCell.setFormula('=IMAGE("' + urls[0] + '")');
    // Tăng chiều cao dòng + độ rộng cột cho dễ nhìn ảnh
    sheet.setRowHeight(row, 140);
    sheet.setColumnWidth(14, 180);
    Logger.log('✅ Đã chèn ảnh vào ô (cột N) bằng =IMAGE');
  } catch (err) {
    Logger.log('Lỗi showImagesInCell_: ' + err.toString());
  }
}

// ===== TÔ MÀU CÂU TRẢ LỜI SAI =====
function highlightWrongAnswers(sheet, row, studentAnswers, correctAnswersStr) {
  try {
    // Parse đáp án đúng từ data hoặc từ cấu hình
    var correctAnswers = {};
    
    if (correctAnswersStr) {
      try {
        correctAnswers = JSON.parse(correctAnswersStr);
      } catch(err) {
        Logger.log('Lỗi parse correctAnswers: ' + err.toString());
      }
    }
    
    // Nếu không có đáp án đúng, bỏ qua
    if (Object.keys(correctAnswers).length === 0) {
      Logger.log('Không có đáp án đúng để so sánh');
      return;
    }
    
    // Tạo text với format: q1: A→C (✗), q2: B (✓)
    var detailedAnswers = [];
    var fullText = '';
    
    for (var key in studentAnswers) {
      if (studentAnswers.hasOwnProperty(key)) {
        var studentAns = studentAnswers[key];
        if (studentAns === '' || studentAns == null) studentAns = '∅';
        var correctAns = correctAnswers[key];
        var isCorrect = (String(studentAns) === String(correctAns));
        
        var text;
        if (isCorrect) {
          text = key + ': ' + studentAns + ' (✓)';
        } else {
          // Hiện đáp án đúng để giáo viên dễ nhìn
          text = key + ': ' + studentAns + ' → đúng: ' + (correctAns == null ? '?' : correctAns) + ' (✗)';
        }
        
        if (detailedAnswers.length > 0) {
          fullText += '\n';
        }
        
        var startIndex = fullText.length;
        fullText += text;
        var endIndex = fullText.length;
        
        detailedAnswers.push({
          startIndex: startIndex,
          endIndex: endIndex,
          isCorrect: isCorrect
        });
      }
    }
    
    // Ghi vào cell với rich text formatting
    var cell = sheet.getRange(row, 9); // Cột I (Câu trả lời)
    var richTextBuilder = SpreadsheetApp.newRichTextValue().setText(fullText);
    
    // Áp dụng style: ĐÚNG -> xanh, SAI -> đỏ + in đậm
    for (var i = 0; i < detailedAnswers.length; i++) {
      var item = detailedAnswers[i];
      var style = item.isCorrect
        ? SpreadsheetApp.newTextStyle().setForegroundColor('#188038').build()
        : SpreadsheetApp.newTextStyle().setForegroundColor('#D93025').setBold(true).build();
      richTextBuilder.setTextStyle(item.startIndex, item.endIndex, style);
    }
    
    cell.setRichTextValue(richTextBuilder.build());
    cell.setVerticalAlignment('top');
    cell.setWrap(true);
    Logger.log('✅ Đã tô màu câu đúng (xanh) / sai (đỏ)');
    
  } catch(error) {
    Logger.log('❌ Lỗi tô màu: ' + error.toString());
  }
}

// ===== CHÈN HÌNH ẢNH VÀO SHEET =====
function insertImages(sheet, row, data) {
  try {
    var col = 11; // Cột K (Hình ảnh)
    var imageCount = 0;
    
    // Xử lý hình ảnh giải thích
    if (data.images) {
      try {
        var imagesObj = JSON.parse(data.images);
        for (var key in imagesObj) {
          if (imagesObj[key].image) {
            var base64 = imagesObj[key].image;
            insertImageFromBase64(sheet, row, col, base64, imageCount);
            imageCount++;
          }
        }
      } catch(err) {
        Logger.log('Lỗi xử lý images: ' + err.toString());
      }
    }
    
    // Xử lý hình ảnh tự luận
    if (data.essays) {
      try {
        var essaysObj = JSON.parse(data.essays);
        for (var key in essaysObj) {
          if (essaysObj[key].image) {
            var base64 = essaysObj[key].image;
            insertImageFromBase64(sheet, row, col, base64, imageCount);
            imageCount++;
          }
        }
      } catch(err) {
        Logger.log('Lỗi xử lý essays: ' + err.toString());
      }
    }
    
    // Tăng chiều cao dòng nếu có hình
    if (imageCount > 0) {
      sheet.setRowHeight(row, 150 * Math.ceil(imageCount / 2));
    }
    
  } catch(error) {
    Logger.log('Lỗi chèn hình: ' + error.toString());
  }
}

// ===== CHÈN HÌNH TỪ BASE64 =====
function insertImageFromBase64(sheet, row, col, base64Data, index) {
  try {
    // Loại bỏ prefix "data:image/...;base64,"
    var base64 = base64Data.split(',')[1] || base64Data;
    
    // Decode base64
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'image_' + index + '.png');
    
    // Chèn hình vào cell
    var cell = sheet.getRange(row, col + index);
    var image = sheet.insertImage(blob, col + index, row);
    
    // Resize hình
    image.setWidth(100);
    image.setHeight(100);
    
  } catch(error) {
    Logger.log('Lỗi chèn hình từ base64: ' + error.toString());
  }
}

// ===== TẠO SHEET CHI TIẾT (TÙY CHỌN) =====
function createDetailSheet(ss, data, answersObj) {
  try {
    var sheetName = data.name + '_' + data.class + '_' + new Date().getTime();
    var detailSheet = ss.insertSheet(sheetName);
    
    // Header
    detailSheet.appendRow(['THÔNG TIN CHI TIẾT BÀI LÀM']);
    detailSheet.appendRow(['Họ tên:', data.name]);
    detailSheet.appendRow(['Lớp:', data.class]);
    detailSheet.appendRow(['Môn:', data.subject]);
    detailSheet.appendRow(['Đề thi:', data.exam]);
    detailSheet.appendRow(['Thời gian:', data.timestamp]);
    detailSheet.appendRow(['Điểm:', data.score]);
    detailSheet.appendRow([]);
    
    // Chi tiết từng câu
    detailSheet.appendRow(['Câu hỏi', 'Đáp án', 'Kết quả']);
    
    for (var key in answersObj) {
      if (answersObj.hasOwnProperty(key)) {
        detailSheet.appendRow([key, answersObj[key], '']);
      }
    }
    
    // Format
    detailSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setFontSize(14);
    detailSheet.setColumnWidth(1, 150);
    detailSheet.setColumnWidth(2, 100);
    detailSheet.setColumnWidth(3, 100);
    
  } catch(error) {
    Logger.log('Lỗi tạo sheet chi tiết: ' + error.toString());
  }
}

// ===== ĐỌC KẾT QUẢ (cho trang ket-qua.html của giáo viên) =====
// Gọi: <URL>?action=results&secret=RESULTS_SECRET
function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.action === 'results') {
    // Kiểm tra khóa bí mật
    if (params.secret !== RESULTS_SECRET) {
      return jsonOutput_({ status: 'error', message: 'Sai khóa bí mật.' });
    }
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName('Kết quả') || ss.getActiveSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return jsonOutput_({ status: 'success', rows: [] });

      // Cột A..M = 13 cột
      var values = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
      var rows = values.map(function(r) {
        return {
          timestamp: r[0],
          name: r[1],
          class: r[2],
          subject: r[3],
          exam: r[4],
          correct: r[5],
          wrong: r[6],
          score: r[7],
          answers: r[8],
          explanations: r[9],
          images: r[10],   // link ảnh Drive
          essays: r[11],
          correctAnswers: r[12]  // cột M: đáp án đúng (JSON)
        };
      });
      // Mới nhất lên đầu
      rows.reverse();
      return jsonOutput_({ status: 'success', rows: rows });
    } catch (err) {
      return jsonOutput_({ status: 'error', message: err.toString() });
    }
  }

  return ContentService.createTextOutput('Google Apps Script đang hoạt động! ✅');
}

// Trả JSON (kèm CORS để web đọc được)
function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== HÀM TEST: cấp quyền Drive + kiểm tra ghi ảnh =====
// Chọn hàm này trong dropdown rồi bấm Run để cấp quyền Drive và tạo thử thư mục.
function testQuyenDrive() {
  var folder = getImageFolder_();
  Logger.log('✅ OK. Thư mục ảnh: ' + folder.getName() + ' (id: ' + folder.getId() + ')');
  // Tạo thử 1 file text nhỏ để chắc chắn có quyền ghi
  var f = folder.createFile('test_quyen.txt', 'Kiem tra quyen Drive OK', MimeType.PLAIN_TEXT);
  Logger.log('✅ Đã tạo file test: ' + f.getUrl());
  return 'OK';
}

// ===== HƯỚNG DẪN SỬ DỤNG =====
// 1. Copy toàn bộ code này
// 2. Vào Google Sheets → Extensions → Apps Script
// 3. Paste code vào
// 4. Save (Ctrl+S)
// 5. Deploy → New deployment → Web app
// 6. Execute as: Me
// 7. Who has access: Anyone
// 8. Deploy → Copy URL
// 9. Paste URL vào file HTML (GOOGLE_SCRIPT_URL)

// ===== CẤU TRÚC SHEET =====
// Cột A: Thời gian
// Cột B: Họ và tên
// Cột C: Lớp
// Cột D: Môn học
// Cột E: Đề thi
// Cột F: Số câu đúng
// Cột G: Số câu sai
// Cột H: Điểm
// Cột I: Câu trả lời (có tô màu đỏ cho câu sai)
// Cột J: Giải thích
// Cột K: Hình ảnh (hiển thị hình thật)
// Cột L: Tự luận

// ===== LƯU Ý =====
// - Hình ảnh base64 quá lớn có thể gây lỗi
// - Giới hạn: 50MB/request
// - Nên resize hình trước khi gửi (max 500KB/hình)
