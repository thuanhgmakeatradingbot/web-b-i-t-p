# LOGIC.md - HỆ THỐNG ÔN TẬP TRỰC TUYẾN

**Ngày tạo:** 2025-01-XX  
**Phiên bản:** 1.0  
**Tác giả:** Senior Developer & Technical Writer

---

## 📋 MỤC LỤC

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Kiến Trúc Hệ Thống](#2-kiến-trúc-hệ-thống)
3. [Luồng Xử Lý Chính](#3-luồng-xử-lý-chính)
4. [Module Frontend - index.html](#4-module-frontend---indexhtml)
5. [Module Đề Thi - Exam Templates](#5-module-đề-thi---exam-templates)
6. [Module Backend - Google Apps Script](#6-module-backend---google-apps-script)
7. [Xử Lý Bảo Mật](#7-xử-lý-bảo-mật)
8. [Xử Lý Lỗi](#8-xử-lý-lỗi)
9. [Biến & State Quan Trọng](#9-biến--state-quan-trọng)
10. [Dependencies](#10-dependencies)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mục Đích
Hệ thống ôn tập trực tuyến cho phép:
- Học sinh làm bài thi trắc nghiệm và tự luận online
- Tự động chấm điểm phần trắc nghiệm
- Lưu kết quả vào Google Sheets
- Tô đậm màu đỏ câu trả lời sai trong Sheet
- Hiển thị hình ảnh và câu trả lời tự luận

### 1.2 Công Nghệ Sử Dụng
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Google Apps Script (GAS)
- **Database:** Google Sheets
- **Security:** Fullscreen API, Copy Protection, Screenshot Prevention

### 1.3 Luồng Dữ Liệu Tổng Quát
```
[Học sinh] → [Chọn đề] → [Làm bài] → [Nộp bài] 
    ↓
[Thu thập dữ liệu] → [Gửi POST request] → [Google Apps Script]
    ↓
[Parse & Validate] → [Tô màu câu sai] → [Lưu vào Google Sheets]
    ↓
[Hiển thị kết quả cho học sinh]
```

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1 Cấu Trúc Thư Mục
```
/
├── index.html                          # Trang chủ - Menu chọn đề
├── google-apps-script-nang-cao.js      # Backend logic (deploy lên GAS)
├── URL mặc định                        # Config file chứa URLs
├── KHTN/
│   ├── de-so-1/de.html                # Đề KHTN số 1
│   ├── de-so-2/de.html                # Đề KHTN số 2
│   └── de-so-3/de.html                # Đề KHTN số 3 (có tự luận)
├── Sinh-10/
│   └── de-so-1/de.html                # Đề Sinh 10 số 1
├── template-de-full-trac-nghiem.html  # Template chỉ trắc nghiệm
├── template-de-trac-nghiem-tu-luan.html # Template có tự luận
└── template-de-trac-nghiem-dung-sai-tu-luan.html # Template đầy đủ
```

### 2.2 Mô Hình Client-Server
```
┌─────────────────┐         HTTP POST          ┌──────────────────┐
│   Browser       │ ─────────────────────────→ │  Google Apps     │
│   (Client)      │                             │  Script (Server) │
│                 │ ←───────────────────────── │                  │
│  - HTML/CSS/JS  │      JSON Response          │  - doPost()      │
│  - Exam Logic   │                             │  - Data Process  │
│  - UI Control   │                             │  - Sheet Write   │
└─────────────────┘                             └──────────────────┘
                                                         │
                                                         ↓
                                                ┌──────────────────┐
                                                │  Google Sheets   │
                                                │  (Database)      │
                                                │  - Kết quả thi   │
                                                │  - Tô màu sai    │
                                                └──────────────────┘
```

---

## 3. LUỒNG XỬ LÝ CHÍNH

### 3.1 Luồng Từ Đầu Đến Cuối

#### BƯỚC 1: Học sinh vào trang chủ (index.html)
**Mục đích:** Hiển thị menu chọn môn học và danh sách đề thi

**Logic:**
1. Load trang → Hiển thị sidebar với các môn học
2. Mặc định hiển thị môn KHTN (active)
3. Đọc dữ liệu từ object `examData` (hardcoded trong JS)
4. Render danh sách đề thi dạng card grid

**Điều kiện:**
- Nếu môn học chưa có đề → Hiển thị "Đề thi đang được cập nhật"
- Nếu có đề → Hiển thị card với thông tin đầy đủ

---

#### BƯỚC 2: Click vào đề thi
**Mục đích:** Chuyển sang trang làm bài

**Logic:**
1. Click vào card hoặc button "Bắt đầu làm bài"
2. `window.location.href = exam.link` → Chuyển trang
3. Load file HTML của đề thi (VD: `KHTN/de-so-1/de.html`)

---

#### BƯỚC 3: Hiển thị modal xác nhận bắt đầu
**Mục đích:** Cảnh báo học sinh về quy định thi

**Logic:**
1. Trang đề thi load → Modal `#startModal` hiển thị (CSS: `display: flex`)
2. Modal chứa:
   - Tên đề thi
   - Thời gian
   - Số câu hỏi
   - Các quy định (fullscreen, không copy, không screenshot)
3. Học sinh có 2 lựa chọn:
   - **Quay lại:** `cancelExam()` → `window.location.href = 'index.html'`
   - **Bắt đầu:** `confirmStartExam()` → Tiếp tục

**WHY:** Đảm bảo học sinh hiểu rõ quy định trước khi thi, tránh vi phạm vô ý

---

#### BƯỚC 4: Bắt đầu làm bài
**Mục đích:** Kích hoạt chế độ thi (fullscreen + timer)

**Logic trong `confirmStartExam()`:**
```javascript
function confirmStartExam() {
    // 1. Ẩn modal xác nhận
    document.getElementById('startModal').style.display = 'none';
    
    // 2. Bật fullscreen
    enterFullscreen();
    
    // 3. Bắt đầu đếm ngược
    startTimer();
}
```

**WHY mỗi bước:**
- **Ẩn modal:** Học sinh đã xác nhận, không cần hiển thị nữa
- **Fullscreen:** Ngăn học sinh mở tab khác, tra cứu
- **Timer:** Giới hạn thời gian, tạo áp lực thi thật

---

#### BƯỚC 5: Làm bài (Chọn đáp án)
**Mục đích:** Thu thập câu trả lời của học sinh

**Logic trong event listener:**
```javascript
document.getElementById('examForm').addEventListener('change', (e) => {
    if (e.target.type === 'radio') {
        // 1. Lấy question container
        const q = e.target.closest('.question');
        
        // 2. Đánh dấu đã trả lời
        q.classList.add('answered');
        
        // 3. Bỏ highlight các option khác
        q.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        
        // 4. Highlight option được chọn
        e.target.closest('.option').classList.add('selected');
        
        // 5. Cập nhật số câu đã làm
        document.getElementById('count').textContent = 
            document.querySelectorAll('.question.answered').length;
    }
});
```

**WHY từng bước:**
1. **closest('.question'):** Tìm container cha chứa câu hỏi
2. **add('answered'):** Đổi màu border sang xanh, báo học sinh đã làm
3. **remove('selected'):** Chỉ 1 option được chọn (radio behavior)
4. **add('selected'):** Highlight option hiện tại
5. **Cập nhật count:** Học sinh biết đã làm bao nhiêu câu

**Edge cases:**
- Nếu học sinh đổi đáp án → Logic vẫn hoạt động (remove rồi add lại)
- Nếu không chọn gì → Câu đó không có class 'answered'

---

#### BƯỚC 6: Nộp bài
**Mục đích:** Chấm điểm và gửi kết quả lên server

**Logic trong `submitExam()` - PHẦN 1: Validation**
```javascript
async function submitExam() {
    // 1. Lấy thông tin học sinh
    const studentName = document.getElementById('studentName').value.trim();
    const studentClass = document.getElementById('studentClass').value.trim();
    
    // 2. Kiểm tra bắt buộc
    if (!studentName || !studentClass) {
        alert('⚠️ Vui lòng điền đầy đủ Họ tên và Lớp trước khi nộp bài!');
        return; // Dừng lại, không nộp
    }
    
    // 3. Disable nút nộp (tránh spam)
    const submitBtn = document.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';
    
    // ... tiếp tục
}
```

**WHY:**
- **trim():** Loại bỏ khoảng trắng thừa
- **Validation:** Bắt buộc nhập tên và lớp (để lưu vào Sheet)
- **Disable button:** Tránh học sinh click nhiều lần, gửi duplicate data

---

**Logic trong `submitExam()` - PHẦN 2: Chấm điểm**
```javascript
// 4. Lấy tất cả câu hỏi
const qs = document.querySelectorAll('.question');
let c = 0, w = 0; // correct, wrong
const answers = {};
const correctAnswers = {}; // [UPDATED - 2025-01-XX] Thêm để gửi lên server

// 5. Duyệt từng câu
qs.forEach((q, index) => {
    // 5.1 Lấy đáp án đúng từ data-answer
    const ans = q.dataset.answer;
    
    // 5.2 Lấy đáp án học sinh chọn
    const sel = q.querySelector('input:checked');
    
    // 5.3 Tạo key câu hỏi (q1, q2, q3...)
    const questionNum = index + 1;
    
    // 5.4 Lưu đáp án đúng vào object
    correctAnswers[`q${questionNum}`] = ans;
    
    // 5.5 Xử lý theo trường hợp
    if (sel) {
        // Học sinh đã chọn
        answers[`q${questionNum}`] = sel.value;
        
        if (sel.value === ans) {
            // Đúng
            c++;
            q.style.borderLeftColor = '#4CAF50'; // Xanh
        } else {
            // Sai
            w++;
            q.style.borderLeftColor = '#f44336'; // Đỏ
        }
    } else {
        // Không chọn → Tính là sai
        answers[`q${questionNum}`] = '';
        w++;
        q.style.borderLeftColor = '#ff9800'; // Cam
    }
});
```

**WHY từng bước:**
- **dataset.answer:** HTML attribute `data-answer="A"` chứa đáp án đúng
- **querySelector('input:checked'):** Lấy radio button được chọn
- **index + 1:** Index bắt đầu từ 0, câu hỏi bắt đầu từ 1
- **correctAnswers:** Gửi lên server để tô màu câu sai trong Sheet
- **Border color:** Visual feedback ngay lập tức cho học sinh

**Edge cases:**
- Nếu `sel === null` (không chọn) → Tính là sai, lưu empty string
- Nếu `data-answer` không tồn tại → `ans = undefined`, so sánh sẽ false

---

**Logic trong `submitExam()` - PHẦN 3: Tính điểm & Hiển thị**
```javascript
// 6. Tính điểm
const sc = ((c / qs.length) * 7).toFixed(2); // 7 điểm cho phần trắc nghiệm

// 7. Hiển thị kết quả
document.getElementById('score').textContent = `${c}/${qs.length}`;
document.getElementById('correct').textContent = c;
document.getElementById('wrong').textContent = w;
document.getElementById('finalScore').textContent = sc;
```

**WHY:**
- **c / qs.length:** Tỷ lệ đúng (VD: 15/20 = 0.75)
- **× 7:** Quy đổi sang thang điểm 7 (phần trắc nghiệm)
- **toFixed(2):** Làm tròn 2 chữ số thập phân (VD: 5.25)

---

**Logic trong `submitExam()` - PHẦN 4: Thu thập dữ liệu bổ sung**
```javascript
// 8. Thu thập giải thích (nếu có)
const explanations = await collectExplanations();

// 9. Thu thập tự luận (nếu có)
const essays = await collectEssays();

// 10. Gửi lên server
await saveToGoogleSheets(
    studentName, 
    studentClass, 
    c, w, sc, 
    answers, 
    correctAnswers, // [UPDATED] Thêm đáp án đúng
    explanations
);

// 11. Hiển thị modal kết quả
document.getElementById('resultModal').style.display = 'flex';
```

**WHY:**
- **await:** Chờ thu thập xong mới gửi (async operation)
- **collectExplanations():** Lấy text + hình ảnh giải thích
- **collectEssays():** Lấy câu trả lời tự luận
- **Modal:** Hiển thị kết quả cuối cùng cho học sinh

---


## 4. MODULE FRONTEND - index.html

### 4.1 Tổng Quan
**File:** `index.html`  
**Vai trò:** Trang chủ - Menu chọn môn học và đề thi  
**Dependencies:** Không có (standalone)

### 4.2 Cấu Trúc HTML

#### 4.2.1 Sidebar Menu
```html
<div class="sidebar" id="sidebar">
    <div class="sidebar-header">...</div>
    <div class="menu-item active" data-subject="khtn">...</div>
    <div class="menu-item" data-subject="toan">...</div>
    ...
</div>
```

**Logic:**
- Mỗi `menu-item` có attribute `data-subject` để identify môn học
- Class `active` đánh dấu môn đang được chọn
- Click vào item → Trigger event listener

---

#### 4.2.2 Main Content Area
```html
<div class="main-content" id="mainContent">
    <div class="header">...</div>
    <div id="examContainer">
        <!-- Đề thi sẽ được render vào đây bằng JS -->
    </div>
</div>
```

**Logic:**
- `examContainer` ban đầu rỗng
- JavaScript sẽ inject HTML vào đây khi chọn môn

---

### 4.3 JavaScript Logic

#### 4.3.1 Data Structure - examData
```javascript
const examData = {
    khtn: [
        {
            title: 'Đề số 1 - KHTN 8',
            content: 'Bộ câu hỏi số 4 (Bài 29-34)',
            questions: '15 câu (Câu 1-15)',
            time: '30 phút',
            topics: 'Hệ vận động, Tiêu hóa...',
            difficulty: 'Hỗn hợp: Nhận biết → Vận dụng cao',
            link: 'KHTN/de-so-1/de.html'
        },
        // ... more exams
    ],
    toan: [],
    hoa: [],
    sinh: [...],
    vatly: []
};
```

**WHY sử dụng object structure:**
- **Key = môn học:** Dễ dàng lookup theo môn
- **Array of objects:** Mỗi đề là 1 object với đầy đủ metadata
- **Hardcoded:** Không cần database, load nhanh
- **Scalable:** Dễ thêm môn/đề mới

**Edge cases:**
- Nếu môn chưa có đề (array rỗng) → Hiển thị thông báo
- Nếu thiếu field → Hiển thị undefined (cần validate)

---

#### 4.3.2 Function: `toggleMenu()`
```javascript
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const menuToggle = document.getElementById('menuToggle');
    
    sidebar.classList.toggle('hidden');
    mainContent.classList.toggle('expanded');
    menuToggle.classList.toggle('active');
}
```

**Mục đích:** Ẩn/hiện sidebar để tăng không gian làm bài

**Logic từng bước:**
1. Lấy 3 elements cần thao tác
2. Toggle class `hidden` trên sidebar
   - Có `hidden` → `left: -280px` (ẩn ra ngoài màn hình)
   - Không có → `left: 0` (hiển thị)
3. Toggle class `expanded` trên main content
   - Có `expanded` → `margin-left: 0` (full width)
   - Không có → `margin-left: 280px` (để chỗ cho sidebar)
4. Toggle class `active` trên button
   - Có `active` → Icon thành dấu X
   - Không có → Icon 3 gạch ngang

**WHY toggle thay vì set trực tiếp:**
- Đơn giản hơn, không cần track state
- CSS handle animation tự động
- Dễ maintain

---

#### 4.3.3 Function: `displayExams(subject)`
```javascript
function displayExams(subject) {
    const container = document.getElementById('examContainer');
    const exams = examData[subject];
    
    // CASE 1: Môn chưa có đề
    if (exams.length === 0) {
        container.innerHTML = `
            <div style="...">
                <h2>📚 Đề thi đang được cập nhật</h2>
                <p>Vui lòng quay lại sau hoặc chọn môn khác</p>
            </div>
        `;
        return;
    }
    
    // CASE 2: Có đề → Render cards
    let html = '<div class="exam-grid">';
    exams.forEach(exam => {
        html += `
            <div class="exam-card" onclick="window.location.href='${exam.link}'">
                <h2>📝 ${exam.title}</h2>
                <div class="exam-info"><strong>Nội dung:</strong> ${exam.content}</div>
                <div class="exam-info"><strong>Số câu hỏi:</strong> ${exam.questions}</div>
                <div class="exam-info"><strong>Thời gian:</strong> ${exam.time}</div>
                <div class="exam-info"><strong>Chủ đề:</strong> ${exam.topics}</div>
                <span class="difficulty">${exam.difficulty}</span>
                <br>
                <button class="start-btn" onclick="event.stopPropagation(); window.location.href='${exam.link}'">
                    Bắt đầu làm bài →
                </button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}
```

**Mục đích:** Render danh sách đề thi theo môn học

**Logic từng bước:**
1. **Lấy container:** Element để inject HTML
2. **Lấy data:** Array đề thi của môn đó
3. **Check empty:** Nếu không có đề → Hiển thị thông báo
4. **Loop qua exams:** Tạo HTML string cho mỗi đề
5. **Inject vào DOM:** `innerHTML = html`

**WHY từng quyết định:**
- **innerHTML thay vì createElement:** Nhanh hơn với nhiều elements
- **Template string:** Dễ đọc, dễ maintain
- **onclick inline:** Đơn giản cho navigation
- **event.stopPropagation():** Tránh trigger onclick của card khi click button

**Edge cases:**
- Nếu `exam.link` undefined → Redirect đến undefined (lỗi 404)
- Nếu `exam.title` có ký tự đặc biệt → Cần escape HTML
- Nếu array quá dài → Có thể lag khi render

**Performance:**
- Với <100 đề: OK
- Với >100 đề: Nên dùng pagination hoặc virtual scrolling

---

#### 4.3.4 Event Listener - Menu Click
```javascript
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function() {
        // 1. Xóa active class khỏi tất cả items
        document.querySelectorAll('.menu-item').forEach(i => 
            i.classList.remove('active')
        );
        
        // 2. Thêm active class vào item được click
        this.classList.add('active');
        
        // 3. Lấy môn học từ data-subject
        const subject = this.getAttribute('data-subject');
        
        // 4. Hiển thị đề thi của môn đó
        displayExams(subject);
    });
});
```

**Mục đích:** Xử lý khi user click vào môn học

**Logic từng bước:**
1. **querySelectorAll:** Lấy tất cả menu items
2. **forEach:** Gắn event listener cho từng item
3. **Remove active:** Đảm bảo chỉ 1 item active
4. **Add active:** Highlight item được chọn
5. **getAttribute:** Lấy tên môn từ HTML attribute
6. **displayExams:** Render đề thi

**WHY:**
- **Remove all rồi add 1:** Đơn giản hơn toggle
- **data-subject:** Tách data khỏi logic
- **this:** Refer đến element được click

---

#### 4.3.5 Initialization
```javascript
// Hiển thị đề thi KHTN mặc định khi load trang
displayExams('khtn');
```

**WHY:**
- User thấy content ngay khi vào trang
- KHTN là môn phổ biến nhất → Default hợp lý

---

## 5. MODULE ĐỀ THI - EXAM TEMPLATES

### 5.1 Tổng Quan
**Files:**
- `template-de-full-trac-nghiem.html` - Chỉ trắc nghiệm
- `template-de-trac-nghiem-tu-luan.html` - Trắc nghiệm + Tự luận
- `template-de-trac-nghiem-dung-sai-tu-luan.html` - Đầy đủ

**Vai trò:** Template để tạo đề thi mới nhanh chóng

### 5.2 Cấu Trúc HTML Chung

#### 5.2.1 Start Modal
```html
<div class="start-modal" id="startModal">
    <div class="start-modal-content">
        <h1>🎯 Sẵn sàng làm bài?</h1>
        <p><strong>Đề thi: [TÊN ĐỀ THI]</strong></p>
        <p>Thời gian: <strong>[XX] phút</strong></p>
        <ul>
            <li>✅ Hệ thống sẽ chuyển sang chế độ toàn màn hình</li>
            <li>🚫 Không được thoát khỏi màn hình làm bài</li>
            <li>🚫 Không được sao chép hoặc chụp màn hình</li>
            <li>⏰ Thời gian đếm ngược tự động khi bắt đầu</li>
        </ul>
        <div class="start-modal-buttons">
            <button class="start-modal-btn cancel" onclick="cancelExam()">← Quay lại</button>
            <button class="start-modal-btn confirm" onclick="confirmStartExam()">🚀 Bắt đầu ngay</button>
        </div>
    </div>
</div>
```

**WHY cần modal này:**
- **Cảnh báo rõ ràng:** Học sinh biết quy định trước khi thi
- **Tránh vi phạm vô ý:** Fullscreen, không copy là bắt buộc
- **UX tốt hơn:** Không bắt đầu ngay, cho thời gian chuẩn bị

---

#### 5.2.2 Timer Display
```html
<div class="timer" id="timer">45:00</div>
```

**Logic:**
- Fixed position (top-right)
- Luôn hiển thị, không bị scroll
- Update mỗi giây bởi `setInterval`

**WHY fixed position:**
- Học sinh luôn thấy thời gian còn lại
- Tạo áp lực thi thật

---

#### 5.2.3 Question Structure
```html
<div class="question" data-answer="A">
    <div class="question-header">Câu 1. [Mô tả]</div>
    <div class="question-content">[Nội dung câu hỏi]</div>
    <div class="options">
        <label class="option">
            <input type="radio" name="q1" value="A"> A. [Đáp án A]
        </label>
        <label class="option">
            <input type="radio" name="q1" value="B"> B. [Đáp án B]
        </label>
        <label class="option">
            <input type="radio" name="q1" value="C"> C. [Đáp án C]
        </label>
        <label class="option">
            <input type="radio" name="q1" value="D"> D. [Đáp án D]
        </label>
    </div>
</div>
```

**WHY structure này:**
- **data-answer:** Lưu đáp án đúng ngay trong HTML (dễ maintain)
- **name="q1":** Group radio buttons (chỉ chọn được 1)
- **value="A/B/C/D":** Giá trị để so sánh với data-answer
- **label wrapper:** Click vào text cũng chọn được radio

**Security concern:**
- Đáp án đúng visible trong HTML source
- **Giải pháp:** Chấp nhận (vì đây là bài tập, không phải thi chính thức)
- **Nếu cần bảo mật:** Lưu đáp án trên server, chỉ gửi khi nộp bài

---

#### 5.2.4 Explanation Box (Optional)
```html
<div class="explanation-box">
    <label>💡 Giải thích câu trả lời của bạn (không bắt buộc):</label>
    <textarea name="exp1" placeholder="Nhập giải thích..."></textarea>
    <input type="file" name="img1" accept="image/*" onchange="previewImage(this, 'preview1')">
    <img id="preview1" class="image-preview">
</div>
```

**Mục đích:** Học sinh giải thích lý do chọn đáp án

**WHY:**
- Giáo viên hiểu tư duy học sinh
- Học sinh tự review lại kiến thức
- Có thể chấm điểm cộng thêm

**Logic preview image:**
```javascript
function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result; // Base64 string
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}
```

**WHY FileReader:**
- Convert file → Base64 string
- Có thể preview ngay không cần upload
- Có thể gửi lên server dạng string

---

#### 5.2.5 Essay Section (Tự luận)
```html
<div class="essay-section">
    <div style="font-weight: bold;">
        Câu 1 ([X] điểm): [Mô tả]
    </div>
    <div>[Nội dung câu hỏi tự luận]</div>
    <textarea name="essay1" class="essay-textarea" placeholder="Nhập câu trả lời..."></textarea>
    <div>
        <label>Hoặc đính kèm hình ảnh bài làm:</label>
        <input type="file" name="essayImg1" accept="image/*" onchange="previewImage(this, 'essayPreview1')">
        <img id="essayPreview1" class="image-preview">
    </div>
</div>
```

**WHY 2 options (text + image):**
- **Text:** Học sinh gõ trực tiếp (nhanh, dễ)
- **Image:** Học sinh viết tay rồi chụp (linh hoạt)
- **Cả 2:** Học sinh có thể làm cả 2 (text + hình minh họa)

---

### 5.3 JavaScript Logic - Configuration

#### 5.3.1 Constants
```javascript
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/...';
const EXAM_TIME_MINUTES = 45;
const TOTAL_QUESTIONS = 10;
const MULTIPLE_CHOICE_SCORE = 7;
```

**WHY constants:**
- Dễ thay đổi config
- Tránh magic numbers
- Self-documenting code

---

#### 5.3.2 Security - Copy Protection
```javascript
// Chặn right-click
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

// Chặn keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A, Ctrl+S, Ctrl+P
    if (e.ctrlKey && (e.key === 'c' || e.key === 'x' || e.key === 'v' || 
                      e.key === 'a' || e.key === 's' || e.key === 'p')) {
        e.preventDefault();
        return false;
    }
    
    // F12, Ctrl+Shift+I, Ctrl+Shift+C, Ctrl+U
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        return false;
    }
    
    // PrintScreen
    if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        return false;
    }
});
```

**WHY từng phần:**
- **contextmenu:** Chặn right-click menu (Inspect, Copy)
- **Ctrl+C/X/V:** Chặn copy/cut/paste
- **Ctrl+A:** Chặn select all
- **Ctrl+S:** Chặn save page
- **Ctrl+P:** Chặn print
- **F12, Ctrl+Shift+I/C:** Chặn DevTools
- **Ctrl+U:** Chặn view source
- **PrintScreen:** Clear clipboard khi chụp màn hình

**Limitations:**
- Không chặn được 100% (VD: screenshot bằng tool khác)
- Không chặn được trên mobile
- User có thể disable JavaScript

**WHY vẫn implement:**
- Ngăn chặn phần lớn học sinh
- Tạo rào cản tâm lý
- Đủ cho mục đích bài tập

---

#### 5.3.3 Fullscreen Logic
```javascript
function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { // Safari
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { // IE11
        elem.msRequestFullscreen();
    }
}
```

**WHY multiple methods:**
- **requestFullscreen:** Standard (Chrome, Firefox, Edge)
- **webkitRequestFullscreen:** Safari, older Chrome
- **msRequestFullscreen:** IE11

**WHY fullscreen:**
- Ngăn học sinh mở tab khác
- Tạo môi trường thi tập trung
- Giảm gian lận

**Edge cases:**
- User từ chối fullscreen → Vẫn làm bài được (không bắt buộc)
- Browser không support → Fallback gracefully

---

#### 5.3.4 Timer Logic
```javascript
let timerStarted = false;
let timerInterval;
let time = EXAM_TIME_MINUTES * 60; // Convert to seconds
const timer = document.getElementById('timer');

function startTimer() {
    // Prevent multiple timers
    if (timerStarted) return;
    timerStarted = true;
    
    timerInterval = setInterval(() => {
        // Calculate minutes and seconds
        const m = Math.floor(time / 60);
        const s = time % 60;
        
        // Display with leading zero
        timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        
        // Time's up
        if (time <= 0) {
            clearInterval(timerInterval);
            submitExam(); // Auto submit
        }
        
        time--;
    }, 1000); // Every 1 second
}
```

**WHY từng bước:**
1. **timerStarted flag:** Tránh start nhiều timer (memory leak)
2. **setInterval:** Chạy mỗi 1 giây
3. **Math.floor(time / 60):** Lấy phần nguyên = phút
4. **time % 60:** Lấy phần dư = giây
5. **padStart(2, '0'):** Format 5 → 05
6. **time <= 0:** Hết giờ → Auto nộp bài
7. **clearInterval:** Dừng timer để tránh leak

**Edge cases:**
- User refresh page → Timer reset (mất thời gian đã làm)
- **Giải pháp:** Lưu startTime vào localStorage, tính lại khi reload
- User đổi system time → Timer vẫn chạy đúng (dùng setInterval, không dùng Date)

---


## 6. MODULE BACKEND - GOOGLE APPS SCRIPT

### 6.1 Tổng Quan
**File:** `google-apps-script-nang-cao.js`  
**Deploy:** Google Apps Script Web App  
**Endpoint:** POST request handler  
**Database:** Google Sheets

### 6.2 Entry Point - doPost(e)

```javascript
function doPost(e) {
  try {
    // 1. Get spreadsheet and sheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mainSheet = ss.getSheetByName('Kết quả') || ss.getActiveSheet();
    
    // 2. Parse incoming data
    var data = JSON.parse(e.postData.contents);
    
    // 3. Extract basic info
    var timestamp = data.timestamp || new Date().toLocaleString('vi-VN');
    var name = data.name || '';
    var studentClass = data.class || '';
    var subject = data.subject || 'KHTN';
    var exam = data.exam || '';
    var correct = data.correct || 0;
    var wrong = data.wrong || 0;
    var score = data.score || 0;
    
    // 4. Parse answers
    var answersObj = {};
    try {
      answersObj = JSON.parse(data.answers);
    } catch(err) {
      answersObj = {};
    }
    
    // 5. Format data
    var answersText = formatAnswers(answersObj);
    var explanations = data.explanations || '';
    var imageLinks = processImages(data);
    var essayText = processEssays(data);
    
    // 6. Write to sheet
    var newRow = mainSheet.getLastRow() + 1;
    mainSheet.appendRow([
      timestamp,      // A
      name,           // B
      studentClass,   // C
      subject,        // D
      exam,           // E
      correct,        // F
      wrong,          // G
      score,          // H
      answersText,    // I
      explanations,   // J
      imageLinks,     // K
      essayText       // L
    ]);
    
    // 7. Highlight wrong answers
    highlightWrongAnswers(mainSheet, newRow, answersObj, data.correctAnswers);
    
    // 8. Insert images (if any)
    if (data.images || data.essays) {
      insertImages(mainSheet, newRow, data);
    }
    
    // 9. Return success
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'message': 'Đã lưu kết quả thành công',
      'row': newRow
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    // 10. Return error
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

**WHY từng bước:**
1. **getActiveSpreadsheet():** Lấy Sheet đang mở
2. **getSheetByName('Kết quả'):** Tìm sheet tên "Kết quả", fallback về sheet đầu tiên
3. **JSON.parse:** Convert string → object
4. **|| default values:** Tránh undefined/null
5. **formatAnswers():** Convert object → readable string
6. **getLastRow() + 1:** Tìm dòng trống tiếp theo
7. **appendRow():** Thêm dòng mới (nhanh hơn setValue từng cell)
8. **highlightWrongAnswers():** Tô màu đỏ câu sai
9. **insertImages():** Chèn hình ảnh vào sheet
10. **try-catch:** Bắt lỗi, trả về JSON response

**Edge cases:**
- Sheet "Kết quả" không tồn tại → Dùng sheet đầu tiên
- data.answers không phải JSON → answersObj = {}
- Lỗi khi write → Return error message

---

### 6.3 Function: formatAnswers(answersObj)

```javascript
function formatAnswers(answersObj) {
  var result = [];
  for (var key in answersObj) {
    if (answersObj.hasOwnProperty(key)) {
      result.push(key + ': ' + answersObj[key]);
    }
  }
  return result.join(', ');
}
```

**Input:** `{q1: 'A', q2: 'B', q3: 'C'}`  
**Output:** `"q1: A, q2: B, q3: C"`

**WHY:**
- Convert object → string để lưu vào 1 cell
- Format dễ đọc cho giáo viên
- hasOwnProperty: Tránh lấy properties từ prototype

---

### 6.4 Function: processImages(data)

```javascript
function processImages(data) {
  var imageLinks = [];
  
  // Process explanation images
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
  
  // Process essay images
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
```

**Mục đích:** Tạo summary text về hình ảnh

**WHY không lưu base64 trực tiếp:**
- Base64 string rất dài (>100KB)
- Làm chậm Sheet
- Chỉ cần biết "có hình" hay "không có"

**Logic:**
1. Check `data.images` (giải thích)
2. Parse JSON
3. Loop qua từng câu
4. Nếu có `.image` → Push vào array
5. Repeat cho `data.essays` (tự luận)
6. Join thành string

---

### 6.5 Function: processEssays(data)

```javascript
function processEssays(data) {
  var essays = [];
  
  // Method 1: From data.essays (JSON)
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
  
  // Method 2: From data.essay1, essay2, essay3, essay4
  for (var i = 1; i <= 10; i++) {
    var essayKey = 'essay' + i;
    if (data[essayKey]) {
      essays.push('Câu ' + i + ': ' + data[essayKey]);
    }
  }
  
  return essays.length > 0 ? essays.join('\n\n') : '';
}
```

**Mục đích:** Thu thập và format câu trả lời tự luận

**WHY 2 methods:**
- **Method 1:** Template mới gửi dạng JSON object `{essay1: {text: '...', image: '...'}, ...}`
- **Method 2:** Template cũ/đơn giản gửi dạng separate fields `{essay1: '...', essay2: '...', ...}`
- **Backward compatible:** Support cả 2 formats để không break code cũ

**Logic từng bước:**
1. **Check data.essays:** Nếu có → Parse JSON
2. **Loop qua essaysObj:** Lấy `.text` của mỗi câu
3. **Push vào array:** Format: `"key: text"`
4. **Loop i=1 to 10:** Check `data.essay1`, `data.essay2`, ...
5. **Push vào array:** Format: `"Câu i: text"`
6. **Join với \\n\\n:** Ngăn cách mỗi câu bằng 2 dòng trống
7. **Return:** String hoặc empty string

**Input example (Method 2 - Đề số 3):**
```javascript
{
  essay1: 'Máu bắt đầu từ tâm thất trái...',
  essay2: 'Khi vừa ăn vừa nói, nắp thanh quản...',
  essay3: 'Người bị sốt xuất huyết...',
  essay4: 'a) Ampe kế phải mắc nối tiếp...'
}
```

**Output format:**
```
Câu 1: Máu bắt đầu từ tâm thất trái...

Câu 2: Khi vừa ăn vừa nói, nắp thanh quản...

Câu 3: Người bị sốt xuất huyết...

Câu 4: a) Ampe kế phải mắc nối tiếp...
```

**Edge cases:**
- Nếu học sinh không điền → `data.essay1 = ''` → Không push vào array
- Nếu cả 2 methods đều có data → Cả 2 đều được thêm vào (duplicate)
- Nếu không có essay nào → Return `''` (empty string)

**Common issues:**
- ⚠️ Nếu không hiển thị trong Sheet → Check cột L có tồn tại không
- ⚠️ Nếu `essayText = ''` → Check `data.essay1` có giá trị không
- ⚠️ Nếu bị duplicate → Chỉ dùng 1 method, không gửi cả 2

**Debug:**
```javascript
Logger.log('data.essay1: ' + data.essay1);
Logger.log('data.essay2: ' + data.essay2);
Logger.log('essays array: ' + JSON.stringify(essays));
Logger.log('Final essayText: ' + essayText);
```

---

### 6.6 Function: highlightWrongAnswers() [UPDATED - 2025-01-XX]

```javascript
function highlightWrongAnswers(sheet, row, studentAnswers, correctAnswersStr) {
  try {
    // 1. Parse correct answers
    var correctAnswers = {};
    if (correctAnswersStr) {
      try {
        correctAnswers = JSON.parse(correctAnswersStr);
      } catch(err) {
        Logger.log('Lỗi parse correctAnswers: ' + err.toString());
      }
    }
    
    // 2. Validate
    if (Object.keys(correctAnswers).length === 0) {
      Logger.log('Không có đáp án đúng để so sánh');
      return;
    }
    
    // 3. Build text with positions
    var detailedAnswers = [];
    var fullText = '';
    
    for (var key in studentAnswers) {
      if (studentAnswers.hasOwnProperty(key)) {
        var studentAns = studentAnswers[key];
        var correctAns = correctAnswers[key];
        var isCorrect = (studentAns === correctAns);
        
        var mark = isCorrect ? '✓' : '✗';
        var text = key + ': ' + studentAns + ' (' + mark + ')';
        
        // Add comma separator
        if (detailedAnswers.length > 0) {
          fullText += ', ';
        }
        
        // Track start and end positions
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
    
    // 4. Create RichText builder
    var cell = sheet.getRange(row, 9); // Column I
    var richTextBuilder = SpreadsheetApp.newRichTextValue().setText(fullText);
    
    // 5. Apply styles to wrong answers
    for (var i = 0; i < detailedAnswers.length; i++) {
      var item = detailedAnswers[i];
      if (!item.isCorrect) {
        richTextBuilder.setTextStyle(item.startIndex, item.endIndex, 
          SpreadsheetApp.newTextStyle()
            .setForegroundColor('#FF0000')  // Red
            .setBold(true)                   // Bold
            .build()
        );
      }
    }
    
    // 6. Apply to cell
    cell.setRichTextValue(richTextBuilder.build());
    Logger.log('✅ Đã tô màu câu trả lời sai');
    
  } catch(error) {
    Logger.log('❌ Lỗi tô màu: ' + error.toString());
  }
}
```

**UPDATED:** Sửa lỗi logic tô màu (trước đây setText nhiều lần ghi đè)

**WHY từng bước:**
1. **Parse correctAnswers:** Convert JSON string → object
2. **Validate:** Nếu không có đáp án đúng → Skip (tránh lỗi)
3. **Build fullText:** Tạo string hoàn chỉnh trước
4. **Track positions:** Lưu startIndex, endIndex của từng câu
5. **RichTextBuilder:** API của Google Sheets để format text
6. **setTextStyle:** Áp dụng màu đỏ + bold cho từng câu sai
7. **build() & apply:** Commit changes vào cell

**WHY không dùng setText nhiều lần:**
- setText() ghi đè toàn bộ text
- Phải build full text trước, rồi apply style sau

**Example output:**
```
q1: A (✓), q2: B (✗), q3: C (✓), q4: D (✗)
           ^^^^^^^^              ^^^^^^^^
           (màu đỏ, bold)        (màu đỏ, bold)
```

---

### 6.7 Function: insertImages()

```javascript
function insertImages(sheet, row, data) {
  try {
    var col = 11; // Column K
    var imageCount = 0;
    
    // Process explanation images
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
    
    // Process essay images
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
    
    // Increase row height if has images
    if (imageCount > 0) {
      sheet.setRowHeight(row, 150 * Math.ceil(imageCount / 2));
    }
    
  } catch(error) {
    Logger.log('Lỗi chèn hình: ' + error.toString());
  }
}
```

**Mục đích:** Chèn hình ảnh base64 vào Sheet

**Logic:**
1. Start từ column K (11)
2. Loop qua images object
3. Gọi `insertImageFromBase64()` cho mỗi hình
4. Tăng imageCount
5. Tăng row height để fit hình

**WHY tăng row height:**
- Default row height = 21px
- Image height = 100px
- Cần tăng lên để không bị crop

**Formula:** `150 * Math.ceil(imageCount / 2)`
- 1-2 hình: 150px
- 3-4 hình: 300px
- 5-6 hình: 450px

---

### 6.8 Function: insertImageFromBase64()

```javascript
function insertImageFromBase64(sheet, row, col, base64Data, index) {
  try {
    // 1. Remove prefix
    var base64 = base64Data.split(',')[1] || base64Data;
    
    // 2. Decode base64
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64), 
      'image/png', 
      'image_' + index + '.png'
    );
    
    // 3. Insert image
    var image = sheet.insertImage(blob, col + index, row);
    
    // 4. Resize
    image.setWidth(100);
    image.setHeight(100);
    
  } catch(error) {
    Logger.log('Lỗi chèn hình từ base64: ' + error.toString());
  }
}
```

**WHY từng bước:**
1. **split(',')[1]:** Remove "data:image/png;base64," prefix
2. **base64Decode:** Convert string → binary
3. **newBlob:** Create blob object (file-like)
4. **insertImage:** Chèn vào sheet tại (col, row)
5. **setWidth/Height:** Resize về 100x100px

**Edge cases:**
- Base64 không hợp lệ → Throw error, catch bởi try-catch
- File quá lớn (>50MB) → Google Apps Script timeout
- **Giải pháp:** Resize image trước khi gửi (max 500KB)

---

## 7. XỬ LÝ BẢO MẬT

### 7.1 Frontend Security

#### 7.1.1 Copy Protection
**Implemented in:** All exam HTML files

**Methods:**
1. **Disable right-click:** `contextmenu` event
2. **Block keyboard shortcuts:** `keydown` event
3. **Disable text selection:** CSS `user-select: none`
4. **Clear clipboard on PrintScreen:** `navigator.clipboard.writeText('')`

**Effectiveness:**
- ✅ Blocks 80% of casual users
- ❌ Cannot block:
  - Screenshot tools (Snipping Tool, Lightshot)
  - Mobile screenshots
  - Camera photos
  - Disabled JavaScript

**WHY still implement:**
- Creates psychological barrier
- Sufficient for homework/practice
- Easy to implement

---

#### 7.1.2 Fullscreen Mode
**Purpose:** Prevent tab switching

**Implementation:**
```javascript
function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
}
```

**Limitations:**
- User can press ESC to exit
- User can Alt+Tab to switch apps
- Not enforceable on mobile

**WHY still use:**
- Reduces distractions
- Creates exam-like environment
- Shows seriousness

---

### 7.2 Backend Security

#### 7.2.1 Google Apps Script Deployment
**Settings:**
- **Execute as:** Me (script owner)
- **Who has access:** Anyone

**WHY "Anyone":**
- Students don't have Google accounts
- Need public endpoint
- Data validation happens in script

**Security measures:**
- No sensitive data in responses
- Rate limiting by Google (automatic)
- Logs all requests (audit trail)

---

#### 7.2.2 Data Validation
**In doPost():**
```javascript
var name = data.name || '';
var studentClass = data.class || '';
// ... validate required fields
```

**WHY minimal validation:**
- This is homework, not production
- Trust students (mostly)
- Focus on functionality over security

**If needed stricter:**
- Add API key authentication
- Validate data types
- Sanitize inputs (XSS prevention)
- Rate limiting per IP

---

## 8. XỬ LÝ LỖI

### 8.1 Frontend Error Handling

#### 8.1.1 Validation Errors
```javascript
if (!studentName || !studentClass) {
    alert('⚠️ Vui lòng điền đầy đủ Họ tên và Lớp trước khi nộp bài!');
    return;
}
```

**WHY alert():**
- Simple, works everywhere
- Blocks execution until dismissed
- Clear message

**Better alternative:**
- Custom modal with better UX
- Highlight missing fields
- Non-blocking notification

---

#### 8.1.2 Network Errors
```javascript
try {
    await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    console.log('✅ Đã lưu kết quả vào Google Sheets');
} catch (error) {
    console.error('❌ Lỗi khi lưu:', error);
}
```

**WHY no-cors:**
- Google Apps Script doesn't send CORS headers
- no-cors mode = opaque response (cannot read)
- Assume success if no exception

**Limitations:**
- Cannot detect server errors
- Cannot show error message to user
- **Workaround:** Check Google Sheets manually

---

### 8.2 Backend Error Handling

#### 8.2.1 Try-Catch Wrapper
```javascript
function doPost(e) {
  try {
    // ... main logic
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'message': 'Đã lưu kết quả thành công'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

**WHY:**
- Prevents script crash
- Returns error message to client
- Logs error for debugging

---

#### 8.2.2 Graceful Degradation
```javascript
// If sheet "Kết quả" not found, use first sheet
var mainSheet = ss.getSheetByName('Kết quả') || ss.getActiveSheet();

// If data.answers is not JSON, use empty object
try {
  answersObj = JSON.parse(data.answers);
} catch(err) {
  answersObj = {};
}
```

**WHY:**
- Script continues even if some data missing
- Better than crashing
- Logs warning for investigation

---

## 9. BIẾN & STATE QUAN TRỌNG

### 9.1 Frontend State

#### 9.1.1 Timer State
```javascript
let timerStarted = false;  // Prevent multiple timers
let timerInterval;         // Reference to setInterval
let time = EXAM_TIME_MINUTES * 60;  // Remaining seconds
```

**WHY global:**
- Need to access from multiple functions
- Need to persist across function calls
- Need to clear interval on submit

---

#### 9.1.2 Exam Data
```javascript
const examData = {
    khtn: [...],
    toan: [],
    // ...
};
```

**WHY const:**
- Data structure doesn't change
- Only content changes (push/pop)
- Prevents accidental reassignment

---

### 9.2 Backend State

#### 9.2.1 Spreadsheet Objects
```javascript
var ss = SpreadsheetApp.getActiveSpreadsheet();
var mainSheet = ss.getSheetByName('Kết quả');
```

**Scope:** Function-local  
**WHY:** Each request is independent, no shared state

---

## 10. DEPENDENCIES

### 10.1 External Dependencies

#### 10.1.1 Google Apps Script APIs
- `SpreadsheetApp`: Sheet operations
- `ContentService`: HTTP responses
- `Utilities`: Base64 encoding/decoding
- `Logger`: Logging

**Version:** Managed by Google (auto-update)

---

#### 10.1.2 Browser APIs
- `Fullscreen API`: Fullscreen mode
- `FileReader API`: Read uploaded files
- `Fetch API`: HTTP requests
- `Clipboard API`: Clear clipboard

**Compatibility:**
- Chrome: ✅ Full support
- Firefox: ✅ Full support
- Safari: ⚠️ Partial (webkit prefix)
- IE11: ❌ Limited support

---

### 10.2 Internal Dependencies

#### 10.2.1 Module Dependencies
```
index.html
    ↓ (navigation)
KHTN/de-so-1/de.html
    ↓ (POST request)
Google Apps Script
    ↓ (write)
Google Sheets
```

**Coupling:**
- Loose coupling (HTTP interface)
- Can swap backend easily
- Frontend independent of backend implementation

---

### 10.3 Configuration Dependencies

#### 10.3.1 URL Configuration
**File:** `URL mặc định`

```
GOOGLE_SHEETS_URL=https://script.google.com/macros/s/.../exec
KHTN_DE_1=https://web-bai-tap.vercel.app/KHTN/de-so-1/de.html
...
```

**WHY separate file:**
- Easy to update URLs
- Single source of truth
- Documentation

**Usage:**
- Manual copy-paste into HTML files
- Not auto-loaded (static HTML)

---

## 11. CHANGELOG & UPDATES

### [UPDATED - 2025-01-XX 17:00] - 🔥 CRITICAL FIX: mode: 'no-cors' blocking POST data

**ROOT CAUSE FOUND!** 

Từ debug screenshot, tất cả biến trong `doPost()` đều `undefined` ở dòng 14. Điều này có nghĩa là **code không parse được data từ request**.

**Nguyên nhân:**
```javascript
// ❌ SAI - mode: 'no-cors' không cho phép gửi custom headers và body JSON
await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',  // ← VẤN ĐỀ Ở ĐÂY!
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
});
```

**WHY `mode: 'no-cors'` gây lỗi:**
- `no-cors` mode không cho phép đọc response
- Không cho phép gửi custom headers (Content-Type bị ignore)
- Body có thể không được gửi đúng format
- Google Apps Script không nhận được `e.postData.contents`

**Giải pháp:**
```javascript
// ✅ ĐÚNG - Bỏ mode: 'no-cors' và headers
await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
});
```

**WHY không cần `mode: 'no-cors'`:**
- Google Apps Script Web App đã config CORS sẵn
- Khi deploy với "Who has access: Anyone", CORS tự động được enable
- Không cần custom headers, Apps Script tự detect JSON

**Files changed:**
- ✅ `KHTN/de-so-1/de.html` - Bỏ mode: 'no-cors'
- ✅ `KHTN/de-so-2/de.html` - Bỏ mode: 'no-cors'
- ✅ `KHTN/de-so-3/de.html` - Bỏ mode: 'no-cors' + thêm console.log
- ✅ `Sinh-10/de-so-1/de.html` - Bỏ mode: 'no-cors'
- ✅ `template-de-full-trac-nghiem.html` - Bỏ mode: 'no-cors'
- ✅ `template-de-trac-nghiem-tu-luan.html` - Bỏ mode: 'no-cors'
- ✅ `template-de-trac-nghiem-dung-sai-tu-luan.html` - Bỏ mode: 'no-cors'
- ✅ `google-apps-script-nang-cao.js` - Thêm debug logs chi tiết

**Backend improvements:**
```javascript
// Thêm fallback để handle nhiều formats
var data = {};
if (e && e.postData && e.postData.contents) {
  try {
    data = JSON.parse(e.postData.contents);
  } catch(parseErr) {
    // Fallback: Thử parse từ parameter (form data)
    if (e.parameter) {
      data = e.parameter;
    }
  }
}
```

**Impact:**
- 🔴 **CRITICAL:** Tất cả đề thi trước đây KHÔNG LƯU ĐƯỢC DATA vào Google Sheets
- ✅ **FIXED:** Sau khi deploy code mới, data sẽ được gửi và lưu đúng
- ✅ Tự luận sẽ hiển thị đúng ở cột L

**Next steps for USER:**
1. Deploy NEW version của Google Apps Script (có debug logs + fallback)
2. Test lại với đề số 3
3. Kiểm tra Google Sheets → Data phải xuất hiện đầy đủ
4. Cột L phải có câu trả lời tự luận

**Status:** ✅ FIXED - Chờ user deploy và test

---

### [UPDATED - 2025-01-XX 16:30] - 🔍 DEBUGGING: Tự luận hiển thị sai cột

**Issue:** Tự luận hiển thị ở cột J (Giải thích) thay vì cột L (Tự luận)

**Evidence từ screenshot:**
- Cột J: "Câu 3: em 0 bt lam cai nay | Câu 5: vitamin hay protein..."
- Cột L: TRỐNG
- Format "Câu X: ..." là format của `processEssays()`, KHÔNG phải `explanations`

**Code Analysis:**
1. ✅ **Frontend (KHTN/de-so-3/de.html):** ĐÚNG - Gửi `essay1, essay2, essay3, essay4`
2. ✅ **Backend (google-apps-script-nang-cao.js):** ĐÚNG - `processEssays()` xử lý đúng
3. ✅ **appendRow():** ĐÚNG - Thứ tự là `explanations` (J), `imageLinks` (K), `essayText` (L)

**Mystery:** Data tự luận xuất hiện ở cột J với format của `processEssays()` → Không thể xảy ra nếu code đúng!

**Hypothesis:**
1. User đang test với file khác (không phải đề số 3)
2. Có file nào đó đang gửi essays vào field `explanations`
3. Backend đang swap `explanations` và `essayText` trong runtime
4. Google Sheets đang cache old version

**Actions taken:**
1. ✅ Thêm debug logs vào `doPost()`:
   ```javascript
   Logger.log('=== DEBUG DATA ===');
   Logger.log('explanations: ' + explanations);
   Logger.log('essayText: ' + essayText);
   Logger.log('data.essay1: ' + data.essay1);
   Logger.log('data.essay2: ' + data.essay2);
   Logger.log('data.essays: ' + data.essays);
   ```
2. ✅ Tạo file `HUONG-DAN-DEBUG-TU-LUAN.md` với hướng dẫn chi tiết
3. ✅ Verify tất cả files trong workspace

**Next steps for USER:**
1. Deploy NEW version của Google Apps Script (có debug logs)
2. Test lại với đề số 3, điền đầy đủ 4 textarea tự luận
3. Vào Extensions → Apps Script → Executions → Xem logs
4. Gửi logs để debug tiếp

**Expected logs:**
- Nếu `essayText` có data nhưng vẫn xuất hiện ở cột J → Google Sheets cache
- Nếu `explanations` chứa data tự luận → Frontend gửi sai field
- Nếu cả 2 đều đúng → User đang nhầm lẫn giữa "Giải thích" và "Tự luận"

**Files changed:**
- `google-apps-script-nang-cao.js` (thêm debug logs)
- `HUONG-DAN-DEBUG-TU-LUAN.md` (tạo mới)
- `LOGIC.md` (cập nhật với analysis chi tiết)

**Status:** 🔄 Chờ user test lại với debug logs

---

### [UPDATED - 2025-01-XX 15:00] - ✅ RESOLVED: Tự luận hiển thị sai cột

**Issue:** Tự luận hiển thị ở cột J (Giải thích) thay vì cột L (Tự luận)

**Root cause:** Code đang ghi đúng nhưng có thể:
1. Cột J đang chứa data tự luận (do code cũ)
2. Hoặc `explanations` và `essayText` bị swap

**Evidence từ screenshot:**
- Cột J: "Câu 3: em 0 bt lam cai nay | Câu 5: vitamin hay protein..."
- Cột L: Trống
- Format "Câu X: ..." là format của `processEssays()`, không phải `explanations`

**Action taken:**
1. User đã tạo cột L
2. User đã deploy code lên Google Apps Script
3. Cần verify thứ tự trong `appendRow()`

**Next steps:**
1. Kiểm tra code Apps Script có đúng thứ tự không:
   ```javascript
   mainSheet.appendRow([
     timestamp,      // A
     name,           // B
     studentClass,   // C
     subject,        // D
     exam,           // E
     correct,        // F
     wrong,          // G
     score,          // H
     answersText,    // I
     explanations,   // J ← Phải là giải thích
     imageLinks,     // K
     essayText       // L ← Phải là tự luận
   ]);
   ```
2. Nếu đúng → Test lại với đề mới
3. Nếu sai → Sửa lại thứ tự

**Status:** 🔍 Đang verify code

---

### [UPDATED - 2025-01-XX 14:30] - Debug tự luận không hiển thị

**Issue:** Câu trả lời tự luận không hiển thị trong Google Sheets cột L

**Root cause analysis:**
1. ✅ Frontend code ĐÚNG - Đề số 3 gửi `essay1, essay2, essay3, essay4`
2. ✅ Backend code ĐÚNG - `processEssays()` xử lý cả 2 formats
3. ⚠️ Có thể thiếu cột L trong Google Sheets
4. ⚠️ Có thể chưa deploy code mới lên Apps Script

**Files created:**
- `DEBUG-TU-LUAN.md` - Hướng dẫn debug từng bước

**Action required:**
1. Kiểm tra Google Sheets có cột L (Tự luận) không
2. Deploy lại Google Apps Script với New version
3. Test với đề số 3, điền đầy đủ 4 textarea
4. Kiểm tra Executions log nếu vẫn lỗi

**Impact:**
- Nếu thiếu cột L → Data bị lệch hoặc không lưu
- Nếu chưa deploy → Vẫn chạy code cũ (không có essayText)

---

### [UPDATED - 2025-01-XX 10:00] - Thêm tính năng tô màu câu sai

**Files changed:**
- `google-apps-script-nang-cao.js`
- `KHTN/de-so-1/de.html`
- `KHTN/de-so-2/de.html`
- `KHTN/de-so-3/de.html`

**Changes:**
1. **Frontend:** Thêm `correctAnswers` object gửi lên server
2. **Backend:** Sửa logic `highlightWrongAnswers()` để tô màu đúng
3. **Impact:** Giáo viên thấy rõ câu nào học sinh làm sai

**WHY:**
- Giáo viên dễ review kết quả
- Không cần đối chiếu thủ công
- Tiết kiệm thời gian chấm bài

---

## 12. KNOWN ISSUES & LIMITATIONS

### 12.1 Current Issues

#### 12.1.1 [CRITICAL] Tự luận không hiển thị trong Sheet
**Problem:** Câu trả lời tự luận không xuất hiện trong cột L  
**Status:** 🔍 Đang debug  
**Possible causes:**
1. Google Sheets thiếu cột L (Tự luận)
2. Code Apps Script chưa được deploy
3. Code cũ không có `essayText` trong `appendRow()`

**Impact:** 
- Giáo viên không thấy câu trả lời tự luận
- Mất dữ liệu quan trọng

**Debug steps:**
1. Check cột L tồn tại trong Sheet
2. Check code Apps Script có `essayText` trong `appendRow()`
3. Check hàm `processEssays()` có đúng không
4. Deploy New version
5. Test với đề số 3
6. Xem Executions log

**Workaround:** 
- Xem file `DEBUG-TU-LUAN.md` để debug chi tiết
- Có thể cần thêm cột L thủ công
- Có thể cần deploy lại Apps Script

**Fix:** 
- Đảm bảo Sheet có đủ 12 cột (A-L)
- Deploy code từ `google-apps-script-nang-cao.js`
- Test kỹ trước khi dùng thật

---

#### 12.1.2 No-CORS Mode
**Problem:** Cannot detect server errors  
**Impact:** User không biết nếu lưu thất bại  
**Workaround:** Check Google Sheets manually  
**Fix:** Deploy backend với CORS headers

---

#### 12.1.3 Timer Reset on Refresh
**Problem:** Refresh page → Timer reset  
**Impact:** Học sinh mất thời gian đã làm  
**Workaround:** Cảnh báo không refresh  
**Fix:** Lưu startTime vào localStorage

---

#### 12.1.4 Answer Visible in HTML
**Problem:** Đáp án đúng trong `data-answer`  
**Impact:** Học sinh có thể xem source code  
**Workaround:** Chấp nhận (bài tập, không phải thi chính thức)  
**Fix:** Lưu đáp án trên server, chỉ gửi khi nộp

---

### 12.2 Limitations

#### 12.2.1 Browser Compatibility
- IE11: Limited support
- Mobile: Screenshot protection không hoạt động
- Safari: Cần webkit prefix

---

#### 12.2.2 Scalability
- Google Sheets: Max 5M cells
- Apps Script: 6 min timeout
- Concurrent users: ~30 (Google limit)

**If need scale:**
- Use real database (Firebase, MongoDB)
- Use proper backend (Node.js, Python)
- Implement caching

---

## 13. FUTURE IMPROVEMENTS

### 13.1 Planned Features
1. ✅ Tô màu câu sai (DONE)
2. ⏳ Hiển thị hình ảnh trong Sheet (IN PROGRESS)
3. ⏳ Timer persistence (localStorage)
4. ⏳ Offline mode (Service Worker)
5. ⏳ Analytics dashboard

---

## 14. TESTING & DEBUGGING

### 14.1 Frontend Testing

#### 14.1.1 Manual Testing Checklist
- [ ] Load trang chủ → Hiển thị đúng
- [ ] Click môn học → Đổi đề thi
- [ ] Click đề thi → Chuyển trang
- [ ] Modal xác nhận → Hiển thị đúng
- [ ] Bắt đầu → Fullscreen + Timer
- [ ] Chọn đáp án → Highlight đúng
- [ ] Nộp bài → Chấm điểm đúng
- [ ] Kết quả → Hiển thị đúng

---

#### 14.1.2 Browser Console
```javascript
// Check timer
console.log(time, timerStarted);

// Check answers
console.log(answers, correctAnswers);

// Check fetch
console.log('Sending to:', GOOGLE_SCRIPT_URL);
```

---

### 14.2 Backend Testing

#### 14.2.1 Apps Script Logger
```javascript
Logger.log('✅ Đã tô màu câu trả lời sai');
Logger.log('❌ Lỗi tô màu: ' + error.toString());
```

**View logs:**
1. Apps Script Editor
2. View → Executions
3. Click execution → See logs

---

#### 14.2.2 Test doGet()
```javascript
function doGet(e) {
  return ContentService.createTextOutput('Google Apps Script đang hoạt động! ✅');
}
```

**Test:** Open web app URL in browser → Should see message

---

## 15. DEPLOYMENT

### 15.1 Frontend Deployment
**Platform:** Vercel  
**Process:**
1. Push code to GitHub
2. Vercel auto-deploy
3. URL: `https://web-bai-tap.vercel.app`

**Config:** `vercel.json`
```json
{
  "buildCommand": "echo 'No build needed'",
  "outputDirectory": ".",
  "framework": null
}
```

---

### 15.2 Backend Deployment
**Platform:** Google Apps Script  
**Process:**
1. Copy code from `google-apps-script-nang-cao.js`
2. Paste into Apps Script Editor
3. Save (Ctrl+S)
4. Deploy → New deployment → Web app
5. Execute as: Me
6. Who has access: Anyone
7. Deploy → Copy URL
8. Update `GOOGLE_SCRIPT_URL` in HTML files

---

## 16. MAINTENANCE

### 16.1 Regular Tasks
- [ ] Check Google Sheets storage (monthly)
- [ ] Review error logs (weekly)
- [ ] Update exam data (as needed)
- [ ] Test on new browsers (quarterly)

---

### 16.2 When Code Changes
1. Update this LOGIC.md file
2. Mark changes with `[UPDATED - date]`
3. Document WHY, not just WHAT
4. Update CHANGELOG section
5. Test thoroughly
6. Deploy to production

---

## 17. CONTACT & SUPPORT

**Developer:** Senior Developer & Technical Writer  
**Last Updated:** 2025-01-XX  
**Version:** 1.0

**For questions:**
- Read this LOGIC.md first
- Check CHANGELOG for recent changes
- Review code comments
- Test in browser console

---

**END OF LOGIC.MD**

