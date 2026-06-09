@echo off
setlocal

rem Optional extension hooks for start-LOCAL.bat
rem Usage:
rem   call start-LOCAL.extra.bat pre-node
rem   call start-LOCAL.extra.bat post-node
rem   call start-LOCAL.extra.bat post-deploy
rem   call start-LOCAL.extra.bat post-voting-open
rem   call start-LOCAL.extra.bat post-start
rem
rem Return non-zero to fail the main launcher.

set "HOOK=%~1"

if /I "%HOOK%"=="pre-node" goto :ok
if /I "%HOOK%"=="post-node" goto :ok
if /I "%HOOK%"=="post-deploy" goto :ok
if /I "%HOOK%"=="post-voting-open" goto :ok
if /I "%HOOK%"=="post-start" goto :ok

goto :ok

:ok
exit /b 0

