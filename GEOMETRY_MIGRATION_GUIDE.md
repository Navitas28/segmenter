# Segment Geometry Migration Guide

## Overview

This guide documents the addition of spatial geometry support for segments in the ECI Segmenter application. The implementation adds a PostGIS `geometry` column to persist radial wedge polygons computed during segmentation.

## What Changed

### 1. Database Schema

**New Column**: `segments.geometry` (PostGIS `geometry(Polygon, 4326)`)

- **Purpose**: Store radial wedge polygon for each segment
- **SRID**: 4326 (WGS84 coordinate system)
- **Nullable**: Yes (backward compatible with existing segments)
- **Indexed**: Yes (GIST spatial index for efficient queries)

**Migration File**: `migrations/001_add_segment_geometry.sql`

### 2. Backend Changes

#### New Module: `src/segmentation/wedgeGeometry.ts`

- `computeSegmentWedgeGeometry()`: Computes wedge polygon from family angles
- `computeAngleRange()`: Determines min/max angles for a segment
- `buildWedgePolygon()`: Constructs GeoJSON polygon from center, angles, and radius

#### Updated Modules

**`src/types/domain.ts`**
- Added optional `geometry`, `minAngle`, `maxAngle` fields to `SegmentBuild` type

**`src/segmentation/determinism.ts`**
- Updated `buildSegments()` to accept `globalCentroid` parameter
- Computes wedge geometry for each segment during build process

**`src/services/jobProcessor.ts`**
- Updated `insertSegments()` to persist wedge geometry to database
- Stores angle metadata in segment metadata JSON field
- Handles NULL geometry gracefully for backward compatibility

**`src/routes/apiRoutes.ts`**
- Updated `/segments` endpoint to fetch geometry as GeoJSON
- Uses `ST_AsGeoJSON(s.geometry)` for efficient serialization

### 3. Frontend Changes

#### Type Updates

**`src/ui/src/types/api.ts`**
- Added optional `geometry` field to `Segment` type

#### Updated Components

**`src/ui/src/components/map/WedgeGenerator.ts`**
- New: `buildWedgeGeometryFromGeometry()` - uses persisted geometry (preferred)
- New: `buildWedgeGeometryFromMetadata()` - computes from metadata (fallback)
- Updated: `buildWedgeGeometry()` - tries persisted geometry first, falls back to metadata

**`src/ui/src/components/map/utils.ts`**
- Updated `getSegmentBounds()` to prefer geometry over boundary

## Backward Compatibility

✅ **FULLY BACKWARD COMPATIBLE**

### Existing Segments (NULL geometry)

- Old segments with NULL geometry continue to work
- UI falls back to metadata-based wedge computation
- No data loss or breaking changes

### New Segments

- Automatically compute and persist wedge geometry
- UI uses persisted geometry for faster rendering
- Angle metadata stored in segment metadata for debugging

## Migration Steps

### Step 1: Run Migration

```bash
psql -U your_user -d your_database -f migrations/001_add_segment_geometry.sql
```

**Expected Output:**
```
CREATE EXTENSION
NOTICE:  Added geometry column to segments table
CREATE INDEX
COMMENT
```

### Step 2: Verify Migration

```sql
-- Check column exists
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'segments' AND column_name = 'geometry';

-- Expected: geometry | USER-DEFINED | geometry

-- Check index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'segments' AND indexname = 'idx_segments_geometry';

-- Expected: idx_segments_geometry
```

### Step 3: Deploy Application

```bash
# Install dependencies (if needed)
npm install

# Build and deploy
npm run build
npm run deploy
```

### Step 4: Test Segmentation

1. Create a new segmentation job via UI
2. Wait for completion
3. Check database for geometry data:

```sql
SELECT
  segment_name,
  ST_AsText(geometry) as wedge_geom,
  ST_NumPoints(geometry) as num_points,
  metadata->>'min_angle' as min_angle,
  metadata->>'max_angle' as max_angle
FROM segments
WHERE geometry IS NOT NULL
LIMIT 5;
```

**Expected Output:**
- `wedge_geom`: POLYGON((lng lat, lng lat, ...))
- `num_points`: 32+ points (center + 30 arc points + closure)
- `min_angle`: Numeric value in radians
- `max_angle`: Numeric value in radians

### Step 5: Verify UI Rendering

1. Open segmentation console
2. Select an AC with segmentation
3. Verify map displays wedge polygons
4. Check browser console for errors (should be none)

## Technical Details

### Wedge Computation Algorithm

1. **Global Centroid**: Compute from all voters in scope
2. **Family Angles**: Assign angle to each family using `atan2(lat-center, lng-center)`
3. **Angular Slicing**: Partition families into angular slices
4. **Packing**: Pack families into segments within each slice
5. **Wedge Geometry**: For each segment:
   - Determine min/max angles from its families
   - Compute radius as max distance from center to families (+ 20% buffer)
   - Build wedge polygon with 30 arc steps
   - Store as GeoJSON Polygon in `geometry` column

### GeoJSON Format

```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [lng, lat],  // Center point
      [lng, lat],  // Arc point 1
      [lng, lat],  // Arc point 2
      ...          // 30 arc points
      [lng, lat]   // Back to center (closed ring)
    ]
  ]
}
```

**Important Notes:**
- Coordinates are `[longitude, latitude]` (GeoJSON standard)
- First and last coordinates must match (closed ring)
- Minimum 4 points required for valid polygon
- SRID 4326 enforced by PostGIS

### Performance Considerations

- **Spatial Index**: GIST index on geometry column for fast spatial queries
- **GeoJSON Serialization**: `ST_AsGeoJSON()` is efficient for wire format
- **Frontend Caching**: Wedge geometries cached in useMemo for rendering
- **Batch Insert**: Geometry inserted with segment in single transaction

## Troubleshooting

### Issue: Migration Fails with "extension does not exist"

**Solution**: Install PostGIS extension:
```sql
CREATE EXTENSION postgis;
```

### Issue: Old segments show no wedge on map

**Explanation**: This is expected behavior. Old segments have NULL geometry and fall back to metadata-based rendering.

**Solution**: Re-run segmentation for the node to compute and persist wedge geometry.

### Issue: Geometry column shows NULL for new segments

**Possible Causes:**
1. Families have no assigned angles (check `family.angle` in logs)
2. GlobalCentroid not computed correctly
3. Error during wedge computation (check application logs)

**Solution**:
- Check logs for errors during segmentation
- Verify voters have valid lat/lng coordinates
- Run determinism check to verify algorithm

### Issue: Map not zooming to correct level

**Solution**:
- Clear browser cache
- Verify geometry exists in database
- Check `getSegmentBounds()` includes geometry in calculation

## Testing Checklist

- [ ] Migration runs successfully without errors
- [ ] Geometry column exists with correct type and SRID
- [ ] Spatial index created successfully
- [ ] New segmentation jobs persist geometry
- [ ] Old segments continue to render correctly
- [ ] Map bounds fit correctly around wedges
- [ ] TypeScript builds without errors
- [ ] No linter errors introduced
- [ ] Determinism tests pass
- [ ] Integration tests pass

## Rollback Plan

If issues arise, rollback is simple:

```sql
-- Remove geometry column
ALTER TABLE segments DROP COLUMN IF EXISTS geometry;

-- Drop spatial index
DROP INDEX IF EXISTS idx_segments_geometry;
```

**Note**: Frontend and backend code are designed to handle NULL geometry gracefully, so rollback is safe.

## Future Enhancements

- [ ] Spatial queries (e.g., "find segments overlapping area")
- [ ] Geometry validation constraints
- [ ] Automatic geometry recomputation on segment edits
- [ ] Visualization of geometry coverage metrics
- [ ] Export geometry in multiple formats (KML, Shapefile)

## References

- [PostGIS Documentation](https://postgis.net/docs/)
- [GeoJSON Specification](https://datatracker.ietf.org/doc/html/rfc7946)
- [Google Maps Polygon API](https://developers.google.com/maps/documentation/javascript/shapes#polygons)

---

**Last Updated**: 2026-02-04
**Version**: 1.0.0
**Author**: AI Agent (Cursor IDE)
