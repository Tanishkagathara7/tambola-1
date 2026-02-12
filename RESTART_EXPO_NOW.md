# ⚠️ CRITICAL: YOU MUST RESTART EXPO APP NOW

## Why You're Getting "Network request failed"

The frontend `.env` file has been updated with the correct backend URL:
```
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

**BUT** - Environment variables are only loaded when Expo starts!

Your Expo app is still using the OLD production URL from when it started:
```
https://tambola-1-g7r1.onrender.com  ❌ OLD (not accessible)
```

## ✅ SOLUTION: Restart Expo App

### Step 1: Stop Expo
In your frontend terminal (where `npm start` is running):
```
Press Ctrl+C
```

### Step 2: Clear Cache and Restart
```bash
npm start -- --clear
```

Or simply:
```bash
npm start
```

### Step 3: Reload App on Device
- If using Expo Go: Shake device and tap "Reload"
- If using emulator: Press `r` in terminal to reload

## 🔍 How to Verify It's Fixed

After restarting, check the Expo terminal output. You should see:
```
EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

NOT:
```
EXPO_PUBLIC_BACKEND_URL=https://tambola-1-g7r1.onrender.com
```

## 📱 What Will Happen After Restart

1. ✅ Signup will work (connects to local backend)
2. ✅ Login will work
3. ✅ Socket will connect
4. ✅ All features will work

## ⚠️ Common Mistakes

### Mistake 1: Not Restarting
- Changing `.env` without restarting = NO EFFECT
- You MUST restart Expo for changes to apply

### Mistake 2: Only Reloading App
- Shaking device and tapping "Reload" is NOT enough
- You must stop and restart the Expo server itself

### Mistake 3: Forgetting to Clear Cache
- Old cached values might persist
- Use `npm start -- --clear` to be safe

## 🎯 Quick Commands

```bash
# In your frontend terminal:

# 1. Stop Expo (Ctrl+C)

# 2. Restart with cache clear
npm start -- --clear

# 3. Wait for QR code to appear

# 4. Scan QR code or press 'a' for Android / 'i' for iOS
```

## 📊 Current Status

- ✅ Backend running on: http://192.168.103.90:8001
- ✅ Frontend .env updated correctly
- ❌ Expo app NOT restarted yet (still using old URL)

## 🔧 Troubleshooting

### If Still Getting Network Error After Restart:

**Check 1: Verify .env in Expo logs**
Look for this line in Expo terminal after restart:
```
Environment: development
```

**Check 2: Test backend is accessible**
```bash
curl http://192.168.103.90:8001/api/rooms
```
Should return: `{"detail":"Not authenticated"}`

**Check 3: Same WiFi network**
- Phone and computer must be on same WiFi
- Check phone WiFi settings

**Check 4: Firewall**
- Windows Firewall might block port 8001
- Try temporarily disabling firewall to test

## 💡 Pro Tip

To avoid this issue in the future:
1. Always restart Expo after changing `.env`
2. Use `npm start -- --clear` to clear cache
3. Remember: .env changes require full restart, not just reload

---

## 🚨 ACTION REQUIRED NOW

**STOP READING AND DO THIS:**

1. Go to your frontend terminal
2. Press `Ctrl+C` to stop Expo
3. Run: `npm start -- --clear`
4. Wait for it to start
5. Reload app on your device
6. Try signup again

**That's it! The error will be gone.**

---

**Status**: ⚠️ Waiting for you to restart Expo  
**Backend**: ✅ Running and ready  
**Frontend .env**: ✅ Correct  
**Expo App**: ❌ Needs restart
