# Railway Deployment Checklist

## Pre-Deployment Checklist

### 1. Code Preparation
- [ ] All code committed to Git repository
- [ ] Repository pushed to GitHub/GitLab/Bitbucket
- [ ] `.env` files are in `.gitignore` (security)
- [ ] Build succeeds locally with `npm run build:all`
- [ ] Application runs locally with production build

### 2. Environment Variables
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `VITE_GOOGLE_MAPS_API_KEY` - Google Maps API key
- [ ] `PORT` - (Optional, Railway sets automatically)
- [ ] `NODE_ENV` - Set to `production`
- [ ] `LOG_LEVEL` - Set to `info` or `warn`
- [ ] `POLL_INTERVAL_MS` - Job processor interval (default: 3000)

### 3. Database Setup
- [ ] Database schema imported (`schema.sql`)
- [ ] Database accessible from Railway IP ranges
- [ ] Connection pooling configured (if using Supabase)
- [ ] Database credentials secured

### 4. API Keys & External Services
- [ ] Google Maps API key obtained and configured
- [ ] Google Maps API has proper restrictions set
- [ ] Supabase project configured and accessible
- [ ] All third-party services allow connections from Railway

## Deployment Steps

### Step 1: Create Railway Project
- [ ] Sign in to [Railway](https://railway.app/)
- [ ] Click "New Project"
- [ ] Select "Deploy from GitHub repo"
- [ ] Authorize Railway to access your repository
- [ ] Select the `eci-segmenter` repository

### Step 2: Configure Service
- [ ] Railway detects Node.js project automatically
- [ ] Verify build command: `npm run railway:build`
- [ ] Verify start command: `npm run railway:start`
- [ ] Check that `railway.toml` is detected

### Step 3: Add Database (Choose One)

#### Option A: Railway PostgreSQL
- [ ] Click "New" → "Database" → "PostgreSQL"
- [ ] Railway automatically sets `DATABASE_URL`
- [ ] Connect to database: `railway connect postgres`
- [ ] Import schema: `\i schema.sql`

#### Option B: Use Existing Supabase
- [ ] Get Supabase connection string (pooler mode)
- [ ] Set as `DATABASE_URL` environment variable
- [ ] Verify schema is already imported in Supabase

### Step 4: Set Environment Variables
- [ ] Go to Service → Variables
- [ ] Add all required environment variables
- [ ] Verify `VITE_` prefixed variables are set (needed at build time)
- [ ] Save changes

### Step 5: Deploy
- [ ] Railway automatically triggers build
- [ ] Monitor build logs for errors
- [ ] Wait for deployment to complete
- [ ] Check deployment status (should be "Active")

### Step 6: Verify Deployment
- [ ] Click on generated Railway URL
- [ ] Verify frontend loads correctly
- [ ] Check browser console for errors
- [ ] Test API endpoints: `https://your-app.railway.app/health`
- [ ] Verify database connectivity
- [ ] Test job processing functionality

## Post-Deployment Checklist

### 1. Health Checks
- [ ] Application responds to health check: `curl https://your-app.railway.app/`
- [ ] Database connection working
- [ ] Job processor running (check logs)
- [ ] API endpoints responding

### 2. Monitoring Setup
- [ ] Review deployment logs in Railway dashboard
- [ ] Set up log alerts (if needed)
- [ ] Monitor resource usage (CPU, Memory)
- [ ] Check for any error patterns

### 3. Domain Configuration (Optional)
- [ ] Go to Service → Settings → Domains
- [ ] Add custom domain
- [ ] Configure DNS records (CNAME)
- [ ] Verify SSL certificate provisioned
- [ ] Test application on custom domain

### 4. Security Review
- [ ] Environment variables properly secured
- [ ] No secrets in code or logs
- [ ] Database credentials secure
- [ ] API keys have proper restrictions
- [ ] CORS configured correctly (if needed)

### 5. Performance Optimization
- [ ] Enable Railway sleep mode for non-production environments
- [ ] Review and optimize database queries
- [ ] Monitor application performance
- [ ] Set appropriate resource limits

## Troubleshooting Common Issues

### Build Failures

**Symptom**: Build fails during npm install or build
```bash
# Check logs
railway logs

# Common causes:
- Missing VITE_ environment variables at build time
- Frontend build failing due to missing dependencies
- TypeScript compilation errors
```

**Solutions**:
- [ ] Ensure all `VITE_` variables are set before build
- [ ] Test build locally: `npm run build:all`
- [ ] Check Node.js version matches (>=20.0.0)

### Runtime Errors

**Symptom**: App crashes or doesn't respond after deployment
```bash
# Check runtime logs
railway logs --follow
```

**Solutions**:
- [ ] Verify `DATABASE_URL` is correct
- [ ] Check database is accessible
- [ ] Verify all required env vars are set
- [ ] Ensure PORT is not hardcoded (use `process.env.PORT`)

### Database Connection Issues

**Symptom**: "Connection refused" or "timeout" errors
```bash
# Test connection
railway run node -e "require('pg').Pool({connectionString:process.env.DATABASE_URL}).query('SELECT 1')"
```

**Solutions**:
- [ ] Verify DATABASE_URL format
- [ ] Check database firewall rules
- [ ] For Supabase: use pooler connection string
- [ ] Verify database is running

### Frontend Not Loading

**Symptom**: 404 errors or blank page
```bash
# Check if static files exist
railway run ls -la dist/ui
```

**Solutions**:
- [ ] Verify frontend build completed: `npm run build:ui`
- [ ] Check `dist/ui` contains built files
- [ ] Verify server serves static files correctly
- [ ] Check browser console for errors

## Rollback Procedure

If deployment fails:
1. [ ] Go to Railway Dashboard → Deployments
2. [ ] Find last working deployment
3. [ ] Click "Redeploy"
4. [ ] Verify rollback successful

## Continuous Deployment

### Enable Auto-Deploy from GitHub
- [ ] Go to Service → Settings → Source
- [ ] Select branch for auto-deployment (e.g., `main`)
- [ ] Enable "Automatic deployments on push"
- [ ] Configure deployment checks (optional)

### Deployment Workflow
1. [ ] Push code to GitHub
2. [ ] Railway detects changes
3. [ ] Automatic build triggered
4. [ ] Health check performed
5. [ ] New version deployed (or rollback on failure)

## Maintenance

### Regular Tasks
- [ ] Monitor application logs weekly
- [ ] Review error patterns
- [ ] Update dependencies monthly
- [ ] Review and optimize database queries
- [ ] Monitor Railway usage and costs

### Updates
- [ ] Test updates in development environment first
- [ ] Create git tags for releases
- [ ] Document breaking changes
- [ ] Monitor deployment for issues
- [ ] Keep deployment documentation updated

## Support Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord Community](https://discord.gg/railway)
- [Railway Status Page](https://status.railway.app/)
- [Project Repository Issues](https://github.com/your-org/eci-segmenter/issues)

## Emergency Contacts

- Railway Support: support@railway.app
- Team Lead: [Your contact info]
- DevOps: [DevOps contact]
- Database Admin: [DBA contact]
