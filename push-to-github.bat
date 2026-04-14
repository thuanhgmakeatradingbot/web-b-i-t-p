@echo off
echo ========================================
echo PUSH CODE LEN GITHUB
echo ========================================
echo.

REM Kiem tra Git da cai chua
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git chua duoc cai dat!
    echo Vui long tai Git tai: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/6] Khoi tao Git repository...
git init

echo.
echo [2/6] Them tat ca file vao staging...
git add .

echo.
echo [3/6] Commit code...
git commit -m "Initial commit - Web bai tap"

echo.
echo [4/6] Doi ten branch thanh main...
git branch -M main

echo.
echo ========================================
echo QUAN TRONG: Nhap URL repository cua ban
echo ========================================
echo.
echo Vi du: https://github.com/username/web-bai-tap.git
echo.
set /p REPO_URL="Nhap URL repository: "

echo.
echo [5/6] Them remote origin...
git remote add origin %REPO_URL%

echo.
echo [6/6] Push code len GitHub...
git push -u origin main

echo.
echo ========================================
echo HOAN THANH!
echo ========================================
echo Code da duoc push len GitHub thanh cong!
echo.
pause
