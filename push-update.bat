@echo off
chcp 65001 >nul
echo ========================================
echo PUSH CODE CAP NHAT LEN GITHUB
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

echo [1/5] Kiem tra trang thai Git...
git status
if errorlevel 1 (
    echo.
    echo [ERROR] Khong phai la Git repository!
    echo Vui long chay file push-to-github.bat truoc.
    pause
    exit /b 1
)

echo.
echo [2/5] Them tat ca file thay doi vao staging...
git add .

echo.
echo [3/5] Hien thi cac file da thay doi...
git status

echo.
echo ========================================
echo Nhap mo ta cho lan cap nhat nay
echo ========================================
echo Vi du: Fix critical bug - mode no-cors blocking POST data
echo.
set /p COMMIT_MSG="Nhap mo ta: "

if "%COMMIT_MSG%"=="" (
    echo [ERROR] Ban chua nhap mo ta!
    pause
    exit /b 1
)

echo.
echo [4/5] Commit code voi mo ta: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo [WARNING] Khong co thay doi de commit hoac co loi!
    echo Kiem tra lai cac file da thay doi.
    pause
    exit /b 1
)

echo.
echo [5/5] Push code len GitHub...
git push
if errorlevel 1 (
    echo.
    echo [ERROR] Khong the push code!
    echo.
    echo Co the do:
    echo 1. Chua cau hinh remote repository
    echo 2. Khong co quyen truy cap
    echo 3. Mat ket noi internet
    echo.
    echo Thu chay lenh nay de kiem tra:
    echo   git remote -v
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo HOAN THANH!
echo ========================================
echo Code da duoc cap nhat len GitHub thanh cong!
echo.
echo Xem tai: https://github.com/YOUR_USERNAME/YOUR_REPO
echo.
pause
