@echo off
chcp 65001 >nul

echo ============================================================
echo 同步数据到部署目录
echo ============================================================

:: 确保部署目录存在
if not exist "..\qa_search_deploy" (
    echo 错误: 部署目录不存在
    pause
    exit /b 1
)

:: 同步所有文件
echo 同步文件...

:: 同步HTML
echo   - HTML文件...
copy /Y index.html ..\qa_search_deploy\

:: 同步JS
echo   - JS文件...
copy /Y js\app.js ..\qa_search_deploy\js\
copy /Y js\app.js.full ..\qa_search_deploy\js\
copy /Y js\app_chunked.js ..\qa_search_deploy\js\

:: 同步CSS
echo   - CSS文件...
copy /Y css\*.css ..\qa_search_deploy\css\

:: 同步数据（包括索引和分片）
echo   - 数据文件...
copy /Y data\index.json ..\qa_search_deploy\data\
copy /Y data\qa_data.json ..\qa_search_deploy\data\
xcopy /Y /E /I data\chunks ..\qa_search_deploy\data\chunks\ >nul

echo.
echo ============================================================
echo 同步完成！
echo ============================================================
echo.
echo 运行 push_to_github.bat 推送到GitHub
echo.
pause
