@echo off
echo ========================================
echo   Tambola Project Verification
echo ========================================
echo.

set ERROR_COUNT=0

echo [1/6] Checking Python installation...
python --version > nul 2>&1
if errorlevel 1 (
    echo [FAIL] Python is not installed or not in PATH
    set /a ERROR_COUNT+=1
) else (
    python --version
    echo [PASS] Python is installed
)
echo.

echo [2/6] Checking Node.js installation...
node --version > nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js is not installed or not in PATH
    set /a ERROR_COUNT+=1
) else (
    node --version
    echo [PASS] Node.js is installed
)
echo.

echo [3/6] Checking backend files...
if not exist "backend\server_multiplayer.py" (
    echo [FAIL] backend\server_multiplayer.py not found
    set /a ERROR_COUNT+=1
) else (
    echo [PASS] backend\server_multiplayer.py exists
)

if not exist "backend\models.py" (
    echo [FAIL] backend\models.py not found
    set /a ERROR_COUNT+=1
) else (
    echo [PASS] backend\models.py exists
)

if not exist "backend\.env" (
    echo [WARN] backend\.env not found - you need to configure it
) else (
    echo [PASS] backend\.env exists
)
echo.

echo [4/6] Checking frontend files...
if not exist "frontend\package.json" (
    echo [FAIL] frontend\package.json not found
    set /a ERROR_COUNT+=1
) else (
    echo [PASS] frontend\package.json exists
)

if not exist "frontend\.env" (
    echo [WARN] frontend\.env not found - you need to configure it
) else (
    echo [PASS] frontend\.env exists
)
echo.

echo [5/6] Compiling Python files...
python -m py_compile backend\server.py backend\server_multiplayer.py backend\models.py backend\auth.py backend\socket_handlers.py 2> nul
if errorlevel 1 (
    echo [FAIL] Python files have syntax errors
    set /a ERROR_COUNT+=1
) else (
    echo [PASS] All Python files compile successfully
)
echo.

echo [6/6] Checking dependencies...
if not exist "backend\requirements.txt" (
    echo [FAIL] backend\requirements.txt not found
    set /a ERROR_COUNT+=1
) else (
    echo [PASS] backend\requirements.txt exists
)

if not exist "frontend\node_modules" (
    echo [WARN] frontend\node_modules not found - run 'npm install' in frontend directory
) else (
    echo [PASS] frontend\node_modules exists
)
echo.

echo ========================================
echo   Verification Complete
echo ========================================
echo.

if %ERROR_COUNT% EQU 0 (
    echo [SUCCESS] No critical errors found!
    echo.
    echo Next steps:
    echo 1. Configure backend\.env with your MongoDB credentials
    echo 2. Configure frontend\.env with your backend URL
    echo 3. Install backend dependencies: cd backend ^&^& pip install -r requirements.txt
    echo 4. Install frontend dependencies: cd frontend ^&^& npm install
    echo 5. Run start_project.bat to launch the application
) else (
    echo [ERROR] Found %ERROR_COUNT% critical error(s)
    echo Please fix the errors above before proceeding
)
echo.
pause
