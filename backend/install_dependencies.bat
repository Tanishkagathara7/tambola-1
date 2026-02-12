@echo off
echo Installing Backend Dependencies...
echo.

REM Upgrade pip first
python -m pip install --upgrade pip

REM Install all dependencies from requirements.txt
echo Installing main requirements...
pip install -r requirements.txt

echo.
echo Installation complete!
echo.
echo To start the server, run:
echo   python server.py (for single player)
echo   python server_multiplayer.py (for multiplayer)
echo.
pause
