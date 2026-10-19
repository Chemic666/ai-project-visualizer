@echo off
setlocal
set "APV_G1_CAPTURE="
if not "%~2"=="--execute" (
  echo G1 DISABLED. After separate approval: run-g1.cmd BUILD_ID --execute
  exit /b 2
)
if not "%~3"=="" exit /b 2
node "%~dp0runner.cjs" --preflight --build-id "%~1"
if errorlevel 1 exit /b 1
for /f %%R in ('node -e "process.stdout.write(require('node:crypto').randomUUID())"') do set "APV_G1_CAPTURE=%TEMP%\apv-u3-vfs-cmd-%%R"
if not defined APV_G1_CAPTURE exit /b 1
if exist "%APV_G1_CAPTURE%" exit /b 1
mkdir "%APV_G1_CAPTURE%"
if errorlevel 1 exit /b 1
> "%APV_G1_CAPTURE%\command.txt" echo node "%~dp0runner.cjs" --run-g1 --execute --build-id "%~1"
node "%~dp0runner.cjs" --run-g1 --execute --build-id "%~1" > "%APV_G1_CAPTURE%\stdout.txt" 2> "%APV_G1_CAPTURE%\stderr.txt"
set "APV_G1_RC=%ERRORLEVEL%"
> "%APV_G1_CAPTURE%\node-exit.txt" echo %APV_G1_RC%
echo External CMD capture: %APV_G1_CAPTURE%
endlocal & set "APV_G1_CAPTURE=%APV_G1_CAPTURE%" & exit /b %APV_G1_RC%
