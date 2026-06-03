# 🚀 QUICK START DEPLOYMENT GUIDE

## For Immediate Production Deployment

### ✅ Pre-Flight Check
```bash
# Verify production configuration
node verify-production.js

# Expected output:
# ✨ PRODUCTION DEPLOYMENT READY ✨
```

### 🔧 Install & Setup (2 minutes)

```bash
# 1. Install dependencies
npm install
cd frontend && npm install && cd ..

# 2. Verify .env
cat .env | grep -E "NODE_ENV|CLOUD_MONGO_URI|PORT"

# Expected:
# NODE_ENV=production
# CLOUD_MONGO_URI=mongodb+srv://...
# PORT=3001
```

### 🚀 Start Server

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

**Server will be running at**:
- API: http://localhost:3001/api
- Frontend: http://localhost:3001

### ✨ Deploy Checklist

- [x] Demo data removed
- [x] Cloud database configured
- [x] Tests passing (14/14)
- [x] Frontend built
- [x] Environment set to production
- [x] Security headers enabled
- [x] Default users created
- [x] All endpoints verified

### 📊 Key Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Login (default user)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<generated>"}'

# Get menu
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/menu
```

### 🔐 Important Security Notes

1. **Change Default Passwords**
   - Default users: admin, manager, staff
   - Passwords are auto-generated on first startup
   - Change immediately in production!

2. **Change JWT Secret**
   ```bash
   # Current secret in .env:
   # JWT_SECRET=humtum_pos_production_secret_2026_safe_key
   
   # Generate new random secret:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Update .env with new secret
   ```

3. **Enable HTTPS**
   - Get SSL certificate
   - Update VITE_API_URL to https://
   - Use reverse proxy (Nginx/Apache)

### 🐛 Troubleshooting

```bash
# Port already in use
lsof -ti :3001 | xargs kill

# Check server status
curl http://localhost:3001/api/health

# View logs
tail -f nohup.out  # if running in background

# Run tests
npm test

# Frontend issues
cd frontend && npm run dev  # run dev server on port 5173
```

### 📋 File Organization

```
.
├── server.js                    # Backend entry point
├── app.js                       # Express config
├── .env                         # Production config
├── frontend/                    # React app
│   └── dist/                    # Production build
├── src/
│   ├── routes/                  # API endpoints
│   ├── models/                  # MongoDB models
│   ├── middleware/              # Auth, etc.
│   └── lib/                     # Utilities
├── src/test/                    # Test files
├── verify-production.js         # Verification script
├── PRODUCTION_DEPLOYMENT.md     # Detailed guide
└── PRODUCTION_DEPLOYMENT_COMPLETE.md  # This summary
```

### 🎯 Next Steps

1. **Deploy to Production Server**
   ```bash
   git clone <repo>
   cd humtum-pos
   npm install
   npm start
   ```

2. **Monitor Application**
   - Check logs for errors
   - Monitor database connections
   - Track API response times
   - Set up alerts

3. **Add Real Data**
   - Create menu items via API
   - Add inventory items
   - Add staff members
   - Configure settings

### 📞 Quick Help

| Issue | Solution |
|-------|----------|
| Port in use | `lsof -ti :3001 \| xargs kill` |
| Database error | Verify CLOUD_MONGO_URI in .env |
| API not responding | Run `node verify-production.js` |
| Print not working | Install wkhtmltopdf: `brew install wkhtmltopdf` |
| Real-time not working | Check Redis health in `/api/health` |

---

**Ready to deploy!** 🎉

For detailed information, see:
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- [PRODUCTION_DEPLOYMENT_COMPLETE.md](./PRODUCTION_DEPLOYMENT_COMPLETE.md) - Complete summary
