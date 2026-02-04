# Grid-Based Segmentation Engine

## Overview

This document describes the new grid-based region growing segmentation engine for election-grade deterministic spatial segmentation.

## Architecture

### Core Principles

1. **Deterministic**: Same input always produces same output
2. **Non-overlapping**: No voter belongs to multiple segments
3. **Contiguous**: Segments are spatially connected regions
4. **Family-preserving**: Family units remain together
5. **Grid-based**: Uses adaptive square grid + BFS flood-fill

### Algorithm Flow

```
1. Atomic Unit Builder
   ↓
2. Parent Boundary (Concave Hull)
   ↓
3. Adaptive Grid Generation
   ↓
4. Cell Assignment
   ↓
5. Region Growing (BFS)
   ↓
6. Segment Building
   ↓
7. Validation
   ↓
8. Database Persistence
```

## Module Breakdown

### 1. `atomicUnitBuilder.ts`

**Purpose**: Group voters into indivisible atomic units.

**Logic**:
```sql
GROUP BY COALESCE(
  family_id,
  md5(address || floor_number),
  voter_id
)
```

**Output**: Array of atomic units with centroids.

### 2. `parentBoundary.ts`

**Purpose**: Compute boundary containing all voters.

**Logic**: `ST_ConcaveHull(centroids, 0.98)`

**Output**: Polygon boundary + area in m².

### 3. `gridBuilder.ts`

**Purpose**: Generate adaptive square grid.

**Logic**:
```
grid_size = sqrt(parent_area / unit_count) * 1.5
```

**Output**: Array of grid cells with spatial index.

### 4. `cellAssigner.ts`

**Purpose**: Assign atomic units to grid cells.

**Logic**: `ST_Contains(cell.geom, unit.centroid)`

**Output**: Map of cell_id → units.

### 5. `regionGrower.ts`

**Purpose**: Grow segments via BFS flood-fill.

**Algorithm**:
- Process cells north→south, west→east (deterministic)
- Start new region from unassigned cell
- BFS expand to neighbors via `ST_Touches`
- Stop when voter_count ≥ 100
- Never exceed 165 voters
- Merge undersized regions (< 90) into neighbors

**Output**: Array of regions.

### 6. `segmentBuilder.ts`

**Purpose**: Build final segment geometries.

**Logic**:
```sql
ST_Buffer(
  ST_UnaryUnion(
    ST_Collect(cells)
  ),
  0
)
```

**Output**: Complete segments with GeoJSON.

### 7. `segmentValidator.ts`

**Purpose**: Validate segments before commit.

**Checks**:
- No overlaps
- No unassigned voters
- No duplicate assignments
- Size constraints (90-165)
- Valid geometries

**Output**: Throws on validation failure.

### 8. `segmentationEngine.ts`

**Purpose**: Orchestrate entire segmentation.

**Interface**:
```typescript
runSegmentation(
  electionId: string,
  nodeId: string,
  version: number
): Promise<SegmentationResult>
```

**Transaction**: All operations in single transaction, rollback on failure.

## Constraints

### Hard Constraints

| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Target range | 100-150 voters | Soft (region grower aims for this) |
| Absolute range | 90-165 voters | Hard (validator throws) |
| Families together | Always | Atomic units never split |
| No overlaps | Zero tolerance | Validator checks `ST_Overlaps` |
| Contiguous | Required | BFS only adds `ST_Touches` neighbors |
| Deterministic | Always | Sorted processing order |

### Fallback Grouping

```
1. family_id (if exists)
2. md5(address + floor_number)
3. Individual voter (voter.id)
```

## Database Schema

### Required Columns

**voters**:
- `location geometry(Point, 4326)` ✓
- `latitude numeric` ✓
- `longitude numeric` ✓
- `family_id uuid` ✓
- `floor_number integer` ✓
- `address text` ✓

**segments**:
- `geometry geometry(Polygon, 4326)` ✓
- `centroid geometry(Point, 4326)` ✓
- `total_voters integer` ✓
- `total_families integer` ✓

## Performance Characteristics

| Voter Count | Expected Time | Memory |
|-------------|---------------|--------|
| 1,000 | < 1s | Low |
| 10,000 | < 5s | Medium |
| 50,000 | < 30s | Medium |
| 200,000 | < 2min | High |

**Optimizations**:
- Spatial indexes on temp tables
- Bulk SQL operations
- No O(n²) loops
- Deterministic neighbor sorting

## Removed Components

The following old radial/angular segmentation logic has been **deleted**:

- ❌ `angularPartitioner.ts`
- ❌ `wedgeGeometry.ts`
- ❌ `packer.ts`
- ❌ `sorter.ts`
- ❌ `familyGrouper.ts`
- ❌ `determinism.ts`
- ❌ `validator.ts` (old)
- ❌ `geometry.ts` (old)
- ❌ `statistics.ts`

**No angular slicing, radial partitioning, or wedge geometries.**

## Integration

### Job Processor

`jobProcessor.ts` now calls:

```typescript
const result = await runSegmentation(
  job.election_id,
  job.node_id,
  job.version
);
```

All old dependencies removed.

### API Routes

No changes needed. Job processor handles segmentation internally.

### Frontend

Segments returned via:

```sql
SELECT ST_AsGeoJSON(geometry) FROM segments
```

Frontend calls `fitBounds()` after loading GeoJSON.

## Testing

### Unit Tests (Deleted)

Old test files removed:
- `test/segmentation/familyGrouper.test.ts`
- `test/segmentation/geometry.test.ts`
- `test/segmentation/packer.test.ts`
- `test/segmentation/sorter.test.ts`
- `test/segmentation/validator.test.ts`

### Integration Testing

Test via job processor:

```typescript
// Queue segmentation job
POST /api/jobs/segment

// Monitor job status
GET /api/jobs/:jobId

// Verify segments
GET /api/segments?nodeId=xxx
```

### Validation Checks

Built into validator:
1. No overlaps
2. All voters assigned
3. No duplicates
4. Size constraints
5. Valid geometries

## Determinism Guarantees

### Sources of Determinism

1. **Cell Processing Order**: North→south, west→east
2. **Neighbor Selection**: Sorted by centroid coordinates
3. **BFS Queue**: Deterministic insertion order
4. **Voter IDs**: Sorted before hashing

### Hash Computation

```sql
md5(string_agg(voter_id, ',' ORDER BY voter_id))
```

Same voter assignments → same hash.

## Troubleshooting

### Issue: Empty segments created

**Cause**: Grid too coarse, cells have zero units.

**Fix**: Increase grid density multiplier (currently 1.5).

### Issue: Validation fails: overlaps

**Cause**: `ST_UnaryUnion` didn't fully merge cells.

**Fix**: `ST_Buffer(geom, 0)` cleans topology.

### Issue: Undersized segments

**Cause**: Isolated cells at boundary.

**Fix**: Merge algorithm handles this automatically.

### Issue: Voters unassigned

**Cause**: Unit centroid outside all cells.

**Fix**: Expand parent boundary (reduce concave hull target).

## Future Enhancements

Potential improvements (not implemented):

1. **Booth boundaries**: Respect booth constraints
2. **Custom weights**: Weight by voter density
3. **Road network**: Prefer contiguous road segments
4. **Manual adjustment**: Allow post-processing edits
5. **Multi-level**: Hierarchical segmentation

## References

- PostGIS Docs: https://postgis.net/docs/
- Concave Hull: https://postgis.net/docs/ST_ConcaveHull.html
- Square Grid: https://postgis.net/docs/ST_SquareGrid.html
- BFS Algorithm: Graph traversal via spatial adjacency

---

**Last Updated**: 2026-02-04
**Engine Version**: 2.0.0 (Grid-based)
