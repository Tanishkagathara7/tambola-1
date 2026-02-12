@echo off
echo ========================================
echo   Tambola Multiplayer Project Launcher
echo ========================================
echo.

echo Checking Python installation...
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)
echo.

echo Checking Node.js installation...
node --version
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)
echo.

echo ========================================
echo   Starting Backend Server
echo ========================================
echo.
cd backend
start "Tambola Backend" cmd /k "python server_multiplayer.py"
cd ..

echo.
echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak > nul

echo.
echo ========================================
echo   Starting Frontend App
echo ========================================
echo.
cd frontend
start "Tambola Frontend" cmd /k "npm start"
cd ..

echo.
echo ========================================
echo   Project Started Successfully!
echo ========================================
echo.
echo Backend running on: http://localhost:8001
echo Frontend running on: http://localhost:8081
echo.
echo Press any key to exit this window...
echo (Backend and Frontend will continue running in separate windows)
pause > nul
