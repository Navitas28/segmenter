# Customer-Facing Segmentation Console - Implementation Guide

## Overview

This implementation adds a production-grade customer-facing Segmentation Console at `/customer` while preserving the existing debug/testing console at `/admin` completely unchanged.

## Changes Summary

### Database Schema Extensions

**Migration File:** `migrations/002_add_customer_metadata.sql`

#### `segmentation_jobs` table additions:
- `version_name` (TEXT) - Human-readable version name for customer console
- `version_description` (TEXT) - Customer-facing description of this segmentation version
- `created_by` (UUID) - User who created the job (already existed)

#### `segments` table additions:
- `display_name` (TEXT) - Customer-facing display name (defaults to segment_name if null)
- `description` (TEXT) - Customer-facing description for this segment

**Migration Command:**
```bash
psql < migrations/002_add_customer_metadata.sql
```

### Backend API Extensions

#### Modified Endpoints:

**POST /api/jobs/segment**
- Now accepts optional fields:
  - `version_name` (string)
  - `version_description` (string)
  - `created_by` (string, UUID)

**GET /api/segments**
- Now returns:
  - `display_name` (defaults to `segment_name` if null)
  - `description`

#### New Endpoints:

**PATCH /api/jobs/:jobId**
- Update job metadata
- Body: `{version_name?: string, version_description?: string}`
- Returns: Updated job object

**PATCH /api/segments/:segmentId**
- Update segment display information
- Body: `{display_name?: string, description?: string}`
- Returns: Updated segment object

**GET /api/segments/export/pdf?versionId=<uuid>**
- Export segmentation report as PDF
- Requires `puppeteer` package (added to dependencies)
- Returns: PDF file with comprehensive segmentation report

### Frontend Changes

#### New Dependencies:
- `react-router-dom@^7.2.0` - Routing
- `puppeteer@^23.0.0` - PDF generation (backend)

#### Routing Structure:
- `/` → Redirects to `/customer`
- `/admin` → Existing Segmentation Testing Console (unchanged)
- `/customer` → New Customer-Facing Console

#### New Customer Console Components:

**CustomerConsole** (`src/ui/src/pages/CustomerConsole.tsx`)
- Main container with layout structure

**TopBar** (`src/ui/src/components/customer/TopBar.tsx`)
- Election/Node/Version selectors
- Run Segmentation button (with version metadata modal)
- Export PDF button

**LeftSidebar** (`src/ui/src/components/customer/LeftSidebar.tsx`)
- Map Layers toggles:
  - Segment Boundaries
  - Labels
  - Centroids
  - GeoHash Tiles
  - Families
  - Exceptions Only
  - Previous Version Overlay
- Filters:
  - Oversized/Undersized segments
  - Voter count filters (>150, <100)
- Search by display name

**CustomerMapView** (`src/ui/src/components/customer/CustomerMapView.tsx`)
- Google Maps with WebGL mode
- Interactive segment polygons
- Hover tooltips
- Click to select segments
- Fit bounds on load
- Centroid markers and labels

**RightPanel** (`src/ui/src/components/customer/RightPanel.tsx`)
- Default: Segmentation Summary
  - Total segments, voters, families
  - Average size, range
- When segment selected:
  - Editable display_name and description
  - Segment statistics
  - Centroid coordinates

**BottomAuditPanel** (`src/ui/src/components/customer/BottomAuditPanel.tsx`)
- Collapsible panel
- Integrity checks visualization
- Performance metrics
- Determinism confirmation

**State Management** (`src/ui/src/store/useCustomerStore.ts`)
- Zustand store for customer console state
- Separate from admin console state

**API Service Extensions** (`src/ui/src/services/api.ts`)
- `updateJob(jobId, payload)` - Update job metadata
- `updateSegment(segmentId, payload)` - Update segment display info
- `exportSegmentsPdf(versionId)` - Download PDF report

**PDF Exporter** (`src/services/pdfExporter.ts`)
- HTML template generation
- Puppeteer-based PDF conversion
- Multi-page report with:
  - Cover page with version metadata
  - Summary statistics
  - Individual segment details
  - Audit and validation results

## Installation & Setup

### 1. Install Dependencies

**Backend:**
```bash
npm install
```

**Frontend:**
```bash
cd src/ui
npm install
```

### 2. Run Database Migration

```bash
psql -h <host> -U <user> -d <database> < migrations/002_add_customer_metadata.sql
```

Or via Railway:
```bash
railway run psql < migrations/002_add_customer_metadata.sql
```

### 3. Build & Deploy

**Development:**
```bash
npm run dev              # Backend
cd src/ui && npm run dev # Frontend
```

**Production:**
```bash
npm run build:all        # Build backend + frontend
npm start                # Start server
```

## Testing Checklist

- [ ] `/admin` route loads and functions exactly as before
- [ ] `/` route redirects to `/customer`
- [ ] `/customer` route loads the new customer console
- [ ] Election/Node/Version selectors work
- [ ] Run Segmentation modal appears and accepts version metadata
- [ ] Segments display on map with boundaries and labels
- [ ] Clicking a segment selects it and shows details in RightPanel
- [ ] Editing segment display_name and description works
- [ ] Export PDF generates and downloads correctly
- [ ] Layer toggles (boundaries, labels, centroids) work
- [ ] Filters apply correctly
- [ ] Search by display name works
- [ ] Bottom audit panel collapses/expands
- [ ] Integrity checks and performance metrics display
- [ ] No errors in browser console
- [ ] Admin console remains fully functional

## Architecture Decisions

### Why Separate Routes?
- Clean separation of concerns
- Admin console remains untouched (zero regression risk)
- Customer console optimized for different UX needs
- Future: Can add role-based authentication easily

### Why Zustand for Customer Store?
- Lightweight state management
- Separate from admin console state
- Easy to reason about and debug

### Why Puppeteer for PDF?
- Industry standard for HTML-to-PDF
- Full control over styling and layout
- Can render complex layouts with CSS
- Headless Chrome provides accurate rendering

### Why Not Modify Existing Components?
- Zero risk to existing admin functionality
- Customer console has different UX requirements
- Clean separation allows independent evolution
- Shared map components would complicate both

## Security Considerations

**Current Implementation:**
- No authentication/authorization implemented yet
- Both `/admin` and `/customer` are publicly accessible

**Future Enhancement:**
- Add authentication middleware
- Role-based access control:
  - `/admin` → require `role: "admin"`
  - `/customer` → require authenticated user
- Update database RLS policies
- Add user session management

## Performance Notes

- Puppeteer adds ~150MB to Docker image (Chromium)
- PDF generation is synchronous (blocks thread)
- Consider adding job queue for PDF generation if heavy usage
- Map rendering uses WebGL for better performance
- Segment polygons cached in refs to avoid re-renders

## Backward Compatibility

✅ **All existing functionality preserved:**
- Admin console unchanged
- Existing API endpoints unmodified (only extended)
- Database schema is additive (no breaking changes)
- Existing records continue working
- `display_name` defaults to `segment_name` if null

## Known Limitations

1. **PDF Generation:**
   - Synchronous (may timeout on large reports)
   - No progress indication
   - Consider adding queue for production

2. **Map Layers:**
   - GeoHash and Families layers not fully implemented (toggles present but no rendering)
   - Previous Version Overlay not implemented

3. **Authentication:**
   - Not implemented (per requirements)
   - Both consoles publicly accessible

4. **Search:**
   - Basic client-side search
   - No fuzzy matching or highlights

## Future Enhancements

- [ ] Add authentication and role-based access
- [ ] Implement GeoHash and Families map layers
- [ ] Add version comparison in customer console
- [ ] Queue-based PDF generation
- [ ] Real-time job status updates via WebSocket
- [ ] Segment merge/split functionality
- [ ] Bulk segment editing
- [ ] Export to Excel/CSV
- [ ] Mobile-responsive design
- [ ] Audit log viewer in customer console

## Support & Troubleshooting

**If `/customer` shows blank page:**
1. Check browser console for errors
2. Verify React Router is installed: `cd src/ui && npm list react-router-dom`
3. Check that `VITE_API_BASE_URL` is set correctly in `.env`

**If PDF export fails:**
1. Verify puppeteer is installed: `npm list puppeteer`
2. Check server logs for Chromium errors
3. Ensure sufficient memory for headless Chrome
4. Try: `npm install puppeteer --force`

**If map doesn't load:**
1. Check Google Maps API key in environment
2. Verify `mapId` is configured for WebGL
3. Check browser console for Google Maps errors

**If segments don't appear:**
1. Check that segments have geometry data
2. Verify `display_name` is being returned from API
3. Check that `useSegments` hook is being called with correct params

## File Structure

```
eci-segmenter/
├── migrations/
│   └── 002_add_customer_metadata.sql
├── src/
│   ├── routes/
│   │   ├── apiRoutes.ts (modified)
│   │   └── jobRoutes.ts (modified)
│   ├── services/
│   │   └── pdfExporter.ts (new)
│   └── ui/
│       └── src/
│           ├── App.tsx (modified - routing)
│           ├── components/
│           │   └── customer/ (new)
│           │       ├── TopBar.tsx
│           │       ├── LeftSidebar.tsx
│           │       ├── CustomerMapView.tsx
│           │       ├── RightPanel.tsx
│           │       └── BottomAuditPanel.tsx
│           ├── pages/
│           │   ├── SegmentationConsole.tsx (unchanged)
│           │   └── CustomerConsole.tsx (new)
│           ├── services/
│           │   └── api.ts (modified - new endpoints)
│           ├── store/
│           │   └── useCustomerStore.ts (new)
│           └── types/
│               └── api.ts (modified - new fields)
└── package.json (modified - puppeteer added)
```

## Conclusion

This implementation successfully adds a production-grade customer console while maintaining 100% backward compatibility with the existing admin console. All changes are additive and non-breaking.
