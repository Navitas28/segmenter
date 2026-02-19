# Segment Generation Framework — GeoHash Fixed Precision

## ECI Voter Segmentation System

**(Client Document – Functional Overview)**

---

## 1. Project Context

**System Name:** ECI Segmenter

**Objective:** Create geographically balanced operational segments for field-level election activities.

After voters are grouped into Families (Households), the system divides them into **Segments** — structured, manageable field units.

Each segment represents:

- A defined geographic area
- A manageable voter load (90–135 voters)
- A deployable operational unit for one field officer

This document describes the **GeoHash Fixed Precision** algorithm — a segmentation strategy that converts GPS coordinates into GeoHash strings and packs nearby tiles into balanced segments using a deterministic greedy model.

---

## 2. What is Segment Generation?

Segment Generation is the structured process of grouping Families (not individual voters) into geographically contiguous operational clusters.

These clusters are:

- Balanced in voter count
- Geographically compact
- Deterministic and reproducible
- Legally defensible

---

## 3. Why Segmentation Is Required

Election operations require structured workload allocation.

**Without segmentation:**

- 3,000 voters across a city
- 1,200 family units
- No defined operational grouping

**With segmentation:**

- Segment 001 – 125 voters – North Zone
- Segment 002 – 112 voters – Central Zone
- Segment 003 – 118 voters – South Zone
- ...

Each segment:

- Assigned to one officer
- Operated independently
- Mapped visually
- Audit-verifiable

---

## 4. Core Design Principles

- **Deterministic** (same input → same output)
- No randomness
- No probabilistic clustering
- Families never split
- Fully auditable
- Transaction safe
- Scalable to 200,000,000+ voters
- **Simple and fast** — no boundary computation, no grid construction, no spatial graph traversal

---

## 5. Segmentation Logic Overview

The system uses a **GeoHash-Based Fixed Precision Model** at precision level 7.

### What is GeoHash?

GeoHash is a public-domain geocoding system that converts GPS coordinates (latitude, longitude) into short alphanumeric strings. Nearby locations share similar prefixes.

**Example:**

```
Location A → ttnxr5m
Location B → ttnxr5q   (nearby — shares 6-char prefix "ttnxr5")
Location C → ttnw2gk   (far away — prefix diverges at character 4)
```

**At 7-character precision:**

- Each GeoHash tile ≈ **152m x 152m**
- Represents a small geographic block
- Tiles with shared prefixes are geographically adjacent

### How Does GeoHash Segmentation Work?

1. Every family's GPS coordinates are converted to a 7-character GeoHash
2. Families sharing the same GeoHash form a **tile**
3. Tiles are **sorted lexicographically** (alphabetically) — this naturally groups nearby tiles together
4. Tiles are **packed sequentially** into segments using a greedy algorithm until each segment reaches the target voter count

Because GeoHash strings encode spatial proximity in their character ordering, lexicographic sorting produces a geographic sweep across the area — tiles that appear next to each other in the sorted order are also next to each other on the map.

---

## 6. Segmentation Workflow

The system follows a strict **6-step deterministic process**.

### Step 1 — Load Families with GeoHash

All families with GPS coordinates are loaded from the database.

For each family:

- A **7-character GeoHash** is computed from its latitude and longitude using PostGIS `ST_GeoHash(point, 7)`
- The family's voter count (`member_count`) is retrieved
- Families are **sorted lexicographically** by GeoHash for deterministic ordering

**Example output:**

| Family ID | Voters | Latitude  | Longitude | GeoHash   |
|-----------|--------|-----------|-----------|-----------|
| F001      | 3      | 12.9716   | 77.5946   | tdr1y5m   |
| F002      | 5      | 12.9718   | 77.5948   | tdr1y5m   |
| F003      | 2      | 12.9745   | 77.5980   | tdr1y5q   |
| F004      | 4      | 12.9801   | 77.6012   | tdr1y6k   |
| F005      | 6      | 13.0102   | 77.6250   | tdr3b2p   |

Families F001 and F002 share the same GeoHash (`tdr1y5m`) — they are in the same tile.

### Step 2 — Create GeoHash Tiles

Families sharing the same 7-character GeoHash are grouped into **tiles**.

Each tile is a building block for segments.

**Example:**

| Tile (GeoHash) | Families | Total Voters |
|----------------|----------|--------------|
| tdr1y5m        | 5        | 14           |
| tdr1y5q        | 9        | 26           |
| tdr1y6k        | 3        | 8            |
| tdr3b2p        | 7        | 22           |

Tiles are sorted lexicographically by their GeoHash string. Because GeoHash encodes spatial proximity, this ordering naturally clusters geographically adjacent tiles together.

### Step 3 — Pack Tiles into Segments

Tiles are packed sequentially using a **deterministic greedy model**.

**Segment Size Rules:**

| Constraint   | Value       |
|--------------|-------------|
| Minimum      | 90 voters   |
| Ideal        | ~115 voters |
| Maximum      | 135 voters  |

**Packing Algorithm:**

1. Start a new segment
2. Iterate through unassigned tiles in lexicographic order
3. For each tile:
   - If adding it would **not exceed** the maximum (135): **pack it** into the current segment
   - If adding it **would exceed** the maximum: **skip it** (try the next tile)
4. Once the segment reaches the **ideal target** (~115 voters): **close** the segment
5. If no tile can be added (all remaining tiles would exceed the maximum): **force** the next tile into a new segment (creates an oversized exception)
6. Begin next segment
7. Repeat until all tiles are assigned

**Families are never split.** The entire tile (all its families) is always packed as a unit.

**Example packing trace:**

```
Segment 001:
  + tdr1y5m (14 voters) → running total: 14
  + tdr1y5q (26 voters) → running total: 40
  + tdr1y6k  (8 voters) → running total: 48
  + tdr1y6p (22 voters) → running total: 70
  + tdr1y7a (18 voters) → running total: 88
  + tdr1y7c (28 voters) → running total: 116 ✓ reached ideal → CLOSE

Segment 002:
  + tdr3b2p (22 voters) → running total: 22
  + tdr3b2r (31 voters) → running total: 53
  ...
```

### Step 4 — Create Geographic Polygons

For each segment:

1. Each GeoHash tile string is converted to a polygon using PostGIS `ST_GeomFromGeoHash`
2. All tile polygons are **collected and unioned**: `ST_UnaryUnion(ST_Collect(tile_polygons))`
3. The result is stored as a `MultiPolygon` geometry
4. A **centroid** (center point) is computed: `ST_Centroid(union)`
5. Latitude and longitude of the centroid are extracted

**Result:**

Each segment has:

- A **geometry** — the union of its GeoHash tile bounding boxes
- A **boundary** — same as geometry (the full extent of tile boxes)
- A **centroid** — the center point (lat/lng)

Each segment is a geographic unit ready for map visualization.

### Step 5 — Assign Families to Segments

A structured mapping table links:

**Segment → Family**

For each segment, all families belonging to its tiles are recorded as **segment members** in the database.

| Segment   | Family ID | Manual Override |
|-----------|-----------|-----------------|
| SEG-001   | F001      | No              |
| SEG-001   | F002      | No              |
| SEG-001   | F003      | No              |
| SEG-002   | F004      | No              |
| SEG-002   | F005      | No              |

This ensures:

- Traceability
- Accountability
- No duplicate assignment
- Family-level (not voter-level) membership

Records are inserted in chunks of 5,000 for performance.

### Step 6 — Validation & Deterministic Hash

Before the transaction is committed, the system validates:

**Post-Insert Validation:**

- **All families assigned** — every family in scope belongs to exactly one segment
- **No overlapping geometry** — no two segments have overlapping interior geometry (`ST_Overlaps`)
- **Valid geometries** — all segment geometries pass `ST_IsValid`
- **No empty geometries** — no segment has an empty polygon (`ST_IsEmpty`)

**Deterministic Hash:**

A run hash is generated:

```
md5(all family_ids sorted and concatenated)
```

Same data → Same hash → Same segments.

If any validation fails, the **entire transaction is rolled back** — no partial data is ever written.

---

## 7. Visual Representation

### Map View (Conceptual)

```
 ┌─────────────────────────────┐
 │  Segment 001 (Blue)         │
 │  ██ ██ ██ ██                │
 │                             │
 │        Segment 002 (Green)  │
 │        ██ ██ ██ ██ ██       │
 │                             │
 │  Segment 003 (Red)          │
 │  ██ ██                      │
 └─────────────────────────────┘

 Each small block = One GeoHash tile (~152m x 152m)
 Each colored region = One segment (group of tiles)
```

**Key visual properties:**

- Segments **do not overlap**
- Each segment is a cluster of GeoHash tiles
- Tile bounding boxes form the segment polygon
- Segments contain balanced voter counts
- Coverage follows populated tiles only (unpopulated areas have no tiles)

---

## 8. Production Results (Real Data Example)

**Input:**

- 3,929 voters
- 1,547 families

**Output:**

- 32 segments
- Average segment size: ~122.78 voters
- Range: 90–135 voters
- GeoHash precision: 7 (tile size ≈ 152m x 152m)

**Processing Time: ~12 seconds**

| Phase                  | Duration    |
|------------------------|-------------|
| Algorithm execution    | ~3 seconds  |
| Database operations    | ~6 seconds  |
| Validation             | ~3 seconds  |

**Algorithm Execution Breakdown:**

| Step                          | Time       |
|-------------------------------|------------|
| Fetch families with GeoHash   | ~1.0 sec   |
| Create tiles + pack segments  | ~0.5 sec   |
| Insert segments with geometry | ~1.0 sec   |
| Insert segment members        | ~0.5 sec   |

---

## 9. Deterministic & Legal Compliance Model

The system guarantees:

- **Same dataset → identical segments** every time
- Reproducible via **run hash** (`md5` of sorted family assignments)
- Single **atomic transaction** — all or nothing
- Complete **rollback on failure** — no partial data
- Version-controlled runs

**Determinism is enforced at every step:**

| Step                     | Ordering Guarantee                                |
|--------------------------|---------------------------------------------------|
| Family loading           | Sorted by 7-char GeoHash (lexicographic ASC)      |
| Tile creation            | Grouped by exact GeoHash, sorted lexicographically |
| Tile packing             | Sequential greedy over lexicographic tile order     |
| Segment code assignment  | Sequential numbering (001, 002, 003, ...)          |
| Family-to-segment mapping| Preserves tile membership order                    |
| Run hash                 | `md5(family_ids sorted by family_id)`              |

This ensures:

- Legal auditability
- Election defensibility
- Transparent segmentation

---

## 10. Exception Handling

In rare cases:

### Oversized Segment

If a tile (or group of small tiles) cannot fit within the 135-voter maximum:

- The tile is **forced** into its own segment
- Marked as **exception** in metadata
- Flagged for **manual review**
- Exception type: `oversized`
- Reason: "Contains large indivisible families that exceed segment size limit"

This happens when a single GeoHash tile contains a dense cluster of families whose combined voter count exceeds 135.

### Undersized Segment

If the remaining tiles in a sparse area produce a segment with fewer than 90 voters:

- The segment is still created (tiles are exhausted)
- Marked as **exception** in metadata
- Flagged for **manual review**
- Exception type: `undersized`
- Reason: "Insufficient voters in GeoHash region"

This typically occurs at the tail end of the packing process when few tiles remain.

All exceptions are recorded in segment metadata with `requires_manual_review: true`.

---

## 11. Integration With Family Generation

Segmentation operates strictly on:

- **Families**
- **NOT** individual voters

This guarantees:

- No family is split
- Household integrity maintained
- Operational consistency

**Family Generation is mandatory before segmentation.**

The algorithm loads families directly from the `families` table with their pre-computed latitude, longitude, and `member_count`. Each family is an atomic, indivisible unit throughout the entire process.

---

## 12. Scalability

| Voters    | Expected Time  |
|-----------|----------------|
| 1,000     | < 5 sec        |
| 10,000    | < 15 sec       |
| 50,000    | < 60 sec       |
| 200,000+  | < 2 minutes    |

The GeoHash approach is inherently fast:

- **No spatial graph construction** — no adjacency maps or BFS traversal
- **No boundary computation** — no concave hull calculation
- **No grid generation** — GeoHash strings serve as the spatial index
- **O(n) packing** — single pass through sorted tiles
- Database operations are chunked (5,000 records per batch)

Designed for district and state-level deployments.

---

## 13. How GeoHash-Based Differs From Grid-Based Segmentation

Both algorithms produce the same output format (segments with geometries, family assignments, deterministic hashes) but differ in approach:

| Aspect                | GeoHash (Fixed Precision)                   | Grid-Based (BFS Region Growing)                |
|-----------------------|---------------------------------------------|-------------------------------------------------|
| Spatial structure     | Fixed GeoHash tiles (~152m x 152m)          | Adaptive square grid (50m–2000m cells)          |
| Tile/cell size        | Fixed at precision 7                         | Calculated from area and voter density           |
| Segmentation method   | Sequential lexicographic greedy packing      | BFS flood-fill (spatial expansion)               |
| Boundary              | Implicit from GeoHash tiles                  | Concave hull computed first                      |
| Geographic coverage   | Only populated tiles                         | Wall-to-wall (empty cells filled)                |
| Contiguity            | Approximate via lexicographic ordering       | Guaranteed by BFS adjacency                      |
| Undersized handling   | Remains as-is, flagged                       | Merged into adjacent regions                     |
| Oversized threshold   | 135 voters                                   | 135 voters                                       |
| Ideal target          | 115 voters                                   | 115 voters                                       |
| Determinism           | Lexicographic GeoHash sorting                | Spatial sorting (lat/lng)                        |
| Complexity            | Single-file, single-pass algorithm           | Multi-step with adjacency graph and BFS          |
| Speed                 | Faster (no spatial queries during packing)   | Slightly slower (BFS + neighbor queries)         |

---

## 14. Executive Summary

The GeoHash Segment Generation Engine:

- Converts families into balanced operational units
- Uses **GeoHash precision 7** (~152m x 152m tiles) for geographic clustering
- Employs **deterministic greedy packing** over lexicographically sorted tiles
- Ensures balanced voter distribution (90–135 voters per segment)
- Maintains family integrity — no family is ever split
- Produces **non-overlapping map-ready polygons** from GeoHash tile unions
- Is **100% deterministic** — same input always produces same output
- Is **audit-verifiable** via deterministic hashing
- Handles exceptions (oversized/undersized) with flagging for manual review
- Scales to large datasets across district and state-level deployments
- Runs within a single **atomic database transaction** with full rollback on failure
- Is the **simplest and fastest** segmentation strategy — no spatial graph, no boundary computation, no BFS traversal

It transforms raw voter geography into deployable, field-ready operational segments using the natural spatial ordering of GeoHash strings.
