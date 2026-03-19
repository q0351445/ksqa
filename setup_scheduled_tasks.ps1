# QA Search Scheduled Tasks Setup
# Uses Windows Task Scheduler

# Task 1: Fetch data every weekday at 9 PM
$Action1 = New-ScheduledTaskAction -Execute "C:\Users\chenglin.zhan\.copaw\qa_search\update_qa_data.bat"
$Trigger1 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "21:00"
$Settings1 = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName "QA_Data_Fetch" -Action $Action1 -Trigger $Trigger1 -Settings $Settings1 -RunLevel Highest -Force

# Task 2: Push to GitHub every weekday at 10:30 PM
$Action2 = New-ScheduledTaskAction -Execute "C:\Users\chenglin.zhan\.copaw\qa_search_deploy\push_to_github.bat"
$Trigger2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "22:30"
$Settings2 = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName "QA_GitHub_Push" -Action $Action2 -Trigger $Trigger2 -Settings $Settings2 -RunLevel Highest -Force

Write-Host "Scheduled tasks created successfully!"
Write-Host "- QA_Data_Fetch: Weekdays 21:00 - Fetch QA data"
Write-Host "- QA_GitHub_Push: Weekdays 22:30 - Push to GitHub"
