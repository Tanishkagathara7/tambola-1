# Deployment Guide - Render & Production Setup

This guide will help you deploy your Tambola backend to Render so it's accessible from any phone.

## 🎯 Overview

After deployment:
- ✅ Backend will be accessible at: `https://your-app.onrender.com`
- ✅ Any phone can signup/login (no firewall issues)
- ✅ Automatic deployments when you push to GitHub
- ✅ Free tier available on Render

## 📋 Prerequisites

1. GitHub account
2. Render account (free) - https://render.com
3. MongoDB Atlas account (already have)
4. Your code pushed to GitHub

## 🚀 Step 1: Prepare Your Code

### 1.1 Update .gitignore

The `.gitignore` file has been created. Make sure `.env` files are NOT committed:

```bash
# Check what will be committed:
git status

# If .env is listed, it will be ignored (good!)
```

### 1.2 Create Environment-Specific Config

Update `frontend/.env` to support both local and production:

```env
# For local development (uncomment when developing locally):
# EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001

# For production (uncomment when testing with deployed backend):
EXPO_PUBLIC_BACKEND_URL=https://tambola-1-g7r1.onrender.com
```

**Important**: 
- Use local IP when developing
- Use Render URL when testing production
- Commit this file with production URL

### 1.3 Verify Backend Files

These files have been created for deployment:
- ✅ `backend/render.yaml` - Render configuration
- ✅ `backend/Procfile` - Start command
- ✅ `backend/runtime.txt` - Python version
- ✅ `.gitignore` - Ignore sensitive files

## 🚀 Step 2: Push to GitHub

### 2.1 Initialize Git (if not already done)

```bash
# Check if git is initialized:
git status

# If not initialized:
git init
git add .
git commit -m "Initial commit - Tambola multiplayer game"
```

### 2.2 Create GitHub Repository

1. Go to https://github.com
2. Click "New repository"
3. Name: `tambola-multiplayer`
4. Description: "Multiplayer Tambola/Housie game with React Native and FastAPI"
5. Keep it **Private** (recommended) or Public
6. Click "Create repository"

### 2.3 Push Your Code

```bash
# Add GitHub remote (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/tambola-multiplayer.git

# Push to GitHub:
git branch -M main
git push -u origin main
```

## 🚀 Step 3: Deploy to Render

### 3.1 Create Render Account

1. Go to https://render.com
2. Click "Get Started"
3. Sign up with GitHub (recommended)

### 3.2 Create New Web Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select `tambola-multiplayer` repository
4. Configure:
   - **Name**: `tambola-backend` (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free

### 3.3 Add Environment Variables

In Render dashboard, add these environment variables:

1. **MONGO_URL**
   - Value: `mongodb+srv://rag123456:rag123456@cluster0.qipvo.mongodb.net/`
   - (Your MongoDB connection string)

2. **DB_NAME**
   - Value: `tambola_multiplayer`

3. **SECRET_KEY**
   - Value: `tambola-super-secret-jwt-key-min-32-chars-change-in-production`
   - (Or generate a new secure key)

4. **PORT** (Auto-set by Render)
   - Render automatically provides this

### 3.4 Deploy

1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes first time)
3. Watch the logs for any errors
4. Once deployed, you'll get a URL like: `https://tambola-backend.onrender.com`

## 🔧 Step 4: Update Frontend Configuration

### 4.1 Update Frontend .env

```env
# Production backend URL (from Render):
EXPO_PUBLIC_BACKEND_URL=https://tambola-backend.onrender.com

# For local development, comment above and uncomment below:
# EXPO_PUBLIC_BACKEND_URL=http://192.168.103.90:8001
```

### 4.2 Restart Expo

```bash
cd frontend
npm start -- --clear
```

### 4.3 Test Signup/Login

1. Open app on your phone
2. Try signup - should work!
3. Try login - should work!
4. Share the app with friends - they can signup too!

## 🎉 Step 5: Verify Deployment

### 5.1 Test Backend API

```bash
# Test health check:
curl https://tambola-backend.onrender.com/

# Test API endpoint:
curl https://tambola-backend.onrender.com/api/rooms
# Should return: {"detail":"Not authenticated"}
```

### 5.2 Test from Phone

1. Open app
2. Signup with new account
3. Should work without any network errors!

## 🔄 Step 6: Automatic Deployments

Now whenever you push to GitHub, Render will automatically deploy:

```bash
# Make changes to your code
git add .
git commit -m "Your changes"
git push

# Render will automatically:
# 1. Detect the push
# 2. Build the new version
# 3. Deploy it
# 4. Your app will be updated!
```

## 📱 Step 7: Share with Others

### 7.1 Share the Expo App

**Option 1: Expo Go (Development)**
1. Share the QR code from Expo terminal
2. Others scan with Expo Go app
3. They can test your app

**Option 2: Build APK/IPA (Production)**
```bash
cd frontend

# For Android:
eas build --platform android

# For iOS:
eas build --platform ios
```

### 7.2 Share Backend URL

Your backend is now public at:
```
https://tambola-backend.onrender.com
```

Anyone can:
- ✅ Signup
- ✅ Login
- ✅ Create rooms
- ✅ Play games

## 🔒 Security Considerations

### 1. Change Default Credentials

Update `backend/.env` (and Render environment variables):

```env
# Generate a strong secret key:
SECRET_KEY=your-very-long-random-secret-key-here-min-32-chars

# Use environment-specific MongoDB:
MONGO_URL=your-production-mongodb-url
```

### 2. MongoDB Security

1. Go to MongoDB Atlas
2. Network Access → Add IP Address
3. Add `0.0.0.0/0` (allow from anywhere) for Render
4. Or add Render's IP addresses

### 3. Rate Limiting

Consider adding rate limiting to prevent abuse:

```python
# In server_multiplayer.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
```

## 🐛 Troubleshooting

### Issue 1: Deployment Failed

**Check Render logs**:
1. Go to Render dashboard
2. Click your service
3. Click "Logs"
4. Look for error messages

**Common issues**:
- Missing dependencies in `requirements.txt`
- Wrong Python version
- MongoDB connection issues

### Issue 2: App Can't Connect

**Check**:
1. Backend URL in `frontend/.env` is correct
2. Expo app was restarted after changing .env
3. Backend is running (check Render dashboard)

### Issue 3: MongoDB Connection Error

**Fix**:
1. Check MongoDB Atlas → Network Access
2. Add `0.0.0.0/0` to allow all IPs
3. Verify MONGO_URL in Render environment variables

### Issue 4: Render Free Tier Sleeps

Render free tier sleeps after 15 minutes of inactivity:
- First request after sleep takes 30-60 seconds
- Consider upgrading to paid tier for always-on
- Or use a service like UptimeRobot to ping every 14 minutes

## 📊 Monitoring

### Render Dashboard

Monitor your app:
1. **Metrics**: CPU, Memory usage
2. **Logs**: Real-time logs
3. **Events**: Deployment history

### MongoDB Atlas

Monitor database:
1. **Metrics**: Connections, operations
2. **Performance**: Query performance
3. **Alerts**: Set up alerts for issues

## 🎯 Production Checklist

Before going live:

- [ ] Code pushed to GitHub
- [ ] Backend deployed to Render
- [ ] Environment variables set in Render
- [ ] MongoDB allows Render IPs
- [ ] Frontend .env updated with Render URL
- [ ] Tested signup/login from phone
- [ ] Tested with multiple users
- [ ] Changed default SECRET_KEY
- [ ] Set up monitoring/alerts
- [ ] Documented API for team

## 🚀 Next Steps

1. **Build Mobile App**:
   ```bash
   cd frontend
   eas build --platform android
   ```

2. **Publish to App Stores**:
   - Google Play Store (Android)
   - Apple App Store (iOS)

3. **Add Features**:
   - Push notifications
   - In-app purchases
   - Analytics
   - Crash reporting

4. **Scale**:
   - Upgrade Render plan
   - Add Redis for caching
   - Add CDN for assets

## 📞 Support

If you encounter issues:

1. Check Render logs
2. Check MongoDB Atlas logs
3. Test API endpoints with curl
4. Review this guide
5. Check Render documentation: https://render.com/docs

---

## 🎉 Summary

After following this guide:

✅ Backend deployed to Render  
✅ Accessible from any phone  
✅ Automatic deployments on git push  
✅ MongoDB connected  
✅ Frontend configured for production  
✅ Ready to share with others  

**Your Render URL**: `https://tambola-backend.onrender.com`  
**Status**: Ready for production use!
