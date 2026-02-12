@echo off
echo ========================================
echo   Adding Firewall Rule for Port 8001
echo ========================================
echo.
echo This will allow incoming connections to your backend server.
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo Adding firewall rule...
netsh advfirewall firewall add rule name="Python Backend 8001" dir=in action=allow protocol=TCP localport=8001

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS! Firewall rule added.
    echo.
    echo Port 8001 is now open for incoming connections.
    echo Your phone should now be able to connect to the backend.
    echo.
) else (
    echo.
    echo ERROR: Failed to add firewall rule.
    echo.
)

pause
