# Troubleshooting Guide

## Common Issues and Solutions

### 1. "Internal Server Error" when joining room

**Symptoms**: User clicks join room, gets error message

**Solutions**:
1. Check backend server is running:
   ```bash
   cd backend
   python server_multiplayer.py
   ```

2. Verify MongoDB is running and accessible

3. Check backend logs for specific error

4. Verify `.env` files are correct:
   - Backend: `backend/.env` should have `MONGO_URL`, `DB_NAME`, `SECRET_KEY`
   - Frontend: `frontend/.env` should have `EXPO_PUBLIC_BACKEND_URL`

### 2. "java.io.IOException: Failed to download remote update" in Expo Go

**Solutions**:
1. Clear Expo cache:
   ```bash
   cd frontend
   npx expo start --clear
   ```

2. Use tunnel mode:
   ```bash
   npx expo start --tunnel
   ```

3. Close Expo Go app completely and reopen

4. Check `frontend/app.json` - updates should be minimal:
   ```json
   "updates": {
     "fallbackToCacheTimeout": 0
   }
   ```

### 3. Backend won't start

**Check**:
1. Python version (need 3.8+):
   ```bash
   python --version
   ```

2. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements-multiplayer.txt
   ```

3. MongoDB connection:
   ```bash
   python test_join_room.py
   ```

4. Port 8001 not in use:
   ```bash
   netstat -ano | findstr :8001
   ```

### 4. Can't connect to backend from app

**Check**:
1. Backend URL in `frontend/.env`:
   ```
   EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.com
   ```

2. For local testing, use ngrok or tunnel:
   ```bash
   npx expo start --tunnel
   ```

3. Backend CORS is allowing all origins (already configured)

4. Network connectivity - try accessing backend URL in browser

### 5. "Unauthorized" errors

**Solutions**:
1. Login again - token may have expired

2. Check AsyncStorage has token:
   - Clear app data and login fresh

3. Verify backend `SECRET_KEY` in `.env`

### 6. Room not updating in real-time

**Check**:
1. Socket.IO connection:
   - Check browser/app console for socket errors

2. Backend socket handlers registered:
   - Should see "Socket.IO handlers registered" in backend logs

3. User authenticated on socket:
   - Socket needs user_id to work properly

### 7. Admin panel not opening

**Solution**:
1. Tap "v2.0 - Multiplayer Edition" text 7 times quickly
2. Must be on home screen (index page)
3. Default password: `admin@123`

### 8. Tickets not generating

**Check**:
1. Wallet balance sufficient
2. Room status is "waiting" (not started)
3. Backend logs for ticket generation errors

### 9. Numbers not being called

**Check**:
1. User is the host of the room
2. Game status is "active"
3. Socket connection is working
4. Check backend logs for errors

### 10. Prize claims failing

**Check**:
1. Ticket actually has winning pattern
2. Prize not already claimed (unless multiple winners allowed)
3. Game is active
4. Backend validation logs

## Debug Commands

### Check Backend Status
```bash
cd backend
python test_join_room.py
```

### View Backend Logs
Backend logs appear in console where server is running

### Clear Frontend Cache
```bash
cd frontend
npx expo start --clear
rm -rf .expo .metro-cache
```

### Reset App Data
In app: Settings → Clear All Data

### Check MongoDB Data
```bash
# Connect to MongoDB
mongo
use tambola_multiplayer
db.rooms.find().pretty()
db.users.find().pretty()
```

## Getting Help

If issues persist:
1. Check backend console logs
2. Check frontend console/debugger
3. Verify all `.env` files are correct
4. Try with fresh user account
5. Restart both backend and frontend

## Quick Reset

To start fresh:
```bash
# Backend
cd backend
# Stop server (Ctrl+C)
# Clear MongoDB data if needed
python server_multiplayer.py

# Frontend
cd frontend
npx expo start --clear --tunnel
```
