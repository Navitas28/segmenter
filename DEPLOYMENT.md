# Deployment Instructions

## Quick Start

This guide will help you deploy the customer-facing Segmentation Console to production.

## Pre-Deployment Checklist

- [ ] Database migration completed
- [ ] Dependencies installed (including puppeteer)
- [ ] Environment variables configured
- [ ] Backend built successfully
- [ ] Frontend built successfully
- [ ] Admin console tested and working
- [ ] Customer console tested and working

## Step 1: Install Dependencies

```bash
# Root (backend)
npm install

# Frontend
cd src/ui
npm install
cd ../..
```

## Step 2: Run Database Migration

**Option A: Direct psql**
```bash
psql -h <host> -p <port> -U <user> -d <database> < migrations/002_add_customer_metadata.sql
```

**Option B: Via Railway CLI**
```bash
railway run psql < migrations/002_add_customer_metadata.sql
```

**Option C: Via Supabase**
```bash
# Copy contents of migrations/002_add_customer_metadata.sql
# Run in Supabase SQL Editor
```

Verify migration:
```sql
-- Check segmentation_jobs columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'segmentation_jobs'
AND column_name IN ('version_name', 'version_description');

-- Check segments columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'segments'
AND column_name IN ('display_name', 'description');
```

## Step 3: Build Application

```bash
# Build both backend and frontend
npm run build:all
```

This runs:
1. `npm run build` - Compiles TypeScript backend to `dist/`
2. `cd src/ui && npm run build` - Builds Vite frontend to `src/ui/dist/`

## Step 4: Environment Variables

Ensure the following environment variables are set:

**Backend (.env):**
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
PORT=3000
NODE_ENV=production
```

**Frontend (src/ui/.env):**
```env
VITE_API_BASE_URL=/api
VITE_GOOGLE_MAPS_API_KEY=...
```

## Step 5: Start Production Server

```bash
npm start
```

Or with PM2:
```bash
pm2 start dist/index.js --name eci-segmenter
pm2 save
```

## Step 6: Verify Deployment

1. **Health Check:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Admin Console:**
   - Open: `http://localhost:3000/admin`
   - Verify: All existing functionality works
   - Test: Run segmentation, view segments, check determinism

3. **Customer Console:**
   - Open: `http://localhost:3000/customer`
   - Verify: Layout loads correctly
   - Test: Select election/node, view segments
   - Test: Edit segment display name/description
   - Test: Run segmentation with version metadata
   - Test: Export PDF

4. **Root Redirect:**
   - Open: `http://localhost:3000/`
   - Verify: Redirects to `/customer`

## Troubleshooting

### Issue: Puppeteer/Chromium errors

**Solution:**
```bash
# Install system dependencies (Debian/Ubuntu)
apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2

# Or use puppeteer-core with external Chrome
npm install puppeteer-core
```

**Alternative:** Set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and use system Chrome:
```javascript
// In pdfExporter.ts
browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  ...
});
```

### Issue: "Cannot find module 'react-router-dom'"

**Solution:**
```bash
cd src/ui
npm install react-router-dom
npm run build
```

### Issue: PDF export times out

**Solutions:**
1. Increase timeout in PDF generation code
2. Add job queue (Bull/BullMQ)
3. Use serverless function for PDF generation
4. Reduce segment count per PDF

### Issue: Map doesn't load

**Solutions:**
1. Verify Google Maps API key is valid
2. Check API key has "Maps JavaScript API" enabled
3. Ensure billing is enabled on Google Cloud project
4. Create Map ID for WebGL support:
   - Go to Google Cloud Console → Maps → Map Management
   - Create new Map ID with "Vector" map type
   - Use in `mapId` prop

### Issue: 404 errors on refresh

**Solution:** Configure server to serve `index.html` for all routes:

```javascript
// In server.ts
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/dist/index.html'));
});
```

## Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY src/ui/package*.json ./src/ui/

# Install dependencies
RUN npm install
RUN cd src/ui && npm install

# Copy source
COPY . .

# Build
RUN npm run build:all

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000

CMD ["npm", "start"]
```

**Build and Run:**
```bash
docker build -t eci-segmenter .
docker run -p 3000:3000 --env-file .env eci-segmenter
```

## Railway Deployment

Railway automatically detects the build commands from `package.json`.

**railway.toml:**
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

**Deploy:**
```bash
railway up
```

**Run Migration:**
```bash
railway run psql < migrations/002_add_customer_metadata.sql
```

## Vercel/Netlify (Frontend Only)

If deploying frontend separately:

1. Build frontend: `cd src/ui && npm run build`
2. Deploy `src/ui/dist` folder
3. Configure redirects for SPA:

**Vercel (vercel.json):**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Netlify (_redirects):**
```
/*  /index.html  200
```

## Production Optimization

### 1. Enable Compression
```javascript
import compression from 'compression';
app.use(compression());
```

### 2. Add Caching Headers
```javascript
app.use(express.static('src/ui/dist', {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));
```

### 3. Use CDN for Static Assets
- Upload `src/ui/dist/assets` to CDN
- Update asset paths in `index.html`

### 4. Database Connection Pooling
Already configured in `src/db/transaction.ts`:
```javascript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 5. Add Rate Limiting
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Monitoring

### 1. Health Check Endpoint
Already available at `/health`

### 2. Add Logging
```javascript
import pino from 'pino';
const logger = pino();

app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url });
  next();
});
```

### 3. Error Tracking
Consider adding:
- Sentry for error tracking
- LogRocket for session replay
- DataDog for APM

## Security

### 1. Add Helmet
```javascript
import helmet from 'helmet';
app.use(helmet());
```

### 2. CORS Configuration
```javascript
import cors from 'cors';
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true
}));
```

### 3. Environment Variables
Never commit `.env` files. Use secure secret management:
- Railway: Use environment variables UI
- Vercel: Use environment variables UI
- Docker: Use Docker secrets or AWS Secrets Manager

## Rollback Plan

If issues occur after deployment:

1. **Revert Backend:**
   ```bash
   git revert <commit-hash>
   npm run build
   npm start
   ```

2. **Revert Frontend:**
   ```bash
   cd src/ui
   git checkout <previous-commit> .
   npm run build
   ```

3. **Revert Database:**
   ```sql
   -- Remove added columns (if needed)
   ALTER TABLE segmentation_jobs
   DROP COLUMN IF EXISTS version_name,
   DROP COLUMN IF EXISTS version_description;

   ALTER TABLE segments
   DROP COLUMN IF EXISTS display_name,
   DROP COLUMN IF EXISTS description;
   ```

## Post-Deployment

1. **Monitor Logs:**
   ```bash
   tail -f logs/app.log
   # or
   pm2 logs eci-segmenter
   # or
   railway logs
   ```

2. **Check Performance:**
   - Response times
   - Error rates
   - PDF generation times

3. **User Training:**
   - Provide IMPLEMENTATION_GUIDE.md to users
   - Demonstrate customer console features
   - Explain version naming conventions

## Support

If you encounter issues:
1. Check logs for error messages
2. Verify all environment variables are set
3. Confirm database migration completed
4. Test with minimal dataset first
5. Check browser console for frontend errors

## Success Criteria

✅ Admin console at `/admin` works as before
✅ Customer console at `/customer` loads and is functional
✅ Root `/` redirects to `/customer`
✅ Segmentation with version metadata works
✅ Segment editing (display_name/description) works
✅ PDF export generates successfully
✅ No errors in logs
✅ No performance degradation
