# Railway Deployment Guide for ECI Segmenter

## Prerequisites

1. [Railway Account](https://railway.app/)
2. Railway CLI (optional): `npm i -g @railway/cli`
3. PostgreSQL database (Supabase or Railway Postgres)

## Deployment Steps

### Option 1: Deploy via Railway Dashboard (Recommended)

1. **Create a New Project**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account and select this repository

2. **Configure Environment Variables**
   
   Navigate to your service settings and add these variables:

   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   LOG_LEVEL=info
   POLL_INTERVAL_MS=3000

   # Database
   DATABASE_URL=postgresql://user:password@host:port/database
   
   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # Frontend Environment Variables
   VITE_API_BASE_URL=/api
   VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
   ```

3. **Add PostgreSQL Database (if using Railway Postgres)**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will automatically provide `DATABASE_URL`
   - Import your schema: `railway run psql < schema.sql`

4. **Deploy**
   - Railway will automatically detect the configuration
   - It will build and deploy your application
   - Access your app via the generated Railway URL

### Option 2: Deploy via Railway CLI

1. **Install Railway CLI**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Project**
   ```bash
   railway init
   ```

4. **Link to Project (if already created)**
   ```bash
   railway link
   ```

5. **Add Database**
   ```bash
   railway add --database postgres
   ```

6. **Set Environment Variables**
   ```bash
   railway variables set PORT=3000
   railway variables set NODE_ENV=production
   railway variables set LOG_LEVEL=info
   railway variables set POLL_INTERVAL_MS=3000
   railway variables set SUPABASE_URL=your-supabase-url
   railway variables set SUPABASE_SERVICE_ROLE_KEY=your-key
   railway variables set VITE_API_BASE_URL=/api
   railway variables set VITE_GOOGLE_MAPS_API_KEY=your-key
   ```

7. **Deploy**
   ```bash
   railway up
   ```

8. **Import Database Schema**
   ```bash
   railway run psql < schema.sql
   ```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (Railway sets this automatically) | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key for frontend | `AIza...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `POLL_INTERVAL_MS` | Job processor poll interval | `3000` |
| `VITE_API_BASE_URL` | API base path for frontend | `/api` |

## Post-Deployment

1. **Verify Health Check**
   ```bash
   curl https://your-app.railway.app/
   ```

2. **Check Logs**
   ```bash
   railway logs
   ```

3. **Monitor Application**
   - Go to Railway Dashboard
   - View metrics, logs, and deployments

## Database Setup

If using Railway Postgres:

1. **Connect to Database**
   ```bash
   railway connect postgres
   ```

2. **Import Schema**
   ```bash
   railway run psql < schema.sql
   ```

If using Supabase:
- Schema should already be imported in Supabase
- Ensure `DATABASE_URL` points to Supabase pooler
- Format: `postgresql://postgres.[ref]:[password]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`

## Troubleshooting

### Build Fails

**Issue**: Frontend build fails
```bash
# Check if VITE_ environment variables are set during build
railway logs
```

**Solution**: Ensure all `VITE_` prefixed variables are set in Railway

### Database Connection Issues

**Issue**: Cannot connect to database
```bash
# Verify DATABASE_URL format
railway variables
```

**Solution**: 
- Check DATABASE_URL is correctly formatted
- Verify database is accessible from Railway (check firewall rules)
- For Supabase, use the pooler connection string

### Port Issues

**Issue**: App doesn't respond
```bash
# Railway sets PORT environment variable automatically
```

**Solution**: Ensure your app listens on `process.env.PORT` (already configured in `src/config/env.ts`)

### Memory Issues

**Issue**: Out of memory during build
```bash
# Increase build resources in Railway settings
```

**Solution**: 
- Go to Service Settings → Resources
- Increase memory allocation
- Consider using Docker build (already provided in Dockerfile)

## Custom Domain

1. Go to your service in Railway Dashboard
2. Click "Settings" → "Domains"
3. Click "Add Domain"
4. Follow DNS configuration instructions

## Continuous Deployment

Railway automatically deploys when you push to your connected branch:

1. **Configure Branch**
   - Go to Service Settings → Source
   - Select deployment branch (e.g., `main`)

2. **Automatic Deployments**
   - Push changes to GitHub
   - Railway automatically builds and deploys

3. **Deployment Checks**
   - Railway performs health checks
   - Auto-rollback on failure (if configured)

## Cost Optimization

1. **Use Railway Postgres** instead of Supabase to keep everything in one platform
2. **Set proper sleep mode** if not production (Settings → Sleep Mode)
3. **Monitor usage** in Railway Dashboard → Usage

## Support

- [Railway Documentation](https://docs.railway.app/)
- [Railway Community](https://discord.gg/railway)
- [Railway Status](https://status.railway.app/)
