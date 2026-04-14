@echo off
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

echo [1/4] Them tat ca file thay doi vao staging...
git add .

echo.
echo [2/4] Hien thi cac file da thay doi...
git status

echo.
echo ========================================
echo Nhap mo ta cho lan cap nhat nay
echo ========================================
echo Vi du: Fix critical bug - mode no-cors blocking POST data
echo.
set /p COMMIT_MSG="Nhap mo ta: "

echo.
echo [3/4] Commit code voi mo ta: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"

echo.
echo [4/4] Push code len GitHub...
git push

echo.
echo ========================================
echo HOAN THANH!
echo ========================================
echo Code da duoc cap nhat len GitHub thanh cong!
echo.
echo Xem tai: https://github.com/YOUR_USERNAME/YOUR_REPO
echo.
pause
