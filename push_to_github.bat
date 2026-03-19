@echo off
chcp 65001 >nul
setlocal

cd /d "C:\Users\chenglin.zhan\.copaw\qa_search_deploy"

echo ============================================================
echo [%date% %time%] 开始推送到GitHub...
echo ============================================================
echo.

:: 显示当前状态
echo 检查更改...
git status --short
echo.

:: 检查是否有更改
git diff --quiet --exit-code 2>nul
if %errorlevel% equ 0 (
    git diff --cached --quiet --exit-code 2>nul
    if %errorlevel% equ 0 (
        echo [%date% %time%] 没有需要提交的更改
        goto :end
    )
)

:: 添加所有更改（包括JS、CSS、HTML、数据等）
echo 添加更改...
git add -A

:: 显示即将提交的内容
echo.
echo 即将提交的更改:
git status --short
echo.

:: 提交
git commit -m "更新 %date% %time%"
if %errorlevel% neq 0 (
    echo [%date% %time%] 没有需要提交的内容
    goto :end
)

:: 推送
echo.
echo 推送到GitHub...
:push
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [%date% %time%] 推送失败！请检查网络连接
    pause
    exit /b 1
)

echo.
echo ============================================================
echo [%date% %time%] ✅ 推送完成！Cloudflare将自动同步更新。
echo ============================================================

:end
echo.
pause
