@echo off
setlocal
if "%~1"=="" goto usage
if not "%~2"=="--execute" goto usage
if not "%~3"=="" goto usage
cd /d "%~dp0..\.."
set "APV_RECOVERY_RUN_ID="
for /f "delims=" %%I in ('node -e "process.stdout.write(require('node:crypto').randomUUID())"') do set "APV_RECOVERY_RUN_ID=%%I"
if not defined APV_RECOVERY_RUN_ID exit /b 2
node experiments\phase-2-sqlite-recovery-spike\runner.cjs --reserve --case "%~1" --run-id "%APV_RECOVERY_RUN_ID%" --execute
if errorlevel 1 exit /b 2
set "APV_RECOVERY_RUN_ROOT=%TEMP%\apv-sqlite-recovery\%APV_RECOVERY_RUN_ID%"
node experiments\phase-2-sqlite-recovery-spike\runner.cjs --case "%~1" --run-id "%APV_RECOVERY_RUN_ID%" --execute > "%APV_RECOVERY_RUN_ROOT%\cmd-stdout.txt" 2> "%APV_RECOVERY_RUN_ROOT%\cmd-stderr.txt"
set "APV_RECOVERY_NODE_EXIT=%ERRORLEVEL%"
> "%APV_RECOVERY_RUN_ROOT%\cmd-exit.txt" echo %APV_RECOVERY_NODE_EXIT%
type "%APV_RECOVERY_RUN_ROOT%\cmd-stdout.txt"
type "%APV_RECOVERY_RUN_ROOT%\cmd-stderr.txt"
echo APV_RECOVERY_NODE_EXIT=%APV_RECOVERY_NODE_EXIT%
echo APV_RECOVERY_RUN_ROOT=%APV_RECOVERY_RUN_ROOT%
node experiments\phase-2-sqlite-recovery-spike\audit.cjs "%APV_RECOVERY_RUN_ROOT%" --seal-cmd
set "APV_RECOVERY_AUDIT_EXIT=%ERRORLEVEL%"
echo APV_RECOVERY_AUDIT_EXIT=%APV_RECOVERY_AUDIT_EXIT%
if not "%APV_RECOVERY_NODE_EXIT%"=="0" exit /b %APV_RECOVERY_NODE_EXIT%
exit /b %APV_RECOVERY_AUDIT_EXIT%
:usage
echo Preparation only. After separate authorization: run.cmd U1^|U2^|U4^|R1^|R2^|R3 --execute
exit /b 2
