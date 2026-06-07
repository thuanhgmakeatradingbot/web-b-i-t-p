/* ============================================================
   cau-hinh.js - CẤU HÌNH MÔN HỌC DÙNG CHUNG
   ------------------------------------------------------------
   - Dùng cho ngân hàng câu hỏi và đề ngẫu nhiên.
   - KHTN (lớp 6-9) tách thành 3 môn nhỏ: Hóa / Sinh / Lí.
   - Các môn còn lại (lớp 10-12) giữ nguyên.
   ============================================================ */

// Khóa môn trong ngân hàng -> thông tin hiển thị
window.BANK_SUBJECTS = {
  "khtn_hoa":  { name: "KHTN - Hóa",  icon: "⚗️", grades: [6, 7, 8, 9],  parent: "khtn" },
  "khtn_sinh": { name: "KHTN - Sinh", icon: "🧬", grades: [6, 7, 8, 9],  parent: "khtn" },
  "khtn_ly":   { name: "KHTN - Lí",   icon: "⚡", grades: [6, 7, 8, 9],  parent: "khtn" },
  "khtn_all":  { name: "KHTN (Tổ hợp Hóa+Sinh+Lí)", icon: "🔬", grades: [6, 7, 8, 9], combo: ["khtn_hoa","khtn_sinh","khtn_ly"] },
  "toan":      { name: "Toán học",    icon: "📐", grades: [10, 11, 12] },
  "hoa":       { name: "Hóa học",     icon: "⚗️", grades: [10, 11, 12] },
  "sinh":      { name: "Sinh học",    icon: "🧬", grades: [10, 11, 12] },
  "vatly":     { name: "Vật lý",      icon: "⚡", grades: [10, 11, 12] }
};

// Tên 4 loại câu hỏi
window.QUESTION_TYPES = {
  mc:        "Trắc nghiệm 4 đáp án",
  truefalse: "Đúng / Sai",
  short:     "Trả lời ngắn",
  essay:     "Tự luận"
};
