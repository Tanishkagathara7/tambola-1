# Quick Deploy to Render - 5 Minutes

Follow these steps to deploy your backend to Render so anyone can access it.

## 🚀 Step 1: Push to GitHub (2 minutes)

```bash
# Initialize git (if not done):
git init

# Add all files:
git add .

# Commit:
git commit -m "Deploy Tambola multiplayer game"

# Create repository on GitHub:
# Go to https://github.com/new
# Name: tambola-multiplayer
# Click "Create repository"

# Push to GitHub (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/tambola-multiplayer.git
git branch -M main
git push -u origin main
```

## 🚀 Step 2: Deploy on Render (3 minutes)

### 2.1 Create Account
1. Go to https://render.com
2. Click "Get Started"
3. Sign up with GitHub

### 2.2 Create Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select `tambola-multiplayer`
4. Configure:
   - **Name**: `tambola-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server_multiplayer:socket_app --host 0.0.0.0 --port $PORT`

### 2.3 Add Environment Variables
Click "Advanced" → Add these:

```
MONGO_URL = mongodb+srv://rag123456:rag123456@cluster0.qipvo.mongodb.net/
DB_NAME = tambola_multiplayer
SECRET_KEY = tambola-super-secret-jwt-key-min-32-chars-change-in-production
```

### 2.4 Deploy
1. Click "Create Web Service"
2. Wait 5-10 minutes
3. You'll get a URL like: `https://tambola-backend.onrender.com`

## ✅ Step 3: Update Frontend

The frontend `.env` is already configured for production!

Just restart Expo:
```bash
cd frontend
npm start -- --clear
```

## 🎉 Done!

Your app is now live and accessible from any phone!

**Backend URL**: `https://tambola-1-g7r1.onrender.com` (or your new Render URL)

### Test It:
1. Open app on your phone
2. Signup/Login - should work!
3. Share with friends - they can signup too!

### Auto-Deploy:
Every time you push to GitHub, Render will automatically deploy:
```bash
git add .
git commit -m "Your changes"
git push
# Render deploys automatically!
```

---

**Need help?** See `DEPLOYMENT_GUIDE.md` for detailed instructions.
