# Fix Render Start Command - URGENT

## ⚠️ Problem

The start command in Render has an extra backtick causing this error:
```
bash: -c: line 1: unexpected EOF while looking for matching ``'
```

Current (WRONG):
```
uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT`
                                                                  ^ Extra backtick!
```

## ✅ Solution: Fix in Render Dashboard

### Step 1: Go to Render Dashboard

1. Go to https://dashboard.render.com
2. Click on your service (tambola-backend or similar)

### Step 2: Edit Start Command

1. Scroll down to "Build & Deploy" section
2. Find "Start Command"
3. Current value will be:
   ```
   uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT`
   ```

4. **Change it to** (remove the backtick at the end):
   ```
   uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT
   ```

5. Click "Save Changes"

### Step 3: Redeploy

1. Click "Manual Deploy" button
2. Select "Clear build cache & deploy"
3. Wait 2-3 minutes for deployment

## ✅ Correct Configuration

Your files are already correct:

**`backend/Procfile`** ✅
```
web: uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT
```

**`backend/render.yaml`** ✅
```yaml
startCommand: uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT
```

The issue is only in the Render dashboard settings.

## 🔍 How to Verify

After fixing and redeploying, check the logs:

**Good (Success)**:
```
INFO: Started server process [58]
INFO: Waiting for application startup.
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:10000
```

**Bad (Still has error)**:
```
bash: -c: line 1: unexpected EOF while looking for matching ``'
```

## 📸 Visual Guide

### Where to Find Start Command:

1. **Render Dashboard** → Your Service
2. **Settings** tab (left sidebar)
3. Scroll to **"Build & Deploy"** section
4. Find **"Start Command"** field
5. Edit and remove the extra backtick
6. Click **"Save Changes"**
7. Go to **"Manual Deploy"** tab
8. Click **"Deploy latest commit"**

## 🎯 Alternative: Delete and Recreate Service

If editing doesn't work:

1. **Delete the service** (don't worry, your code is safe in GitHub)
2. **Create new web service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT`
     (Make sure NO backtick at the end!)
5. Add environment variables
6. Deploy

## ✅ After Fix

Test the deployment:

```bash
# Test root endpoint:
curl https://your-app.onrender.com/

# Should return:
{
  "status": "ok",
  "message": "Tambola Multiplayer API is running"
}
```

## 🚨 Important Notes

1. **The backtick issue is ONLY in Render dashboard settings**
2. **Your local files (Procfile, render.yaml) are correct**
3. **You must fix it in the Render web interface**
4. **After fixing, redeploy manually**

## 📞 If Still Having Issues

1. Check the exact start command in Render dashboard
2. Copy-paste this exact command (no extra characters):
   ```
   uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT
   ```
3. Make sure there's no space or backtick at the end
4. Save and redeploy

---

**Status**: ⚠️ Needs manual fix in Render dashboard  
**Action**: Edit start command, remove backtick, redeploy  
**Time**: 2 minutes
