@echo off
setlocal

cd /d "%~dp0"
set "EXT_SCRIPT=%cd%\start-LOCAL.extra.bat"
set "LOG_DIR=%cd%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Cleaning up previous LOCAL processes...
call :stop_port_process 3000
call :stop_port_process 3001
call :stop_port_process 8545

call :run_extension pre-node
if errorlevel 1 goto :fail

echo Starting Hardhat node...
call :start_hidden "cd /d ""%cd%"" && npx hardhat node > ""%LOG_DIR%\hardhat.log"" 2>&1"
if errorlevel 1 goto :fail

echo Waiting for Hardhat node...
call :wait_for_port "127.0.0.1" 8545 120 "Hardhat RPC"
if errorlevel 1 goto :fail

call :run_extension post-node
if errorlevel 1 goto :fail

echo Deploying contracts in LOCAL mode...
call :wait_for_port "127.0.0.1" 8545 20 "Hardhat RPC"
if errorlevel 1 goto :fail
set USE_MOCK_VERIFIER=true
call npx hardhat run scripts/deploy.js --network localhost
if errorlevel 1 goto :fail

call :run_extension post-deploy
if errorlevel 1 goto :fail

echo Seeding LOCAL voters...
call :wait_for_port "127.0.0.1" 8545 20 "Hardhat RPC"
if errorlevel 1 goto :fail
call npx hardhat run scripts/register-voter.js --network localhost
if errorlevel 1 goto :fail

echo Opening voting period...
call node scripts\start-voting.js
if errorlevel 1 goto :fail

call :run_extension post-voting-open
if errorlevel 1 goto :fail

echo Starting backend...
call :start_hidden "cd /d ""%cd%\backend"" && set LOCAL_EXPOSE_SECRETS=true && node src\app.js > ""%LOG_DIR%\backend.log"" 2>&1"
if errorlevel 1 goto :fail

echo Waiting for backend health...
call :wait_for_url "http://localhost:3001/health" 90 "Backend API"
if errorlevel 1 goto :fail

echo Starting frontend...
> "%cd%\frontend\.env.development.local" (
  echo BROWSER=none
)
call :start_hidden "cd /d ""%cd%\frontend"" && npm.cmd start > ""%LOG_DIR%\frontend.log"" 2>&1"
if errorlevel 1 goto :fail

echo Waiting for frontend...
call :wait_for_url "http://localhost:3000" 180 "Frontend UI"
if errorlevel 1 goto :fail

echo Opening voter window...
start "ZK Voting - Voter" http://localhost:3000/voter
echo Opening admin window...
start "ZK Voting - Admin" http://localhost:3000/admin

call :run_extension post-start
if errorlevel 1 goto :fail

echo.
echo LOCAL environment started.
echo Logs:
echo   %LOG_DIR%\hardhat.log
echo   %LOG_DIR%\backend.log
echo   %LOG_DIR%\frontend.log
goto :eof

:run_extension
if exist "%EXT_SCRIPT%" (
  echo Running extension hook: %~1
  call "%EXT_SCRIPT%" %~1
  if errorlevel 1 exit /b 1
)
exit /b 0

:stop_port_process
set "STOP_PORT=%~1"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p='%STOP_PORT%'; Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`) do (
  if not "%%P"=="" (
    powershell -NoProfile -Command "try { Stop-Process -Id %%P -Force -ErrorAction Stop } catch {}"
  )
)
exit /b 0

:start_hidden
set "RUN_CMD=%~1"
powershell -NoProfile -Command "$cmd=$env:RUN_CMD; Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -ArgumentList @('/c', $cmd) | Out-Null"
if errorlevel 1 exit /b 1
exit /b 0

:wait_for_port
set "WAIT_HOST=%~1"
set "WAIT_PORT=%~2"
set "WAIT_SECS=%~3"
set "WAIT_NAME=%~4"
powershell -NoProfile -Command "$hostName='%WAIT_HOST%'; $port=[int]'%WAIT_PORT%'; $deadline=(Get-Date).AddSeconds(%WAIT_SECS%); do { try { $tcp = New-Object System.Net.Sockets.TcpClient; $iar = $tcp.BeginConnect($hostName, $port, $null, $null); if ($iar.AsyncWaitHandle.WaitOne(1000)) { $tcp.EndConnect($iar); $tcp.Close(); exit 0 } $tcp.Close() } catch {}; Start-Sleep -Milliseconds 400 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo %WAIT_NAME% did not open %WAIT_HOST%:%WAIT_PORT% in %WAIT_SECS% seconds.
  exit /b 1
)
exit /b 0

:wait_for_url
set "WAIT_URL=%~1"
set "WAIT_SECS=%~2"
set "WAIT_NAME=%~3"
powershell -NoProfile -Command "$u='%WAIT_URL%'; $deadline=(Get-Date).AddSeconds(%WAIT_SECS%); do { try { $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo %WAIT_NAME% did not become ready in %WAIT_SECS% seconds.
  exit /b 1
)
exit /b 0

:fail
echo.
echo LOCAL launcher failed. Check the messages above.
pause
exit /b 1

