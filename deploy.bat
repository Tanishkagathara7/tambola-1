@echo off
echo ========================================
echo Tambola Multiplayer - Quick Deploy
echo ========================================
echo.

echo [1/3] Adding all changes to git...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "Fix: Auto-repair corrupted ticket grids and resolve all errors"

echo.
echo [3/3] Pushing to GitHub (Render will auto-deploy)...
git push

echo.
echo ========================================
echo Deployment initiated!
echo ========================================
echo.
echo Render will automatically deploy in 2-3 minutes.
echo.
echo Monitor deployment at:
echo https://dashboard.render.com
echo.
echo Verify deployment:
echo curl https://tambola-1-g7r1.onrender.com/health
echo.
echo Or open in browser:
echo https://tambola-1-g7r1.onrender.com/health
echo.
pause
