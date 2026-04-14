# HƯỚNG DẪN SỬ DỤNG TEMPLATE ĐỀ THI

## 📁 CÁC FILE TEMPLATE

Có 3 file template đề thi:

1. **template-de-trac-nghiem-tu-luan.html** - Đề có trắc nghiệm + tự luận (có thể đính kèm ảnh)
2. **template-de-full-trac-nghiem.html** - Đề chỉ có trắc nghiệm
3. **template-de-trac-nghiem-dung-sai-tu-luan.html** - Đề có trắc nghiệm + đúng/sai + tự luận

## 🚀 CÁCH SỬ DỤNG NHANH

### Bước 1: Copy template phù hợp
```bash
# Ví dụ: Tạo đề KHTN số 4
copy template-de-trac-nghiem-tu-luan.html KHTN\de-so-4\de.html
```

### Bước 2: Thay thế các thông tin cơ bản

Tìm và thay thế các placeholder sau:

- `[TÊN MÔN HỌC]` → Ví dụ: "KHTN 8"
- `[TÊN ĐỀ THI]` → Ví dụ: "ĐỀ KIỂM TRA CUỐI KÌ II – KHTN 8"
- `[MÃ ĐỀ]` → Ví dụ: "MÃ ĐỀ: 001"
- `[Tên môn]` → Ví dụ: "Khoa học tự nhiên 8"
- `[XX]` → Thay bằng số phút, số câu, số điểm tương ứng
- `[TÊN MÔN]` → Trong JavaScript, ví dụ: "KHTN 8"
- `[TÊN ĐỀ]` → Trong JavaScript, ví dụ: "Đề số 4 - Cuối Kì 2"

### Bước 3: Cấu hình trong JavaScript

Tìm phần `// ===== CẤU HÌNH =====` và chỉnh:

```javascript
const EXAM_TIME_MINUTES = 45; // Thời gian làm bài
const TOTAL_QUESTIONS = 28; // Tổng số câu trắc nghiệm
const MULTIPLE_CHOICE_SCORE = 7; // Điểm phần trắc nghiệm
```

### Bước 4: Thêm câu hỏi

#### A. Câu trắc nghiệm thông thường:
```html
<div class="question" data-answer="A">
    <div class="question-header">Câu 1. [Bài 20 – Nhận biết]</div>
    <div class="question-content">Đơn vị đo cường độ dòng điện là:</div>
    <div class="options">
        <label class="option"><input type="radio" name="q1" value="A"> A. Vôn (V)</label>
        <label class="option"><input type="radio" name="q1" value="B"> B. Ampe (A)</label>
        <label class="option"><input type="radio" name="q1" value="C"> C. Ôm (Ω)</label>
        <label class="option"><input type="radio" name="q1" value="D"> D. Oát (W)</label>
    </div>
</div>
```

**Lưu ý:**
- `data-answer="A"` → Đáp án đúng
- `name="q1"` → Tăng dần q1, q2, q3...

#### B. Câu trắc nghiệm có giải thích và hình ảnh:
```html
<div class="question" data-answer="A">
    <div class="question-header">Câu 1. [Mô tả]</div>
    <div class="question-content">[Nội dung câu hỏi]</div>
    <div class="options">
        <label class="option"><input type="radio" name="q1" value="A"> A. [Đáp án A]</label>
        <label class="option"><input type="radio" name="q1" value="B"> B. [Đáp án B]</label>
        <label class="option"><input type="radio" name="q1" value="C"> C. [Đáp án C]</label>
        <label class="option"><input type="radio" name="q1" value="D"> D. [Đáp án D]</label>
    </div>
    <div class="explanation-box">
        <label>💡 Giải thích câu trả lời của bạn (không bắt buộc):</label>
        <textarea name="exp1" placeholder="Nhập giải thích hoặc lý do chọn đáp án..."></textarea>
        <input type="file" name="img1" accept="image/*" onchange="previewImage(this, 'preview1')">
        <img id="preview1" class="image-preview">
    </div>
</div>
```

#### C. Câu tự luận:
```html
<div class="essay-section">
    <div style="font-weight: bold; font-size: 13pt; margin-bottom: 15px; color: #1a1a1a;">
        Câu 1 (0,75 điểm): [Bài 30 – Vận dụng]
    </div>
    <div style="line-height: 1.8; color: #333; margin-bottom: 15px;">
        Mô tả hành trình của máu trong vòng tuần hoàn lớn...
    </div>
    <textarea name="essay1" class="essay-textarea" placeholder="Nhập câu trả lời của bạn..."></textarea>
    <div style="margin-top: 10px;">
        <label style="color: #666; font-size: 10pt;">Hoặc đính kèm hình ảnh bài làm:</label>
        <input type="file" name="essayImg1" accept="image/*" onchange="previewImage(this, 'essayPreview1')" style="margin-top: 5px; padding: 8px; border: 1px solid #ddd; border-radius: 5px; width: 100%; cursor: pointer;">
        <img id="essayPreview1" class="image-preview">
    </div>
</div>
```

**Lưu ý:**
- `name="essay1"` → Tăng dần essay1, essay2, essay3...
- `name="essayImg1"` → Tương ứng với số câu
- `id="essayPreview1"` → Tương ứng với số câu

#### D. Câu đúng/sai (chỉ có trong template 3):
```html
<div class="question" data-type="truefalse">
    <div class="question-header">Câu 2. [Mô tả]</div>
    <div class="question-content">[Nội dung câu hỏi chính]</div>
    <div class="true-false-group">
        <div class="true-false-item" data-answer="true">
            <span style="flex: 1;">a) Phát biểu thứ nhất</span>
            <div>
                <label><input type="radio" name="q2a" value="true"> Đúng</label>
                <label><input type="radio" name="q2a" value="false"> Sai</label>
            </div>
        </div>
        <div class="true-false-item" data-answer="false">
            <span style="flex: 1;">b) Phát biểu thứ hai</span>
            <div>
                <label><input type="radio" name="q2b" value="true"> Đúng</label>
                <label><input type="radio" name="q2b" value="false"> Sai</label>
            </div>
        </div>
    </div>
</div>
```

### Bước 5: Cập nhật số câu trong phần submit

Tìm và sửa:
```html
<p style="margin-bottom: 20px; font-size: 14pt;">
    Đã hoàn thành phần trắc nghiệm: <strong><span id="count">0</span>/28</strong> câu
</p>
```

Thay `28` bằng tổng số câu trắc nghiệm của bạn.

### Bước 6: Thêm vào index.html

Mở file `index.html`, tìm phần `examData` và thêm đề mới:

```javascript
const examData = {
    khtn: [
        // ... các đề cũ
        {
            title: 'Đề số 4 - KHTN 8',
            content: 'Đề Kiểm Tra Cuối Kì II',
            questions: '28 câu trắc nghiệm + 4 câu tự luận',
            time: '45 phút',
            topics: 'Điện học, Nhiệt học, Sinh học',
            difficulty: 'Hỗn hợp: Nhận biết → Vận dụng cao',
            link: 'KHTN/de-so-4/de.html'
        }
    ],
    // ...
};
```

## ⚙️ CẤU HÌNH GOOGLE SHEETS

URL Google Sheets đã được cấu hình sẵn trong template:
```javascript
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiAQ96NX5ZNIhZNVOrRXzXP_9xZAHa09zVCz8iw_iC0OapfvE00yKcQ2jxzUFvHsh3/exec';
```

Nếu muốn đổi, thay URL này bằng URL Google Apps Script của bạn.

## 📝 LƯU Ý QUAN TRỌNG

1. **Đáp án đúng**: Luôn đặt trong `data-answer="X"` của thẻ `<div class="question">`
2. **Name của input**: Phải unique và tăng dần (q1, q2, q3... hoặc essay1, essay2...)
3. **ID của preview**: Phải unique (preview1, preview2... hoặc essayPreview1, essayPreview2...)
4. **Số câu**: Cập nhật đúng trong JavaScript và HTML
5. **Thời gian**: Đặt đúng trong `EXAM_TIME_MINUTES` và hiển thị trong modal

## 🎯 CHECKLIST TRƯỚC KHI PUBLISH

- [ ] Đã thay tất cả placeholder [XXX]
- [ ] Đã cấu hình đúng số câu, thời gian, điểm
- [ ] Đã kiểm tra tất cả đáp án đúng (data-answer)
- [ ] Đã test chức năng nộp bài
- [ ] Đã thêm vào index.html
- [ ] Đã test trên mobile (responsive)

## 💡 MẸO HAY

1. **Copy nhanh**: Dùng Ctrl+H (Find & Replace) để thay hàng loạt
2. **Test nhanh**: Mở file HTML trực tiếp trên trình duyệt để test
3. **Backup**: Luôn giữ bản backup trước khi chỉnh sửa lớn
4. **Tên file**: Đặt tên rõ ràng theo format: `[mon]-de-so-[X]/de.html`

---

**Tạo bởi:** Nguyễn Phú Thuận  
**Zalo:** 0944316329  
**Cập nhật:** 14/04/2026
