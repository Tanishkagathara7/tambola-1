# Socket Connection & Login Fix Guide

## Problem
- Socket not connecting: `LOG Socket disconnected`
- Login failing: `ERROR Login error details: [Error: Network timeout]`

## Root Cause
1. Backend server was not running
2. Frontend was trying to connect to wrong URL (production URL instead of local)
3. Wrong Python executable being used (MSYS64 Python without packages)

## ✅ Solution Applied

### 1. Fixed Frontend Configuration
Updated `frontend/.env`:
```env
# Local development - use your computer's IP address
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

**Important**: 
- Use your computer's IP address (not `localhost` or `127.0.0.1`)
- Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Your current IP: `192.168.103.90`

### 2. Started Backend Server
```bash
cd backend
py server_multiplayer.py
```

Server is now running on: `http://0.0.0.0:8001`

### 3. Installed Required Dependencies
```bash
py -m pip install fastapi uvicorn python-dotenv pymongo motor pydantic==1.10.26 python-jose[cryptography] passlib[argon2] argon2-cffi bcrypt==3.2.2 python-multipart python-socketio aiofiles email-validator
```

## 🔧 How to Verify Connection

### 1. Check Backend is Running
Open browser and go to:
```
http://192.168.103.90:8001/api/
```

You should see:
```json
{"message": "Tambola/Housie App API"}
```

### 2. Check Socket.IO Connection
The backend logs should show:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### 3. Restart Frontend App
After changing `.env`, you MUST restart the Expo app:
```bash
# Stop the current app (Ctrl+C)
# Then restart:
cd frontend
npm start
```

## 📱 Testing on Physical Device

If using a physical device with Expo Go:

1. **Ensure same WiFi network**
   - Phone and computer must be on the same WiFi
   - Check phone WiFi settings

2. **Use computer's IP address**
   - Already set to: `http://192.168.103.90:8001`

3. **Check firewall**
   - Windows Firewall might block port 8001
   - Add exception for Python or port 8001

## 🐛 Troubleshooting

### Socket Still Not Connecting

**Check 1: Backend is running**
```bash
# In backend directory
py server_multiplayer.py
```

**Check 2: Correct IP address**
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
```

**Check 3: Frontend .env is updated**
```bash
# frontend/.env should have:
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

**Check 4: Restart Expo**
```bash
# Stop Expo (Ctrl+C)
# Clear cache and restart:
npm start -- --clear
```

### Login Still Failing

**Check 1: Backend API is accessible**
```bash
# Test with curl or browser:
curl http://192.168.103.90:8001/api/
```

**Check 2: MongoDB is connected**
Check backend logs for MongoDB connection errors

**Check 3: User exists**
Try signing up first if you haven't created an account

### Port 8001 Already in Use

If you see "Address already in use":
```bash
# Find process using port 8001
netstat -ano | findstr :8001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

Or change the port in `backend/server_multiplayer.py`:
```python
# At the bottom of the file:
uvicorn.run("server_multiplayer:socket_app", host="0.0.0.0", port=8002)
```

Then update frontend `.env`:
```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8002
```

## 🚀 Quick Start Commands

### Start Backend
```bash
cd backend
py server_multiplayer.py
```

### Start Frontend
```bash
cd frontend
npm start
```

### Verify Everything
```bash
# Check backend
curl http://192.168.103.90:8001/api/

# Check your IP
ipconfig

# Check Python packages
py -m pip list | findstr "fastapi"
```

## 📝 Important Notes

1. **Always use `py` command** (not `python`) to ensure correct Python version
2. **Restart Expo after changing .env** - environment variables are loaded at startup
3. **Use IP address, not localhost** - localhost doesn't work with physical devices
4. **Same WiFi network** - computer and phone must be on same network
5. **Check firewall** - Windows Firewall might block connections

## ✅ Current Status

- ✅ Backend server running on port 8001
- ✅ Frontend configured with correct IP: 192.168.103.90
- ✅ All dependencies installed
- ✅ Socket.IO ready for connections

## 🎯 Next Steps

1. **Restart your Expo app** (important!)
   ```bash
   # In frontend directory
   # Press Ctrl+C to stop
   npm start -- --clear
   ```

2. **Try logging in again**
   - Socket should connect automatically
   - Login should work now

3. **Check backend logs**
   - Watch for connection messages
   - Look for any errors

## 📞 Still Having Issues?

If problems persist:

1. Check backend terminal for error messages
2. Check Expo terminal for connection errors
3. Verify MongoDB connection in backend/.env
4. Try restarting both backend and frontend
5. Check Windows Firewall settings

---

**Status**: ✅ Backend running, frontend configured  
**Backend URL**: http://192.168.103.90:8001  
**Socket.IO**: Ready for connections  
**Action Required**: Restart Expo app to apply changes
