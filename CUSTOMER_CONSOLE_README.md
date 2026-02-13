# Customer-Facing Segmentation Console

## Overview

A production-ready customer-facing interface for electoral segmentation planning at `/customer`, complementing the existing admin/debug console at `/admin`.

## Features

### ✅ Dual Console Architecture
- **Admin Console (`/admin`)**: Technical debugging and testing interface (preserved exactly as is)
- **Customer Console (`/customer`)**: Production-grade planning interface with polished UX
- **Root Route (`/`)**: Auto-redirects to customer console

### ✅ Enhanced Data Model
- **Version Metadata**: Name and describe segmentation versions
- **Segment Display Info**: Customer-facing names and descriptions
- **Full Backward Compatibility**: Existing data continues working

### ✅ Professional UI/UX
- **TopBar**: Election/Node/Version selectors, Run button, Export PDF
- **LeftSidebar**: Layer toggles, filters, search
- **MapView**: Interactive Google Maps with segments, labels, centroids
- **RightPanel**: Summary statistics or detailed segment editor
- **BottomAuditPanel**: Collapsible integrity checks and performance metrics

### ✅ Advanced Map Features
- WebGL-enabled Google Maps
- Interactive segment polygons with hover effects
- Click to select and edit segments
- Layer toggles (boundaries, labels, centroids)
- Auto-fit bounds to data
- Smooth transitions and animations

### ✅ Version Management
- Named versions with descriptions
- Version selector with history
- Metadata stored in database
- PDF export per version

### ✅ Segment Editing
- Edit display names
- Add descriptions
- Real-time updates
- Persistent storage

### ✅ PDF Export
- Comprehensive segmentation reports
- Cover page with version metadata
- Summary statistics
- Individual segment details
- Audit and validation results
- Professional styling

### ✅ Filters & Search
- Oversized/undersized segments
- Voter count filters (>150, <100)
- Search by display name
- Client-side filtering for speed

## User Guide

### Getting Started

1. **Access the Console**
   - Navigate to `/customer` or just `/`
   - The admin console remains at `/admin`

2. **Select Your Context**
   - Choose an Election from the dropdown
   - Select a Node (AC or Booth)
   - Pick a Version (or use latest)

3. **View Segmentation**
   - Segments automatically load on the map
   - Click any segment to view/edit details
   - Use layer toggles to customize view

### Running a New Segmentation

1. Click **"Run Segmentation"** in the TopBar
2. Enter a **Version Name** (required) - e.g., "Final Review v2"
3. Optionally add a **Version Description**
4. Click **"Run"**
5. Wait for job to complete
6. Segments will automatically load

### Editing Segment Information

1. **Select a Segment**:
   - Click on a segment polygon on the map
   - Segment details appear in RightPanel

2. **Edit Information**:
   - Click "Edit" button
   - Update Display Name (what voters/officials see)
   - Add Description (context, special notes)
   - Click "Save"

3. **Changes Persist**:
   - Stored in database
   - Available in PDF exports
   - Visible in future sessions

### Exporting Reports

1. Select a version
2. Click **"Export PDF"** in TopBar
3. PDF downloads automatically
4. Contains:
   - Cover page with metadata
   - Summary statistics
   - All segment details
   - Audit information

### Using Filters

**Layer Toggles** (LeftSidebar):
- **Segment Boundaries**: Show/hide polygon outlines
- **Labels**: Show/hide segment names
- **Centroids**: Show/hide center points
- **Exceptions Only**: Filter to problem segments

**Filters**:
- **Oversized**: Segments above target size
- **Undersized**: Segments below target size
- **> 150 voters**: Large segments
- **< 100 voters**: Small segments

**Search**:
- Type in search box to filter by display name
- Real-time results
- Case-insensitive

### Understanding the Audit Panel

Click the bottom panel to expand/collapse.

**Integrity Checks**:
- ✅ All Families Assigned
- ✅ No Overlaps
- ✅ Geometry Valid
- ✅ No Empty Polygons

**Performance Metrics**:
- Algorithm execution time
- Database write time
- Validation time
- Total time

**Determinism**:
- Confirms consistent results
- Shows run hash
- Guarantees reproducibility

## Technical Details

### API Endpoints

**POST /api/jobs/segment**
```json
{
  "election_id": "uuid",
  "node_id": "uuid",
  "version_name": "Final Review v2",
  "version_description": "After boundary adjustments"
}
```

**PATCH /api/jobs/:jobId**
```json
{
  "version_name": "Updated name",
  "version_description": "Updated description"
}
```

**PATCH /api/segments/:segmentId**
```json
{
  "display_name": "North District",
  "description": "Covers industrial area"
}
```

**GET /api/segments?node_id=uuid&version=1**
Returns segments with `display_name` and `description`.

**GET /api/segments/export/pdf?versionId=uuid**
Downloads PDF report.

### Database Schema

**segmentation_jobs additions**:
```sql
version_name TEXT
version_description TEXT
created_by UUID
```

**segments additions**:
```sql
display_name TEXT
description TEXT
```

### Frontend Architecture

**State Management**:
- Zustand store for customer console state
- Separate from admin console
- Reactive updates

**Components**:
```
CustomerConsole/
├── TopBar (selectors, actions)
├── LeftSidebar (layers, filters)
├── CustomerMapView (Google Maps)
├── RightPanel (summary, editor)
└── BottomAuditPanel (validation)
```

**Routing**:
- React Router v7
- Client-side routing
- SPA with code splitting

## Best Practices

### Version Naming

**Good Examples**:
- "Initial Draft"
- "After Community Input v2"
- "Final Review - March 2024"
- "Post-Adjustment v3"

**Avoid**:
- Just numbers ("1", "2", "3")
- Vague names ("Test", "New")
- Dates only ("2024-03-15")

### Segment Display Names

**Good Examples**:
- "North Industrial District"
- "Central Residential Area"
- "Booth 42 - Sector A"
- "East Village Cluster"

**Avoid**:
- Just codes ("SEG-001")
- Technical names ("segment_xyz_123")
- Non-descriptive ("Area 1")

### Segment Descriptions

**Good Examples**:
- "Covers the industrial zone north of Highway 1. Includes 3 major factories."
- "High-density residential area with apartment complexes. Evening outreach recommended."
- "Rural segment with dispersed households. Requires vehicle-based campaigning."

**Include**:
- Geographic context
- Key landmarks
- Special characteristics
- Outreach notes

## Troubleshooting

### Map Doesn't Load
- Check browser console for errors
- Verify Google Maps API key
- Ensure mapId is configured for WebGL
- Check network connectivity

### Segments Don't Appear
- Verify election and node are selected
- Check that segmentation has been run
- Look for errors in browser console
- Try refreshing the page

### PDF Export Fails
- Check that version has completed successfully
- Verify puppeteer is installed on server
- Check server logs for errors
- Try with smaller segment count first

### Edit Button Doesn't Work
- Ensure segment is selected (click on map)
- Check browser console for errors
- Verify segment has an ID
- Refresh and try again

### Performance Issues
- Close other browser tabs
- Disable unused layers
- Apply filters to reduce visible segments
- Check network speed

## Keyboard Shortcuts

- `Escape`: Close modals
- `Ctrl/Cmd + F`: Focus search (when in sidebar)

## Support & Feedback

For technical issues:
1. Check browser console
2. Review server logs
3. Verify database connection
4. Check IMPLEMENTATION_GUIDE.md

For feature requests:
- Document use case
- Describe expected behavior
- Include screenshots if applicable

## Future Enhancements

Planned features:
- 🔒 Role-based access control
- 📊 Advanced analytics dashboard
- 🗺️ Satellite imagery overlay
- 📱 Mobile-responsive design
- 🔄 Real-time collaboration
- 📤 Export to Excel/CSV
- 🎨 Custom color schemes
- 🔍 Advanced search with filters
- 📈 Historical trend analysis
- 🤝 Segment merge/split tools

## Version History

### v1.0.0 (Current)
- ✅ Customer console at `/customer`
- ✅ Version metadata support
- ✅ Segment display names and descriptions
- ✅ PDF export
- ✅ Interactive map with layers
- ✅ Filters and search
- ✅ Audit panel with integrity checks
- ✅ Admin console preserved at `/admin`

## License & Credits

Part of the ECI Segmenter project - Deterministic voter segmentation engine.

**Technologies**:
- React 19
- TypeScript
- Google Maps JavaScript API
- Tailwind CSS
- React Query
- Zustand
- Express
- PostgreSQL + PostGIS
- Puppeteer

---

**Happy Segmenting! 🗳️**
