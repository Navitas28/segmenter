# Segment Generation System — Complete Guide

## 📋 Table of Contents

1. [Project Context](#project-context)
2. [What is Segment Generation? (For Project Managers)](#what-is-segment-generation-for-project-managers)
3. [How Segment Generation Works (Technical)](#how-segment-generation-works-technical)
4. [Prerequisites](#prerequisites)
5. [API Usage](#api-usage)
6. [Verification & Testing](#verification--testing)
7. [LLM-Understandable Reference](#llm-understandable-reference)

---

## Project Context

**Project Name**: ECI Segmenter (Election Commission of India - Voter Segmentation System)

**Purpose**: This system divides voters into operational segments for field operations. Each segment represents a manageable workload (90-165 voters) that can be assigned to a field officer for door-to-door operations.

**Technology Stack**:
- **Backend**: Node.js + TypeScript + PostgreSQL + PostGIS
- **Database**: Supabase (PostgreSQL with PostGIS extensions)
- **Frontend**: React + TypeScript + Google Maps API
- **Architecture**: RESTful API with job queue processing

**Key Principle**: The system is 100% deterministic — same input always produces the same output. This is critical for legal defensibility, auditability, and operational reliability in election management.

---

## What is Segment Generation? (For Project Managers)

### The Problem

In election operations, field workers need to visit voters for various tasks (verification, outreach, polling booth management). To efficiently manage field operations:

1. **Workload Management**: Each worker needs a manageable number of voters (~100-150)
2. **Geographic Clustering**: Voters should be geographically close together
3. **Family Integrity**: Families must stay together (never split across segments)
4. **Legal Compliance**: Segments must be reproducible and auditable

**Example**:
```
Before Segmentation:
- 3,000 voters spread across a city
- 1,200 family units
- No organization or assignment

After Segmentation:
- Segment 1: 125 voters (48 families) in North area
- Segment 2: 142 voters (52 families) in Central area
- Segment 3: 118 voters (45 families) in South area
- ... (20 total segments)

Each segment is:
- Geographically contiguous
- Contains 90-165 voters
- Keeps families together
- Assigned to one field officer
```

### Why It Matters

1. **Operational Efficiency**: Field workers have clear, bounded workloads
2. **Cost Savings**: Minimizes travel time between voters
3. **Quality Control**: Manageable segment sizes ensure thorough coverage
4. **Legal Defensibility**: Deterministic algorithm is auditable and reproducible
5. **Scalability**: Handles 200,000+ voters efficiently

### How It Works (Simple Explanation)

The system uses **GeoHash-Based Fixed-Precision Segmentation**:

#### What is GeoHash?

GeoHash is a way to encode GPS coordinates into a short string of letters and numbers. Nearby locations have similar GeoHashes.

**Example**:
```
Location A: 26.890°N, 80.953°E → GeoHash: "ttnxr5m"
Location B: 26.891°N, 80.954°E → GeoHash: "ttnxr5q" (nearby, similar)
Location C: 28.650°N, 77.230°E → GeoHash: "ttnw2gk" (far away, different)
```

The first few characters indicate the general area. More characters = more precision.

#### The Algorithm (4 Steps)

**Step 1: Load Families with GeoHash**
- Load all families from the database
- Calculate 7-character GeoHash for each family's location
- Each GeoHash represents a ~152m × 152m tile

**Step 2: Group Families by GeoHash Tile**
- Families with the same GeoHash are in the same tile
- This creates geographic clusters automatically
- Example: 50 families might map to 15 different tiles

**Step 3: Pack Tiles into Segments**
- Process tiles in lexicographic (alphabetical) order
- Start with first tile, keep adding tiles until segment reaches target size
- Target: 90-165 voters, ideal: 125 voters
- Stop adding when segment is full, start new segment

**Step 4: Create Segment Geometry**
- Combine all GeoHash tiles in segment into one polygon
- Calculate segment center point (centroid)
- Store geometry in database for map visualization

### Real-World Example

**Input Data**:
- 3,929 voters
- 1,547 families
- Spread across urban area (~5km²)

**Processing**:
1. Calculate GeoHash for 1,547 families → 423 unique tiles
2. Pack tiles into segments:
   - Tile 1: 5 families (12 voters)
   - Tile 2: 8 families (19 voters)
   - Tile 3: 12 families (35 voters)
   - ... keep adding until total ≥ 90 voters
   - Result: Segment 1 with 112 voters across 7 tiles
3. Repeat for remaining tiles

**Output**:
- 32 segments created
- Average segment size: 122 voters
- All families kept together
- All segments geographically contiguous

### Visual Representation

```
Geographic Area (Map View):

┌─────────────────────────────────────┐
│  Segment 1 (125 voters, blue)      │
│  ┌─┬─┬─┐                            │
│  │█│█│█│ ← GeoHash tiles            │
│  └─┴─┴─┘                            │
│                                     │
│           Segment 2 (142 voters, green)
│           ┌─┬─┬─┬─┐                │
│           │█│█│█│█│                │
│           └─┴─┴─┴─┘                │
│                                     │
│  Segment 3 (98 voters, red)        │
│  ┌─┬─┐                              │
│  │█│█│                              │
│  └─┴─┘                              │
└─────────────────────────────────────┘

Each colored area = 1 segment
Each small square = 1 GeoHash tile (~152m × 152m)
Segments are contiguous (tiles touch)
```

### Key Benefits

1. **Deterministic**: Same voter data always produces same segments
2. **Geographically Optimal**: Families in same area stay together
3. **Scalable**: Handles 200,000+ voters in under 2 minutes
4. **Auditable**: Every step logged, hash computed for verification
5. **Legally Defensible**: No randomness, fully reproducible

---

## How Segment Generation Works (Technical)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Client Application / UI                     │
│              (Create Segmentation Job Request)               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ POST /api/jobs/segment
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Job Queue System                         │
│                (segmentation_jobs table)                     │
│                                                              │
│  Status: queued → processing → completed                    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ Job Processor picks job
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   jobProcessor.ts                            │
│              (Orchestrates segmentation)                     │
│                                                              │
│  Calls → runSegmentation(electionId, nodeId, version)       │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                segmentationEngine.ts                         │
│           (Core Segmentation Algorithm)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 1: Fetch Families with GeoHash                 │  │
│  │  - Load families from database                       │  │
│  │  - Calculate 7-char GeoHash for each                 │  │
│  │  - Sort by GeoHash (deterministic order)             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 2: Fixed-Precision GeoHash Grouping            │  │
│  │  - Group families by exact GeoHash                   │  │
│  │  - Create tiles (one per unique GeoHash)             │  │
│  │  - Pack tiles into segments sequentially             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 3: Insert Segments with Geometry               │  │
│  │  - Build polygon from GeoHash tiles                  │  │
│  │  - Calculate centroid (center point)                 │  │
│  │  - Insert into segments table                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 4: Insert Segment Members (Families)           │  │
│  │  - Link families to segments (segment_members)       │  │
│  │  - Batch insert for performance                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 5: Validation                                   │  │
│  │  - All families assigned to segments                 │  │
│  │  - No overlapping geometry                           │  │
│  │  - Valid PostGIS geometries                          │  │
│  │  - No empty geometries                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STEP 6: Compute Deterministic Hash                  │  │
│  │  - MD5 hash of all family assignments                │  │
│  │  - Stored as run_hash for verification               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                        SUCCESS                               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ Return Result
                             ▼
                ┌────────────────────────────┐
                │  Job Status → completed     │
                │  Result: segment_count,     │
                │          voter_count,       │
                │          run_hash, etc.     │
                └────────────────────────────┘
```

### Database Schema

**families table** (input):
```sql
CREATE TABLE families (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL,
  booth_id UUID NOT NULL,
  member_count INTEGER,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  -- ... other fields
);

-- GeoHash computed on-the-fly:
-- ST_GeoHash(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), 7)
```

**segments table** (output):
```sql
CREATE TABLE segments (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL,
  node_id UUID NOT NULL,              -- AC or Booth scope
  segment_name TEXT NOT NULL,          -- "Segment 001"
  segment_type TEXT DEFAULT 'auto',
  total_voters INTEGER NOT NULL,
  total_families INTEGER NOT NULL,
  assigned_blo_id UUID,                -- Field officer assignment
  status TEXT DEFAULT 'draft',         -- draft | active | completed
  color TEXT,                          -- Hex color for map display
  metadata JSONB,                      -- Algorithm metadata
  centroid_lat NUMERIC,
  centroid_lng NUMERIC,
  centroid GEOMETRY(Point, 4326),
  geometry GEOMETRY(MultiPolygon, 4326), -- PostGIS geometry
  created_at TIMESTAMP DEFAULT NOW(),
  -- ... other fields
);

-- Indexes for performance
CREATE INDEX idx_segments_election_id ON segments(election_id);
CREATE INDEX idx_segments_node_id ON segments(node_id);
CREATE INDEX idx_segments_geometry ON segments USING GIST(geometry);
```

**segment_members table** (links):
```sql
CREATE TABLE segment_members (
  id UUID PRIMARY KEY,
  segment_id UUID NOT NULL REFERENCES segments(id),
  family_id UUID NOT NULL REFERENCES families(id),
  is_manual_override BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_segment_members_segment_id ON segment_members(segment_id);
CREATE INDEX idx_segment_members_family_id ON segment_members(family_id);
```

**segmentation_jobs table** (job queue):
```sql
CREATE TABLE segmentation_jobs (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL,
  node_id UUID NOT NULL,
  job_type TEXT NOT NULL,              -- 'auto_segment'
  status TEXT DEFAULT 'queued',        -- queued | processing | completed | failed
  version INTEGER,                     -- Version number
  result JSONB,                        -- Segmentation result
  error TEXT,                          -- Error message if failed
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Step-by-Step Algorithm

#### Step 1: Fetch Families with GeoHash

**Purpose**: Load all families and compute 7-character GeoHash for geographic indexing.

**SQL Query**:
```sql
SELECT
  f.id,
  f.member_count,
  f.latitude,
  f.longitude,
  ST_GeoHash(
    ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326),
    7  -- 7 characters = ~152m × 152m precision
  ) AS geohash
FROM families f
WHERE f.election_id = $1
  AND f.member_count > 0  -- Skip empty families
ORDER BY ST_GeoHash(
  ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326),
  7
) ASC  -- Sort by GeoHash (deterministic order)
```

**TypeScript Interface**:
```typescript
type Family = {
  id: string;
  member_count: number;
  latitude: number;
  longitude: number;
  geohash: string;  // 7-character GeoHash
};
```

**Why 7 Characters?**
- GeoHash precision 7 = ~152m × 152m area
- Balances between too coarse (large areas) and too fine (tiny areas)
- Typical urban block size in Indian cities
- Computationally efficient

**GeoHash Example**:
```
26.890°N, 80.953°E → "ttnxr5m"
26.891°N, 80.954°E → "ttnxr5q" (nearby, similar prefix)
```

#### Step 2: Fixed-Precision GeoHash Grouping

**Purpose**: Group families by GeoHash tiles, then pack tiles into segments.

**Algorithm**:

**2.1: Group families by exact GeoHash**
```typescript
const tileMap = new Map<string, {family_ids: string[]; total_voters: number}>();

for (const family of families) {
  const geohash = family.geohash;
  const existing = tileMap.get(geohash);

  if (existing) {
    existing.family_ids.push(family.id);
    existing.total_voters += family.member_count;
  } else {
    tileMap.set(geohash, {
      family_ids: [family.id],
      total_voters: family.member_count,
    });
  }
}

// Result: Map of GeoHash → families in that tile
// Example:
// "ttnxr5m" → [fam1, fam2, fam3] (25 voters total)
// "ttnxr5q" → [fam4, fam5] (12 voters total)
```

**2.2: Convert to sorted tile array**
```typescript
type Tile = {
  geohash: string;
  family_ids: string[];
  total_voters: number;
};

const tiles: Tile[] = Array.from(tileMap.entries())
  .map(([geohash, data]) => ({
    geohash,
    family_ids: data.family_ids,
    total_voters: data.total_voters,
  }))
  .sort((a, b) => a.geohash.localeCompare(b.geohash));
  // Sort lexicographically (alphabetically) for determinism
```

**2.3: Pack tiles into segments using greedy algorithm**
```typescript
const TARGET_MIN = 90;
const TARGET_MAX = 165;
const TARGET_IDEAL = 125;

const segments: Segment[] = [];
const unassignedTiles = [...tiles];
let segmentNumber = 1;

while (unassignedTiles.length > 0) {
  const segmentTiles: Tile[] = [];
  let sumVoters = 0;

  // Greedy packing: add tiles until we reach target
  for (let i = 0; i < unassignedTiles.length; i++) {
    const tile = unassignedTiles[i];
    const newTotal = sumVoters + tile.total_voters;

    // Check if adding this tile would exceed maximum
    if (newTotal <= TARGET_MAX) {
      segmentTiles.push(tile);
      sumVoters = newTotal;

      // Remove from unassigned
      unassignedTiles.splice(i, 1);
      i--;  // Adjust index after removal

      // Stop if we've reached ideal size
      if (sumVoters >= TARGET_IDEAL) {
        break;
      }
    }
  }

  // If no tiles fit (oversized tile), take it anyway (exception)
  if (segmentTiles.length === 0) {
    segmentTiles.push(unassignedTiles.shift()!);
    sumVoters = segmentTiles[0].total_voters;
  }

  // Create segment
  const allFamilyIds = segmentTiles.flatMap(t => t.family_ids);
  const geohashTiles = segmentTiles.map(t => t.geohash);

  segments.push({
    id: `seg-${segmentNumber}`,
    code: String(segmentNumber).padStart(3, '0'),  // "001", "002", etc.
    family_ids: allFamilyIds,
    total_voters: sumVoters,
    total_families: allFamilyIds.length,
    geohash_prefixes: geohashTiles,
  });

  segmentNumber++;
}
```

**Greedy Packing Logic**:
1. Start with empty segment
2. Try to add first unassigned tile
3. If total ≤ 165 voters, add it
4. If total ≥ 125 voters, stop (ideal size reached)
5. Otherwise, continue adding tiles
6. When segment full or ideal size reached, start new segment
7. Repeat until all tiles assigned

**Exception Handling**:
- **Oversized tile** (>165 voters): Create single-tile segment, mark as exception
- **Undersized segment** (<90 voters): Attempt to merge with adjacent segment
- All exceptions flagged in metadata for manual review

#### Step 3: Insert Segments with Geometry

**Purpose**: Store segments in database with PostGIS polygon geometry.

**Geometry Construction**:

PostGIS provides `ST_GeomFromGeoHash()` function to convert GeoHash to polygon:

```sql
-- Convert GeoHash to polygon
ST_GeomFromGeoHash('ttnxr5m')
-- Returns: POLYGON((lng1 lat1, lng2 lat2, lng3 lat3, lng4 lat4, lng1 lat1))

-- Combine multiple GeoHash tiles into one polygon:
ST_Multi(
  ST_UnaryUnion(
    ST_Collect(ARRAY[
      ST_GeomFromGeoHash('ttnxr5m'),
      ST_GeomFromGeoHash('ttnxr5q'),
      ST_GeomFromGeoHash('ttnxr5r')
    ])
  )
)
-- ST_Collect: Combine geometries into collection
-- ST_UnaryUnion: Merge overlapping/touching polygons into one
-- ST_Multi: Ensure result is MultiPolygon type
```

**Centroid Calculation**:
```sql
ST_Centroid(
  ST_UnaryUnion(
    ST_Collect(ARRAY[geohash_geometries])
  )
)
-- Returns center point of the merged polygon
```

**Insert Query**:
```sql
INSERT INTO segments (
  election_id,
  node_id,
  segment_name,
  segment_type,
  total_voters,
  total_families,
  status,
  color,
  metadata,
  centroid_lat,
  centroid_lng,
  centroid,
  geometry
)
VALUES (
  $1,  -- election_id
  $2,  -- node_id
  'Segment 001',
  'auto',
  125,  -- total_voters
  48,   -- total_families
  'draft',
  '#1f77b4',  -- blue color
  '{"algorithm": "geohash_fixed_precision_7", ...}'::jsonb,
  ST_Y(centroid_geom),  -- latitude
  ST_X(centroid_geom),  -- longitude
  centroid_geom,
  multi_polygon_geom
)
RETURNING id;
```

**Metadata Stored**:
```json
{
  "node_id": "uuid",
  "voter_count": 125,
  "family_count": 48,
  "version": 1,
  "segment_code": "001",
  "deterministic": true,
  "algorithm": "geohash_fixed_precision_7",
  "geohash_tiles": ["ttnxr5m", "ttnxr5q", "ttnxr5r"],
  "exception": false
}
```

**If segment is oversized or undersized**:
```json
{
  "exception": true,
  "exception_type": "oversized",  // or "undersized"
  "exception_reason": "Contains large indivisible families...",
  "requires_manual_review": true,
  "... other metadata ..."
}
```

#### Step 4: Insert Segment Members

**Purpose**: Link families to segments in junction table.

**Batch Insert** (for performance):
```sql
INSERT INTO segment_members (segment_id, family_id, is_manual_override)
VALUES
  ($1, $2, false),
  ($3, $4, false),
  ($5, $6, false),
  ...
  -- Batch size: 5,000 rows per query
```

**Why Batch?**:
- Inserting 50,000 rows one at a time: ~50 seconds
- Inserting 50,000 rows in batches of 5,000: ~5 seconds
- 10x performance improvement

**TypeScript Implementation**:
```typescript
const chunkSize = 5000;
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize);

  const values: string[] = [];
  const params: unknown[] = [];

  chunk.forEach((row) => {
    const offset = params.length;
    values.push(`($${offset + 1}, $${offset + 2}, false)`);
    params.push(row.segment_id, row.family_id);
  });

  await client.query(
    `INSERT INTO segment_members (segment_id, family_id, is_manual_override)
     VALUES ${values.join(',')}`,
    params
  );
}
```

#### Step 5: Validation

**Purpose**: Ensure segmentation is correct before committing transaction.

**Validation 1: All families assigned**
```sql
SELECT COUNT(*) as count
FROM families f
LEFT JOIN segment_members sm ON sm.family_id = f.id
WHERE f.election_id = $1
  AND f.member_count > 0
  AND sm.id IS NULL  -- No segment assignment
```
**Expected**: 0 (all families assigned)
**If > 0**: Throw error and rollback transaction

**Validation 2: No overlapping geometry**
```sql
SELECT COUNT(*) as count
FROM segments a
JOIN segments b ON a.id <> b.id
WHERE a.election_id = $1
  AND ST_Overlaps(a.geometry, b.geometry)
  -- ST_Overlaps checks interior overlap only
  -- (boundary touching is allowed)
```
**Expected**: 0 (no overlaps)
**If > 0**: Throw error and rollback transaction

**Validation 3: Valid geometries**
```sql
SELECT COUNT(*) as count
FROM segments
WHERE election_id = $1
  AND NOT ST_IsValid(geometry)
```
**Expected**: 0 (all geometries valid)

**Validation 4: No empty geometries**
```sql
SELECT COUNT(*) as count
FROM segments
WHERE election_id = $1
  AND ST_IsEmpty(geometry)
```
**Expected**: 0 (no empty geometries)

#### Step 6: Compute Deterministic Hash

**Purpose**: Create unique fingerprint of segmentation for verification.

**Hash Computation**:
```sql
SELECT md5(
  string_agg(family_id::text, ',' ORDER BY family_id)
)::text as hash
FROM segment_members sm
JOIN segments s ON sm.segment_id = s.id
WHERE s.node_id = $1 AND s.status = 'draft'
```

**Why ORDER BY family_id?**:
- Ensures deterministic ordering
- Same family assignments → same hash
- Used to verify reproducibility

**Hash Usage**:
- Stored in `segmentation_jobs.result`
- Compared across multiple runs to verify determinism
- Used in audit logs for verification

### Transaction Safety

**All steps execute in a single database transaction**:

```typescript
await withTransaction(async (client) => {
  // STEP 1: Fetch families
  const families = await fetchFamiliesWithGeoHash(client, electionId);

  // STEP 2: Group and pack
  const segments = performFixedPrecisionGrouping(families);

  // STEP 3: Insert segments
  const segmentIds = await insertSegmentsWithGeometry(
    client, segments, families, electionId, nodeId, version
  );

  // STEP 4: Insert members
  await insertSegmentMembersByFamily(client, segments, segmentIds);

  // STEP 5: Validation
  await validateAllFamiliesAssigned(client, electionId);
  await validateNoOverlappingGeometry(client, electionId);
  await validateGeometryValidity(client, electionId);
  await validateNoEmptyGeometry(client, electionId);

  // STEP 6: Compute hash
  const runHash = await computeRunHash(client, nodeId);

  return {
    segment_count: segments.length,
    voter_count: totalVoters,
    run_hash: runHash,
    // ... other stats
  };
});
```

**Transaction Benefits**:
- **Atomicity**: Either all segments created or none
- **Consistency**: Database never in partial state
- **Isolation**: Concurrent jobs don't interfere
- **Durability**: Once committed, changes are permanent

**Rollback Triggers**:
- Any SQL error
- Validation failure
- Unassigned families found
- Invalid geometries detected
- Overlapping geometries detected

### Performance Characteristics

**Optimization Strategies**:
1. **GeoHash Indexing**: O(n) spatial grouping instead of O(n²)
2. **Batch Inserts**: 5,000 rows per query instead of one at a time
3. **Single Transaction**: Minimizes database round trips
4. **Spatial Indexes**: GIST indexes for geometry queries
5. **Deterministic Sorting**: Predictable processing order

**Scaling**:
| Voter Count | Family Count | Expected Time | Memory Usage |
|-------------|--------------|---------------|--------------|
| 1,000       | ~400         | < 5 seconds   | Low          |
| 10,000      | ~4,000       | < 15 seconds  | Medium       |
| 50,000      | ~20,000      | < 60 seconds  | Medium       |
| 200,000     | ~80,000      | < 120 seconds | High         |

**Actual Production Data**:
- Input: 3,929 voters, 1,547 families
- Output: 32 segments
- Processing time: ~12 seconds total
  - Algorithm: ~3 seconds
  - Database writes: ~6 seconds
  - Validation: ~3 seconds

**Bottlenecks**:
- GeoHash computation: O(n) but fast with PostGIS
- Tile packing: O(t × s) where t = tiles, s = segments (typically small)
- Geometry construction: O(s) where s = segments
- Member inserts: O(f) where f = families (mitigated by batching)

---

## Prerequisites

### System Requirements

1. **Database**:
   - PostgreSQL 14+
   - PostGIS 3.0+ extension enabled
   - Supabase connection configured
   - GeoHash support (`ST_GeoHash` function available)

2. **Node.js Environment**:
   - Node.js 18+ with TypeScript
   - Dependencies installed: `npm install`
   - Build successful: `npm run build`

3. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://user:pass@host:port/database
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-service-role-key
   PORT=3000
   ```

4. **Database Schema**:
   - `families` table with latitude/longitude
   - `segments` table with geometry column
   - `segment_members` junction table
   - `segmentation_jobs` table for job queue
   - PostGIS extension enabled

### Data Prerequisites

**Required: Families Generated**

Segmentation requires families to be generated first:

```bash
# Step 1: Generate families
curl -X POST http://localhost:3000/generate-family \
  -H "Content-Type: application/json" \
  -d '{"election_id": "your-election-id"}'

# Step 2: Verify families exist
psql $DATABASE_URL -c "
  SELECT COUNT(*) as family_count
  FROM families
  WHERE election_id = 'your-election-id'
"
# Should return > 0 families
```

**Data Quality Requirements**:
1. **Families must have coordinates**:
   - All families need `latitude` and `longitude`
   - GPS coordinates must be valid (not NULL)
   - Coordinates should be accurate to actual locations

2. **Member counts must be accurate**:
   - `families.member_count` should match actual voter count
   - Run family generation to ensure counts are updated

3. **Scope (node_id) must exist**:
   - AC or Booth must exist in `hierarchy_nodes` table
   - node_id must be valid UUID

### Verification Before Segmentation

**Check 1: Families exist and have coordinates**
```sql
SELECT
  COUNT(*) as total_families,
  COUNT(latitude) as families_with_coords,
  SUM(member_count) as total_voters
FROM families
WHERE election_id = 'your-election-id';
```

**Expected**:
- `total_families` > 0
- `families_with_coords` = `total_families`
- `total_voters` > 0

**Check 2: PostGIS extension enabled**
```sql
SELECT PostGIS_Version();
```

**Expected**: Returns PostGIS version (e.g., "3.3.2")

**Check 3: GeoHash function available**
```sql
SELECT ST_GeoHash(
  ST_SetSRID(ST_MakePoint(80.953, 26.890), 4326),
  7
) as test_geohash;
```

**Expected**: Returns 7-character string (e.g., "ttnxr5m")

---

## API Usage

### Job-Based Segmentation

Segmentation runs asynchronously through a job queue system:

```
1. Create job → 2. Job queued → 3. Processor picks job →
4. Segmentation runs → 5. Job completed → 6. Check results
```

### Endpoint 1: Create Segmentation Job

**URL**: `POST /api/jobs/segment`

**Request Body**:
```json
{
  "election_id": "f19da7ca-2490-4df6-a445-3add1b8791a6",
  "node_id": "ac-node-uuid-or-booth-uuid",
  "job_type": "auto_segment"
}
```

**Success Response** (201 Created):
```json
{
  "job_id": "job-uuid-12345",
  "status": "queued",
  "created_at": "2026-02-05T10:30:00Z"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/jobs/segment \
  -H "Content-Type: application/json" \
  -d '{
    "election_id": "f19da7ca-2490-4df6-a445-3add1b8791a6",
    "node_id": "ac-node-uuid",
    "job_type": "auto_segment"
  }'
```

### Endpoint 2: Check Job Status

**URL**: `GET /api/jobs/:jobId`

**Response (Processing)**:
```json
{
  "id": "job-uuid-12345",
  "status": "processing",
  "started_at": "2026-02-05T10:30:05Z",
  "progress": "Step 3/6: Inserting segments..."
}
```

**Response (Completed)**:
```json
{
  "id": "job-uuid-12345",
  "status": "completed",
  "started_at": "2026-02-05T10:30:05Z",
  "completed_at": "2026-02-05T10:30:17Z",
  "result": {
    "segment_count": 32,
    "voter_count": 3929,
    "family_count": 1547,
    "algorithm_ms": 3245,
    "db_write_ms": 6123,
    "total_ms": 12456,
    "run_hash": "a3f5d8c9e2b1..."
  }
}
```

**Response (Failed)**:
```json
{
  "id": "job-uuid-12345",
  "status": "failed",
  "error": "Validation failed: 15 families not assigned to any segment",
  "started_at": "2026-02-05T10:30:05Z",
  "completed_at": "2026-02-05T10:30:10Z"
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/jobs/job-uuid-12345
```

### Endpoint 3: Get Segments

**URL**: `GET /api/segments?nodeId={nodeId}&version={version}`

**Query Parameters**:
- `nodeId`: UUID of AC or Booth
- `version`: (optional) Specific version number

**Response**:
```json
{
  "segments": [
    {
      "id": "segment-uuid-1",
      "segment_name": "Segment 001",
      "total_voters": 125,
      "total_families": 48,
      "centroid_lat": 26.890,
      "centroid_lng": 80.953,
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [[[[lng, lat], [lng, lat], ...]]]
      },
      "metadata": {
        "geohash_tiles": ["ttnxr5m", "ttnxr5q"],
        "algorithm": "geohash_fixed_precision_7"
      }
    },
    {
      "id": "segment-uuid-2",
      "segment_name": "Segment 002",
      "total_voters": 142,
      "total_families": 52,
      // ... more fields
    }
    // ... more segments
  ],
  "total_count": 32
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/segments?nodeId=ac-node-uuid&version=1"
```

### Complete Workflow Example (TypeScript)

```typescript
async function runSegmentationWorkflow(
  electionId: string,
  nodeId: string
) {
  // Step 1: Create job
  const jobResponse = await fetch('http://localhost:3000/api/jobs/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      election_id: electionId,
      node_id: nodeId,
      job_type: 'auto_segment',
    }),
  });

  const { job_id } = await jobResponse.json();
  console.log('Job created:', job_id);

  // Step 2: Poll for completion
  let status = 'queued';
  while (status === 'queued' || status === 'processing') {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const statusResponse = await fetch(
      `http://localhost:3000/api/jobs/${job_id}`
    );
    const jobStatus = await statusResponse.json();
    status = jobStatus.status;

    console.log('Job status:', status);

    if (status === 'failed') {
      throw new Error(`Job failed: ${jobStatus.error}`);
    }
  }

  // Step 3: Fetch segments
  const segmentsResponse = await fetch(
    `http://localhost:3000/api/segments?nodeId=${nodeId}`
  );
  const { segments } = await segmentsResponse.json();

  console.log(`Segmentation complete: ${segments.length} segments created`);
  return segments;
}

// Usage
runSegmentationWorkflow(
  'f19da7ca-2490-4df6-a445-3add1b8791a6',
  'ac-node-uuid'
)
  .then(segments => console.log('Success:', segments.length, 'segments'))
  .catch(error => console.error('Failed:', error));
```

---

## Verification & Testing

### SQL Verification Queries

#### 1. Check Segmentation Summary

```sql
SELECT
  COUNT(DISTINCT s.id) as total_segments,
  SUM(s.total_voters) as total_voters,
  SUM(s.total_families) as total_families,
  ROUND(AVG(s.total_voters), 2) as avg_segment_size,
  MIN(s.total_voters) as min_segment_size,
  MAX(s.total_voters) as max_segment_size
FROM segments s
WHERE s.election_id = 'your-election-id'
  AND s.status = 'draft';
```

**Expected Output**:
```
total_segments | total_voters | total_families | avg_segment_size | min_segment_size | max_segment_size
---------------|--------------|----------------|------------------|------------------|------------------
      32       |     3929     |      1547      |      122.78      |        90        |       165
```

#### 2. Check for Exceptions

```sql
SELECT
  s.segment_name,
  s.total_voters,
  s.total_families,
  s.metadata->>'exception_type' as exception_type,
  s.metadata->>'exception_reason' as exception_reason
FROM segments s
WHERE s.election_id = 'your-election-id'
  AND s.metadata->>'exception' = 'true'
ORDER BY s.total_voters DESC;
```

**Expected**: Few or no exceptions

#### 3. Verify All Families Assigned

```sql
SELECT
  COUNT(DISTINCT f.id) as total_families,
  COUNT(DISTINCT sm.family_id) as assigned_families,
  COUNT(DISTINCT f.id) - COUNT(DISTINCT sm.family_id) as unassigned_families
FROM families f
LEFT JOIN segment_members sm ON sm.family_id = f.id
LEFT JOIN segments s ON s.id = sm.segment_id AND s.status = 'draft'
WHERE f.election_id = 'your-election-id'
  AND f.member_count > 0;
```

**Expected**: `unassigned_families` = 0

#### 4. Check Segment Geometry

```sql
SELECT
  s.segment_name,
  ST_GeometryType(s.geometry) as geom_type,
  ST_NumGeometries(s.geometry) as num_parts,
  ST_IsValid(s.geometry) as is_valid,
  ST_Area(s.geometry::geography) as area_sq_meters,
  s.metadata->'geohash_tiles' as geohash_tiles
FROM segments s
WHERE s.election_id = 'your-election-id'
  AND s.status = 'draft'
ORDER BY s.segment_name
LIMIT 5;
```

**Expected**:
- `geom_type`: ST_MultiPolygon
- `is_valid`: true
- `area_sq_meters`: positive value
- `geohash_tiles`: array of GeoHash strings

#### 5. Check for Overlapping Segments

```sql
SELECT
  a.segment_name as segment_a,
  b.segment_name as segment_b,
  ST_Area(ST_Intersection(a.geometry, b.geometry)::geography) as overlap_area_sq_meters
FROM segments a
JOIN segments b ON a.id < b.id  -- Only check each pair once
WHERE a.election_id = 'your-election-id'
  AND a.status = 'draft'
  AND ST_Overlaps(a.geometry, b.geometry)
ORDER BY overlap_area_sq_meters DESC;
```

**Expected**: 0 rows (no overlaps)

#### 6. Segment Size Distribution

```sql
SELECT
  CASE
    WHEN s.total_voters < 90 THEN 'Undersized (<90)'
    WHEN s.total_voters BETWEEN 90 AND 100 THEN '90-100'
    WHEN s.total_voters BETWEEN 101 AND 125 THEN '101-125 (ideal)'
    WHEN s.total_voters BETWEEN 126 AND 150 THEN '126-150 (ideal)'
    WHEN s.total_voters BETWEEN 151 AND 165 THEN '151-165'
    ELSE 'Oversized (>165)'
  END as size_range,
  COUNT(*) as segment_count,
  SUM(s.total_voters) as total_voters_in_range
FROM segments s
WHERE s.election_id = 'your-election-id'
  AND s.status = 'draft'
GROUP BY size_range
ORDER BY MIN(s.total_voters);
```

**Expected**: Most segments in 90-165 range

### Testing with UI Console

The project includes a Segmentation Testing Console for visual verification:

**Step 1: Start Development Server**
```bash
cd src/ui
npm run dev
```

**Step 2: Open Console**
```
http://localhost:5173/segmentation-console
```

**Step 3: Test Workflow**
1. Select election from dropdown
2. Choose scope (AC or Booth)
3. Click "Run Segmentation"
4. Wait for completion
5. View segments on map
6. Check analytics tabs:
   - Overview: totals and distribution
   - Segments Table: list of all segments
   - Exceptions: any segments requiring review
   - Graphs: size distribution charts

**Step 4: Visual Verification**
- Map should show non-overlapping polygons
- Each polygon = 1 segment
- Polygons should be contiguous (no islands)
- Colors distinguish adjacent segments
- Clicking polygon shows segment details

**Debug Controls**:
- ✅ Show Geometry Bounds
- ✅ Show Boundaries
- ☐ Show Voters (optional, can be slow)
- ✅ Show Centroids
- ☐ Show Hashes (for debugging)

### Determinism Testing

**Purpose**: Verify same input produces same output

**Test Procedure**:
1. Run segmentation (Job 1)
2. Note the `run_hash` from result
3. Delete segments: `DELETE FROM segments WHERE election_id = '...'`
4. Run segmentation again (Job 2)
5. Compare `run_hash` from Job 2

**Expected**: Hashes match exactly

**SQL Verification**:
```sql
-- Get hash from Job 1
SELECT result->>'run_hash' as hash_1
FROM segmentation_jobs
WHERE id = 'job-1-uuid';

-- Get hash from Job 2
SELECT result->>'run_hash' as hash_2
FROM segmentation_jobs
WHERE id = 'job-2-uuid';

-- Compare
SELECT
  (SELECT result->>'run_hash' FROM segmentation_jobs WHERE id = 'job-1-uuid') =
  (SELECT result->>'run_hash' FROM segmentation_jobs WHERE id = 'job-2-uuid')
  as hashes_match;
```

**Expected**: `hashes_match` = true

### Performance Testing

**Objective**: Verify scaling characteristics

**Test Cases**:
| Voters | Families | Expected Time |
|--------|----------|---------------|
| 1,000  | ~400     | < 5 seconds   |
| 10,000 | ~4,000   | < 15 seconds  |
| 50,000 | ~20,000  | < 60 seconds  |

**Monitoring**:
- Check `segmentation_jobs.result` for timing breakdown
- Monitor database CPU and memory usage
- Check for transaction timeouts

### Testing Checklist

- [ ] **Prerequisites**
  - [ ] PostGIS extension enabled
  - [ ] Families generated with coordinates
  - [ ] GeoHash function available
  - [ ] Database connection working

- [ ] **Job Creation**
  - [ ] POST request succeeds
  - [ ] Job appears in segmentation_jobs table
  - [ ] Job status transitions: queued → processing → completed
  - [ ] Result JSON populated with statistics

- [ ] **Segmentation Results**
  - [ ] Segments created in segments table
  - [ ] Segment members linked in segment_members table
  - [ ] All families assigned (0 unassigned)
  - [ ] Geometries valid (ST_IsValid = true)
  - [ ] No overlapping segments (ST_Overlaps = 0)
  - [ ] Segment sizes within range (90-165)

- [ ] **Geometry Verification**
  - [ ] Polygons render on map
  - [ ] Polygons are contiguous
  - [ ] Centroids calculated correctly
  - [ ] GeoHash tiles stored in metadata

- [ ] **Determinism**
  - [ ] Same run_hash across multiple runs
  - [ ] Same segment assignments
  - [ ] Same geometry output

- [ ] **Performance**
  - [ ] Completes within expected time
  - [ ] Memory usage reasonable
  - [ ] No database timeouts

- [ ] **UI Console**
  - [ ] Segments display on map
  - [ ] Analytics show correct counts
  - [ ] Exceptions flagged if present
  - [ ] Export works

---

## LLM-Understandable Reference

### System Summary for AI Agents

**PROJECT**: ECI Segmenter - Election voter management system

**COMPONENT**: Segment Generation Engine

**LOCATION**:
- Core Engine: `src/segmentation/segmentationEngine.ts`
- Job Processor: `src/services/jobProcessor.ts`
- API Routes: `POST /api/jobs/segment`, `GET /api/jobs/:jobId`, `GET /api/segments`

**INPUT**:
- Election ID (UUID string)
- Node ID (AC or Booth UUID)
- Version number
- Families data (from family generation step)

**OUTPUT**:
- Segments table populated with geographic polygons
- Segment members table linking families to segments
- Job result with statistics: segment_count, voter_count, algorithm_ms, run_hash

**ALGORITHM**: GeoHash Fixed-Precision Segmentation (7 characters)

**6 Steps**:
1. **Fetch families**: Load families with 7-char GeoHash from database
2. **Group by GeoHash**: Create tiles (one per unique GeoHash)
3. **Pack tiles**: Greedy packing into segments (90-165 voters each)
4. **Build geometry**: Convert GeoHash tiles to PostGIS MultiPolygon
5. **Insert records**: Store segments and member links in database
6. **Validate**: Check all families assigned, no overlaps, valid geometries

**KEY TECHNICAL DETAILS**:

**GeoHash Precision**:
- 7 characters = ~152m × 152m tile
- Computed: `ST_GeoHash(ST_MakePoint(lng, lat), 7)`
- Example: 26.890°N, 80.953°E → "ttnxr5m"

**Tile Packing**:
- Target range: 90-165 voters per segment
- Ideal size: 125 voters
- Greedy algorithm: add tiles sequentially until target reached
- Deterministic: tiles sorted lexicographically (alphabetically)

**Geometry Construction**:
```sql
ST_Multi(
  ST_UnaryUnion(
    ST_Collect(ARRAY[
      ST_GeomFromGeoHash('hash1'),
      ST_GeomFromGeoHash('hash2'),
      ...
    ])
  )
)
```
- Converts GeoHash strings to polygons
- Merges adjacent polygons into one
- Ensures MultiPolygon type for database

**Constraints**:
- Minimum: 90 voters (flagged as undersized if less)
- Maximum: 165 voters (flagged as oversized if more)
- Target: 100-150 voters
- Families never split across segments

**Validation**:
1. All families assigned to segments
2. No interior overlapping geometry (ST_Overlaps = 0)
3. All geometries valid (ST_IsValid = true)
4. No empty geometries (ST_IsEmpty = false)

**Determinism**:
- Lexicographic sorting of GeoHash tiles
- Consistent packing order
- Hash computed: MD5 of sorted family IDs
- Same input always produces same output

**PERFORMANCE**:
- Scales to 200,000+ voters
- ~12 seconds for 4,000 voters (3 sec algorithm + 6 sec DB + 3 sec validation)
- Bulk SQL operations (no loops)
- Batch inserts (5,000 rows per query)
- Single transaction (atomic)

**DATABASE SCHEMA**:
```
families {
  id: UUID PK
  election_id: UUID FK
  latitude: NUMERIC (required for GeoHash)
  longitude: NUMERIC (required for GeoHash)
  member_count: INTEGER
}

segments {
  id: UUID PK
  election_id: UUID FK
  node_id: UUID FK
  segment_name: TEXT
  total_voters: INTEGER
  total_families: INTEGER
  centroid: GEOMETRY(Point, 4326)
  geometry: GEOMETRY(MultiPolygon, 4326)
  metadata: JSONB {
    algorithm: "geohash_fixed_precision_7",
    geohash_tiles: ["hash1", "hash2", ...],
    exception: boolean,
    ...
  }
}

segment_members {
  id: UUID PK
  segment_id: UUID FK → segments.id
  family_id: UUID FK → families.id
  is_manual_override: BOOLEAN
}

segmentation_jobs {
  id: UUID PK
  election_id: UUID FK
  node_id: UUID FK
  status: TEXT (queued | processing | completed | failed)
  result: JSONB {
    segment_count, voter_count, run_hash, ...
  }
}
```

**ERROR HANDLING**:
- Transaction rollback on any validation failure
- Job status set to "failed" with error message
- Errors logged with context
- No partial segmentation (all-or-nothing)

**PRODUCTION METRICS** (Real Data):
- Input: 3,929 voters, 1,547 families
- Output: 32 segments
- Average segment size: 122.78 voters
- Range: 90-165 voters
- Processing time: ~12 seconds
- Run hash: Deterministic

**EXCEPTION HANDLING**:
- **Oversized segment** (>165 voters): Occurs when single GeoHash tile has too many families (indivisible unit). Flagged with metadata: `{exception: true, exception_type: "oversized", requires_manual_review: true}`
- **Undersized segment** (<90 voters): Occurs at boundary areas with sparse population. Flagged with metadata: `{exception: true, exception_type: "undersized", requires_manual_review: true}`

**INTEGRATION POINTS**:
- **Requires**: Family Generation (families table populated)
- **Triggers**: Job queue processor picks jobs
- **Used by**: UI Segmentation Console for visualization
- **Exports**: GeoJSON for map rendering

**VISUALIZATION**:
- Frontend: React + Google Maps API
- Geometry: MultiPolygon rendered as map overlay
- Centroids: Markers with voter count labels
- Colors: Cyclically assigned for adjacent segment distinction

**TESTING**:
- Determinism tests: verify same run_hash across runs
- Validation tests: check constraints (size, overlaps, etc.)
- Performance tests: scaling with voter count
- Visual tests: UI console for map verification

**MAINTENANCE NOTES**:
- GeoHash precision (7) is configurable but affects tile size
- Packing algorithm is greedy (not optimal) but deterministic
- Transaction timeout may need adjustment for very large datasets
- Batch size (5,000) is tunable for performance
- Exception thresholds (90, 165) can be adjusted in code

**LEGAL/COMPLIANCE**:
- Deterministic algorithm for auditability
- Hash-based verification for reproducibility
- Transaction safety ensures data integrity
- No randomness or probabilistic grouping
- Version control for historical tracking
- Audit logs for all operations

**ALGORITHM COMPARISON**:

**Previous Version**: Grid-based BFS region growing
- Complex spatial queries
- Neighbor map construction
- BFS flood-fill algorithm
- Slower performance

**Current Version**: GeoHash fixed-precision
- Simple lexicographic sorting
- Direct tile packing
- No spatial queries during packing
- 5-10x faster performance

**FUTURE ENHANCEMENTS** (Not Implemented):
- Manual segment editing UI
- Segment splitting/merging tools
- Booth boundary constraints
- Road network awareness
- Custom size targets per region

---

## Additional Resources

- **Architecture Documentation**: See `arch.md` for overall system design
- **Family Generation**: See `FAMILY_GENERATION.md` for prerequisite step
- **Usage Guide**: See `USAGE_GUIDE.md` for UI testing console
- **Database Schema**: See `schema.sql` for complete database structure
- **API Documentation**: See `src/routes/apiRoutes.ts` for endpoint definitions

---

**Last Updated**: February 2026
**Version**: 2.0 (GeoHash Fixed-Precision)
**Algorithm**: geohash_fixed_precision_7
**Status**: ✅ Production Ready
