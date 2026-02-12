# Deployment Checklist ✅

Use this checklist to deploy your Tambola app to production.

## 📋 Pre-Deployment

- [ ] All code errors fixed
- [ ] Backend tested locally
- [ ] Frontend tested locally
- [ ] MongoDB connection working
- [ ] Environment variables documented

## 🔧 Configuration Files Created

- [x] `.gitignore` - Prevents committing sensitive files
- [x] `backend/Procfile` - Tells Render how to start the app
- [x] `backend/runtime.txt` - Specifies Python version
- [x] `backend/render.yaml` - Render configuration
- [x] `frontend/.env` - Configured for production URL

## 🚀 Deployment Steps

### 1. GitHub Setup
- [ ] Git initialized (`git init`)
- [ ] All files added (`git add .`)
- [ ] Initial commit (`git commit -m "Initial commit"`)
- [ ] GitHub repository created
- [ ] Code pushed to GitHub (`git push`)

### 2. Render Setup
- [ ] Render account created
- [ ] GitHub connected to Render
- [ ] Web service created
- [ ] Repository selected
- [ ] Build/start commands configured
- [ ] Environment variables added:
  - [ ] MONGO_URL
  - [ ] DB_NAME
  - [ ] SECRET_KEY
- [ ] Deployment started
- [ ] Deployment successful
- [ ] URL obtained (e.g., `https://tambola-backend.onrender.com`)

### 3. MongoDB Configuration
- [ ] MongoDB Atlas → Network Access
- [ ] Added `0.0.0.0/0` (allow from anywhere)
- [ ] Connection tested from Render

### 4. Frontend Configuration
- [ ] `frontend/.env` updated with Render URL
- [ ] Expo restarted (`npm start -- --clear`)
- [ ] App tested on phone
- [ ] Signup/login working

## ✅ Post-Deployment Testing

### Backend Tests
- [ ] Health check: `curl https://your-app.onrender.com/`
- [ ] API test: `curl https://your-app.onrender.com/api/rooms`
- [ ] Signup test: Create new account
- [ ] Login test: Login with account
- [ ] Socket.IO test: Join a room

### Frontend Tests
- [ ] App loads without errors
- [ ] Signup works
- [ ] Login works
- [ ] Create room works
- [ ] Join room works
- [ ] Buy tickets works
- [ ] Game play works

### Multi-User Tests
- [ ] Two phones can signup
- [ ] Two users can join same room
- [ ] Real-time updates work
- [ ] Socket.IO events work
- [ ] Chat works (if implemented)

## 🔒 Security Checklist

- [ ] `.env` files NOT committed to git
- [ ] Strong SECRET_KEY generated
- [ ] MongoDB credentials secure
- [ ] MongoDB network access configured
- [ ] CORS configured properly
- [ ] Rate limiting considered

## 📊 Monitoring Setup

- [ ] Render dashboard bookmarked
- [ ] MongoDB Atlas dashboard bookmarked
- [ ] Logs checked for errors
- [ ] Performance metrics reviewed
- [ ] Alerts configured (optional)

## 📱 Sharing with Others

### For Testing (Development)
- [ ] Expo QR code shared
- [ ] Others can scan and test
- [ ] Backend URL is public

### For Production (App Stores)
- [ ] EAS build configured
- [ ] Android APK built
- [ ] iOS IPA built (if applicable)
- [ ] App submitted to stores

## 🔄 Continuous Deployment

- [ ] Auto-deploy enabled on Render
- [ ] Push to GitHub triggers deployment
- [ ] Deployment notifications configured
- [ ] Rollback plan documented

## 📝 Documentation

- [ ] README.md updated
- [ ] API endpoints documented
- [ ] Environment variables documented
- [ ] Deployment process documented
- [ ] Troubleshooting guide created

## 🎉 Launch Checklist

- [ ] All tests passing
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Security reviewed
- [ ] Backup plan ready
- [ ] Support plan ready
- [ ] Monitoring active
- [ ] Team notified
- [ ] Users can access
- [ ] Feedback mechanism ready

## 📞 Emergency Contacts

- **Render Support**: https://render.com/docs
- **MongoDB Support**: https://www.mongodb.com/docs/atlas/
- **Expo Support**: https://docs.expo.dev/

## 🔧 Rollback Plan

If deployment fails:

1. **Render**: Click "Manual Deploy" → Select previous commit
2. **Frontend**: Revert `.env` to previous URL
3. **Database**: Restore from backup (if needed)

## 📈 Success Metrics

Track these after deployment:

- [ ] Number of signups
- [ ] Number of active users
- [ ] Number of games played
- [ ] Average response time
- [ ] Error rate
- [ ] User feedback

---

## ✅ Deployment Status

**Current Status**: Ready to deploy

**Next Steps**:
1. Push code to GitHub
2. Deploy to Render
3. Test with multiple phones
4. Share with users

**Estimated Time**: 10-15 minutes

**See Also**:
- `QUICK_DEPLOY.md` - Quick deployment guide
- `DEPLOYMENT_GUIDE.md` - Detailed deployment guide
- `README.md` - Project overview
