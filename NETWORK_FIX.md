# Network Request Failed - Firewall Fix

## Problem
Getting "Network request failed" error when trying to signup/login from your phone.

## Root Cause
**Windows Firewall is blocking incoming connections on port 8001.**

The backend server is running and accessible from your computer, but external devices (like your phone) cannot connect because Windows Firewall blocks the connection.

## ✅ Solution: Add Firewall Rule

### Option 1: Run the Script (Easiest)

1. **Right-click** on `add_firewall_rule.bat`
2. Select **"Run as administrator"**
3. Click **"Yes"** when prompted
4. Wait for "SUCCESS!" message

### Option 2: Manual Command (If script doesn't work)

1. **Open Command Prompt as Administrator**:
   - Press `Windows + X`
   - Click "Command Prompt (Admin)" or "PowerShell (Admin)"

2. **Run this command**:
   ```cmd
   netsh advfirewall firewall add rule name="Python Backend 8001" dir=in action=allow protocol=TCP localport=8001
   ```

3. **You should see**:
   ```
   Ok.
   ```

### Option 3: Windows Firewall GUI

1. Press `Windows + R`
2. Type: `wf.msc` and press Enter
3. Click "Inbound Rules" on the left
4. Click "New Rule..." on the right
5. Select "Port" → Next
6. Select "TCP" and enter "8001" → Next
7. Select "Allow the connection" → Next
8. Check all boxes (Domain, Private, Public) → Next
9. Name: "Python Backend 8001" → Finish

## 🧪 Verify the Fix

### Test 1: Check Firewall Rule
```powershell
netsh advfirewall firewall show rule name="Python Backend 8001"
```

Should show the rule details.

### Test 2: Test from Phone
After adding the firewall rule:
1. Restart your Expo app
2. Try signup again
3. Should work now!

## 🔍 Additional Checks

### Check 1: Same WiFi Network
Make sure your phone and computer are on the **same WiFi network**:
- Open WiFi settings on your phone
- Check the network name
- Compare with your computer's WiFi

### Check 2: IP Address Hasn't Changed
If you restarted your router, your IP might have changed:
```powershell
ipconfig | findstr "IPv4"
```

Current IP: **192.168.103.90**

If different, update `frontend/.env` with new IP.

### Check 3: Backend is Running
Check the backend terminal - should show:
```
INFO: Uvicorn running on http://0.0.0.0:8001
```

## 🚨 Common Issues

### Issue 1: "Access Denied" when adding rule
**Solution**: Run Command Prompt or script as Administrator

### Issue 2: Rule added but still can't connect
**Possible causes**:
1. Phone on different WiFi network
2. VPN active on phone or computer
3. Router firewall blocking connections
4. Antivirus software blocking connections

**Solutions**:
- Disable VPN temporarily
- Check router settings
- Temporarily disable antivirus to test

### Issue 3: Works on computer but not on phone
**This is the firewall issue** - follow the steps above to add the firewall rule.

## 📱 Alternative: Use Tunnel Mode

If firewall doesn't work, use Expo tunnel mode:

```bash
# In frontend directory:
npm start -- --tunnel
```

This creates a public URL that bypasses firewall issues.

**Note**: Tunnel mode is slower but works around network issues.

## ✅ After Adding Firewall Rule

1. ✅ Firewall rule added
2. ✅ Port 8001 open for incoming connections
3. ✅ Phone can connect to backend
4. ✅ Signup/login will work

## 🎯 Quick Fix Steps

1. Right-click `add_firewall_rule.bat`
2. Select "Run as administrator"
3. Wait for success message
4. Try signup again on phone
5. Should work now!

---

**Status**: ⚠️ Firewall blocking port 8001  
**Solution**: Add firewall rule (see above)  
**Backend**: ✅ Running correctly  
**Frontend**: ✅ Configured correctly  
**Issue**: ❌ Firewall blocking external connections
