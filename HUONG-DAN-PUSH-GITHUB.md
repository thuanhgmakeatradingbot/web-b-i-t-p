# 🚀 HƯỚNG DẪN PUSH CODE LÊN GITHUB

## Phương án 1: Sử dụng Script Tự Động (Khuyến nghị)

### Bước 1: Cài đặt Git

1. Tải Git tại: https://git-scm.com/download/win
2. Chạy file cài đặt
3. Nhấn **Next** cho đến hết (giữ mặc định)
4. Khởi động lại terminal

### Bước 2: Cấu hình Git (chỉ làm 1 lần)

Mở PowerShell hoặc CMD và chạy:

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email@example.com"
```

### Bước 3: Tạo Repository trên GitHub

1. Truy cập: https://github.com
2. Đăng nhập (hoặc đăng ký nếu chưa có)
3. Click nút **"+"** góc trên bên phải → **"New repository"**
4. Điền thông tin:
   - **Repository name:** `web-bai-tap` (hoặc tên khác)
   - **Description:** "Hệ thống ôn tập trực tuyến"
   - Chọn **Public** (công khai) hoặc **Private** (riêng tư)
   - **KHÔNG** tick "Add a README file"
5. Click **"Create repository"**
6. **Copy URL** của repository (dạng: `https://github.com/username/web-bai-tap.git`)

### Bước 4: Chạy Script

1. Double-click file **`push-to-github.bat`**
2. Khi được hỏi, paste URL repository vừa copy
3. Nhấn Enter và đợi
4. Xong!

---

## Phương án 2: Làm Thủ Công (Nếu script không chạy)

### Bước 1-3: Giống phương án 1

### Bước 4: Chạy lệnh thủ công

Mở PowerShell/CMD tại thư mục `Web bài tập` và chạy từng lệnh:

```bash
# 1. Khởi tạo Git
git init

# 2. Thêm tất cả file
git add .

# 3. Commit
git commit -m "Initial commit - Web bai tap"

# 4. Đổi tên branch
git branch -M main

# 5. Thêm remote (thay YOUR_URL bằng URL repository của bạn)
git remote add origin https://github.com/username/web-bai-tap.git

# 6. Push lên GitHub
git push -u origin main
```

---

## 🔐 Xác Thực GitHub

Khi push lần đầu, GitHub sẽ yêu cầu đăng nhập:

### Cách 1: Sử dụng Personal Access Token (Khuyến nghị)

1. Vào GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Đặt tên: `Web bai tap`
4. Chọn quyền: **repo** (tick tất cả)
5. Click **"Generate token"**
6. **Copy token** (chỉ hiện 1 lần!)
7. Khi Git hỏi password, paste token này vào

### Cách 2: Sử dụng GitHub Desktop (Dễ nhất)

1. Tải GitHub Desktop: https://desktop.github.com/
2. Cài đặt và đăng nhập
3. Click **"Add"** → **"Add existing repository"**
4. Chọn thư mục `Web bài tập`
5. Click **"Publish repository"**

---

## 📤 Cập Nhật Code Sau Này

Khi có thay đổi, chạy các lệnh sau:

```bash
# 1. Thêm file thay đổi
git add .

# 2. Commit với message mô tả
git commit -m "Thêm đề số 4 KHTN"

# 3. Push lên GitHub
git push
```

Hoặc double-click file **`push-to-github.bat`** lại (nó sẽ tự động push)

---

## 🌐 Deploy lên GitHub Pages (Để có link web)

Sau khi push code lên GitHub:

1. Vào repository trên GitHub
2. Click **Settings** → **Pages**
3. Tại **Source**, chọn **main** branch
4. Click **Save**
5. Đợi vài phút, link web sẽ xuất hiện dạng:
   ```
   https://username.github.io/web-bai-tap/
   ```

---

## ❓ Xử Lý Lỗi Thường Gặp

### Lỗi: "git is not recognized"
→ Git chưa được cài hoặc chưa thêm vào PATH
→ Giải pháp: Cài lại Git và khởi động lại terminal

### Lỗi: "Permission denied"
→ Chưa xác thực với GitHub
→ Giải pháp: Sử dụng Personal Access Token hoặc GitHub Desktop

### Lỗi: "Repository not found"
→ URL repository sai
→ Giải pháp: Kiểm tra lại URL, đảm bảo đã tạo repository trên GitHub

### Lỗi: "Updates were rejected"
→ Có conflict với code trên GitHub
→ Giải pháp:
```bash
git pull origin main --rebase
git push
```

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề, liên hệ:
- **Zalo:** 0944316329
- **Email:** [email của bạn]

---

**Chúc bạn thành công! 🎉**
