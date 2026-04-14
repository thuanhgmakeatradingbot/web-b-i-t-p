// ===== GOOGLE APPS SCRIPT NÂNG CAO =====
// Tính năng:
// 1. Lưu kết quả thi
// 2. Tô đậm câu trả lời SAI (màu đỏ)
// 3. Hiển thị hình ảnh trong Sheet
// 4. Phân tích chi tiết từng câu

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
    
    // Xử lý hình ảnh
    var imageLinks = processImages(data);
    
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
      essayText
    ]);
    
    // Tô màu câu trả lời SAI
    highlightWrongAnswers(mainSheet, newRow, answersObj, data.correctAnswers);
    
    // Chèn hình ảnh vào sheet (nếu có)
    if (data.images || data.essays) {
      insertImages(mainSheet, newRow, data);
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
    
    // Tạo text với format: q1: A (✓), q2: B (✗), q3: C (✓)
    var detailedAnswers = [];
    var fullText = '';
    
    for (var key in studentAnswers) {
      if (studentAnswers.hasOwnProperty(key)) {
        var studentAns = studentAnswers[key];
        var correctAns = correctAnswers[key];
        var isCorrect = (studentAns === correctAns);
        
        var mark = isCorrect ? '✓' : '✗';
        var text = key + ': ' + studentAns + ' (' + mark + ')';
        
        if (detailedAnswers.length > 0) {
          fullText += ', ';
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
    
    // Áp dụng style cho từng câu sai
    for (var i = 0; i < detailedAnswers.length; i++) {
      var item = detailedAnswers[i];
      if (!item.isCorrect) {
        // Tô đỏ và in đậm câu sai
        richTextBuilder.setTextStyle(item.startIndex, item.endIndex, 
          SpreadsheetApp.newTextStyle()
            .setForegroundColor('#FF0000')
            .setBold(true)
            .build()
        );
      }
    }
    
    cell.setRichTextValue(richTextBuilder.build());
    Logger.log('✅ Đã tô màu câu trả lời sai');
    
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

// ===== TEST FUNCTION =====
function doGet(e) {
  return ContentService.createTextOutput('Google Apps Script đang hoạt động! ✅');
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
