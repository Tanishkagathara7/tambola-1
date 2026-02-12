# Signup Not Working - Fix Guide

## Problem
Signup is not working in the frontend app.

## Root Cause
The `frontend/.env` file was reverted back to the production URL (`https://tambola-1-g7r1.onrender.com`) instead of your local backend URL.

## ✅ Solution

### 1. Fix the .env File

The `frontend/.env` file has been updated to:

```env
# Local development - use your computer's IP address (not localhost)
# Your IP: 192.168.103.90
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001

# For production deployment:
# EXPO_PUBLIC_BACKEND_URL=https://tambola-1-g7r1.onrender.com
```

### 2. RESTART EXPO APP (CRITICAL!)

**You MUST restart the Expo app for the .env changes to take effect:**

```bash
# In your frontend terminal:
# 1. Stop the app (press Ctrl+C)
# 2. Clear cache and restart:
npm start -- --clear
```

Or simply:
```bash
# Stop with Ctrl+C, then:
npm start
```

### 3. Verify Backend is Running

Make sure the backend server is still running:
- Check the backend terminal window
- You should see: `INFO: Uvicorn running on http://0.0.0.0:8001`

If not running, start it:
```bash
cd backend
py server_multiplayer.py
```

## 🧪 Testing

### Test Backend Directly
```bash
# Test signup endpoint:
curl -X POST http://192.168.103.90:8001/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Test User\",\"email\":\"test@test.com\",\"mobile\":\"+1234567890\",\"password\":\"test123\"}"
```

Expected response: JSON with `access_token` and `user` object.

### Test in App
1. Open the app
2. Go to Signup screen
3. Fill in the form:
   - Name: Test User
   - Email: test@example.com
   - Mobile: 1234567890 (will be formatted to +911234567890)
   - Password: test123
   - Confirm Password: test123
4. Tap "CREATE ACCOUNT"

## 🔍 Troubleshooting

### Still Not Working?

**Check 1: Verify .env is correct**
```bash
# In frontend directory:
type .env
```

Should show:
```
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

**Check 2: Restart Expo with cache clear**
```bash
npm start -- --clear
```

**Check 3: Check Expo console for errors**
Look for error messages in the terminal where Expo is running.

**Check 4: Check backend logs**
Look at the backend terminal for incoming requests.

**Check 5: Test backend is accessible**
```bash
curl http://192.168.103.90:8001/api/auth/signup
```

### Common Errors

**Error: "Network timeout"**
- Backend is not running
- Wrong IP address in .env
- Firewall blocking port 8001

**Error: "Email already registered"**
- User already exists
- Try a different email

**Error: "Invalid response from server"**
- Backend returned unexpected format
- Check backend logs for errors

**Error: "Cannot connect to server"**
- .env not updated
- Expo app not restarted
- Backend not running

## 📝 Important Notes

1. **Always restart Expo after changing .env**
   - Environment variables are loaded at startup
   - Changes won't apply until restart

2. **Use IP address, not localhost**
   - `localhost` doesn't work with physical devices
   - Use your computer's IP: `192.168.103.90`

3. **Keep backend running**
   - Backend must be running for signup to work
   - Check backend terminal for errors

4. **Check your IP hasn't changed**
   - If you restart your router, your IP might change
   - Run `ipconfig` to check current IP
   - Update .env if IP changed

## ✅ Verification Checklist

- [ ] Backend server is running on port 8001
- [ ] `frontend/.env` has correct IP: `http://192.168.103.90:8001`
- [ ] Expo app has been restarted with `npm start -- --clear`
- [ ] Backend is accessible: `curl http://192.168.103.90:8001/api/auth/signup`
- [ ] Phone/emulator is on same WiFi network as computer

## 🎯 Quick Fix Commands

```bash
# 1. Verify backend is running
# Check backend terminal or start it:
cd backend
py server_multiplayer.py

# 2. Verify .env is correct
cd frontend
type .env

# 3. Restart Expo with cache clear
npm start -- --clear

# 4. Test backend
curl http://192.168.103.90:8001/api/auth/signup
```

## 📞 Still Having Issues?

If signup still doesn't work after following all steps:

1. **Check backend terminal** - Look for error messages when you try to signup
2. **Check Expo terminal** - Look for network errors
3. **Check phone/emulator console** - Look for JavaScript errors
4. **Verify MongoDB connection** - Check `backend/.env` has correct MongoDB URL
5. **Try a different email** - The email might already be registered

---

**Status**: ✅ .env fixed, backend verified working  
**Action Required**: Restart Expo app with `npm start -- --clear`  
**Backend URL**: http://192.168.103.90:8001  
**Backend Status**: Running on port 8001
