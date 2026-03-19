@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

cd /d "C:\Users\chenglin.zhan\.copaw\qa_search"

echo.
echo ============================================================
echo [%date% %time%] QA数据全量更新任务
echo 说明: 图片URL两天过期，需每日全量更新
echo ============================================================
echo.

python fetch_data.py

if %errorlevel% neq 0 (
    echo.
    echo [%date% %time%] ❌ 抓取失败！
    exit /b 1
)

echo.
echo ============================================================
echo [%date% %time%] ✅ 数据更新完成！
echo ============================================================
echo.
