@echo off
chcp 65001 >nul
echo Creating scheduled tasks for QA data update...
echo.

:: Task 1: Fetch QA data - Weekdays 21:00
schtasks /create /tn "QA_Data_Fetch" /tr "C:\Users\chenglin.zhan\.copaw\qa_search\update_qa_data.bat" /sc weekly /d MON,TUE,WED,THU,FRI /st 21:00 /f

:: Task 2: Push to GitHub - Weekdays 22:30
schtasks /create /tn "QA_GitHub_Push" /tr "C:\Users\chenglin.zhan\.copaw\qa_search_deploy\push_to_github.bat" /sc weekly /d MON,TUE,WED,THU,FRI /st 22:30 /f

echo.
echo Done! Checking tasks...
echo.

schtasks /query /tn "QA_Data_Fetch" | findstr "TaskName Status"
schtasks /query /tn "QA_GitHub_Push" | findstr "TaskName Status"

echo.
echo Scheduled tasks created:
echo - QA_Data_Fetch: Mon-Fri 21:00
echo - QA_GitHub_Push: Mon-Fri 22:30
pause
