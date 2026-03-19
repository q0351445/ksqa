@echo off
chcp 65001 >nul
echo ============================================================
echo QA搜索前端版本切换
echo ============================================================
echo.
echo 1. 完整版（一次性加载所有数据，约4MB）
echo 2. 分片版（按需加载，首次更快）
echo.
set /p choice="请选择 (1/2): "

if "%choice%"=="1" (
    copy /Y js\app.js.full js\app.js
    echo.
    echo 已切换到完整版
) else if "%choice%"=="2" (
    copy /Y js\app_chunked.js js\app.js
    echo.
    echo 已切换到分片版
) else (
    echo.
    echo 无效选择
)

echo.
pause
