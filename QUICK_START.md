# Quick Start Guide - Customer Console

## Prerequisites

- Node.js 20+
- PostgreSQL with PostGIS
- Google Maps API key with Maps JavaScript API enabled

## 5-Minute Setup

### Step 1: Install Dependencies

```bash
# Backend
npm install

# Frontend
cd src/ui
npm install
cd ../..
```

**Time:** ~2 minutes

### Step 2: Run Database Migration

```bash
# If using local PostgreSQL
psql -U postgres -d eci_segmenter < migrations/002_add_customer_metadata.sql

# If using Railway
railway run psql < migrations/002_add_customer_metadata.sql

# If using Supabase - copy contents and run in SQL Editor
```

**Time:** ~30 seconds

### Step 3: Build Application

```bash
npm run build:all
```

This compiles both backend and frontend.

**Time:** ~1 minute

### Step 4: Start Server

```bash
npm start
```

Or for development with hot reload:

```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd src/ui && npm run dev
```

**Time:** ~30 seconds

### Step 5: Verify Installation

Open your browser:

1. **Admin Console**: http://localhost:3000/admin
   - ✅ Should load existing admin interface
   - ✅ All features work as before

2. **Customer Console**: http://localhost:3000/customer
   - ✅ Should load new customer interface
   - ✅ TopBar with selectors visible
   - ✅ Map loads correctly

3. **Root Redirect**: http://localhost:3000/
   - ✅ Should redirect to `/customer`

**Time:** ~1 minute

## Environment Variables

### Backend (.env)

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
PORT=3000
NODE_ENV=development
```

### Frontend (src/ui/.env)

```env
VITE_API_BASE_URL=/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
```

## First Test Run

### 1. Select Context

1. Go to http://localhost:3000/customer
2. Select an Election
3. Select a Node (AC or Booth)

### 2. Run Segmentation

1. Click "Run Segmentation"
2. Enter version name: "Test Run v1"
3. Enter description: "Testing customer console"
4. Click "Run"
5. Wait for completion (~10-30 seconds depending on data size)

### 3. View Results

- Segments appear on map
- Statistics show in RightPanel
- Layer toggles work
- Click segment to edit

### 4. Edit a Segment

1. Click any segment on map
2. Click "Edit" in RightPanel
3. Change display name to "Test Segment"
4. Add description: "This is a test"
5. Click "Save"

### 5. Export PDF

1. Click "Export PDF" in TopBar
2. PDF downloads automatically
3. Open and verify all sections present

## Troubleshooting

### Issue: "Cannot find module 'puppeteer'"

```bash
npm install puppeteer
```

### Issue: "Cannot find module 'react-router-dom'"

```bash
cd src/ui
npm install react-router-dom
npm run build
```

### Issue: Map doesn't load

1. Check Google Maps API key in `src/ui/.env`
2. Verify API key has Maps JavaScript API enabled
3. Check browser console for errors

### Issue: Segments don't appear

1. Verify segmentation job completed
2. Check that segments exist in database:
   ```sql
   SELECT COUNT(*) FROM segments WHERE node_id = 'your-node-id';
   ```
3. Check browser console for API errors

### Issue: PDF export fails with Chromium error

```bash
# Ubuntu/Debian
sudo apt-get install -y chromium-browser libnss3 libatk1.0-0

# Or use system Chrome
npm install puppeteer-core
# Then modify pdfExporter.ts to use system Chrome path
```

### Issue: Database migration fails

Check if columns already exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'segmentation_jobs'
AND column_name IN ('version_name', 'version_description');
```

If they exist, migration already ran successfully.

## Development Workflow

### Making Changes

**Frontend changes:**
```bash
cd src/ui
npm run dev
# Hot reload enabled - changes reflect immediately
```

**Backend changes:**
```bash
npm run dev
# tsx watch mode - restarts on file changes
```

### Testing

```bash
# Run backend tests
npm test

# Check TypeScript compilation
npm run build
cd src/ui && npm run build
```

### Database Changes

For any new schema changes:
1. Create new migration file: `migrations/003_your_change.sql`
2. Make changes idempotent (use `IF NOT EXISTS`)
3. Test on local database first
4. Apply to production carefully

## Production Deployment

See DEPLOYMENT.md for detailed production setup.

Quick production start:

```bash
# 1. Build
npm run build:all

# 2. Set production env
export NODE_ENV=production

# 3. Run migration
psql $DATABASE_URL < migrations/002_add_customer_metadata.sql

# 4. Start with PM2
pm2 start dist/index.js --name eci-segmenter
pm2 save
```

## Common Commands

```bash
# Install dependencies
npm install && cd src/ui && npm install

# Development mode
npm run dev                    # Backend hot reload
cd src/ui && npm run dev       # Frontend hot reload

# Build for production
npm run build:all              # Build both

# Start production
npm start                      # Start server

# Database
psql $DATABASE_URL < migrations/002_add_customer_metadata.sql

# Clean and rebuild
rm -rf node_modules dist src/ui/node_modules src/ui/dist
npm install
npm run build:all
```

## File Structure Overview

```
eci-segmenter/
├── migrations/
│   ├── 001_add_segment_geometry.sql
│   └── 002_add_customer_metadata.sql    ← New migration
├── src/
│   ├── routes/
│   │   ├── apiRoutes.ts                  ← Modified
│   │   └── jobRoutes.ts                  ← Modified
│   ├── services/
│   │   └── pdfExporter.ts                ← New service
│   └── ui/
│       └── src/
│           ├── App.tsx                    ← Modified (routing)
│           ├── components/
│           │   └── customer/              ← New folder (5 files)
│           ├── pages/
│           │   ├── SegmentationConsole.tsx (unchanged)
│           │   └── CustomerConsole.tsx    ← New page
│           ├── services/
│           │   └── api.ts                 ← Modified (new functions)
│           ├── store/
│           │   └── useCustomerStore.ts    ← New store
│           └── types/
│               └── api.ts                 ← Modified (new fields)
├── CHANGES_SUMMARY.md                     ← This implementation summary
├── CUSTOMER_CONSOLE_README.md             ← User guide
├── DEPLOYMENT.md                          ← Production deployment
├── IMPLEMENTATION_GUIDE.md                ← Technical details
└── QUICK_START.md                         ← You are here
```

## Next Steps

1. ✅ Complete quick start setup
2. ✅ Verify both consoles work
3. 📖 Read CUSTOMER_CONSOLE_README.md for feature details
4. 🚀 Deploy to production (see DEPLOYMENT.md)
5. 🔒 Consider adding authentication
6. 📊 Monitor usage and performance

## Getting Help

1. **Check Documentation:**
   - CUSTOMER_CONSOLE_README.md - User guide
   - IMPLEMENTATION_GUIDE.md - Technical details
   - DEPLOYMENT.md - Production setup
   - CHANGES_SUMMARY.md - What changed

2. **Common Issues:**
   - Check browser console
   - Check server logs
   - Verify environment variables
   - Ensure database migration ran

3. **Debugging:**
   ```bash
   # Check if server is running
   curl http://localhost:3000/health

   # Check database connection
   psql $DATABASE_URL -c "SELECT version();"

   # Check for port conflicts
   lsof -i :3000
   ```

## Success! 🎉

If you've completed all steps successfully:

- ✅ Admin console works at `/admin`
- ✅ Customer console works at `/customer`
- ✅ You can run segmentations with version metadata
- ✅ You can edit segment display names and descriptions
- ✅ You can export PDF reports
- ✅ All features are functional

**You're ready to use the customer console in production!**

---

**Need more details?** See the other documentation files for comprehensive information.
