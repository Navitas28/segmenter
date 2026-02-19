# Segment Generation Framework — Grid-Based BFS Region Growing

## ECI Voter Segmentation System

**(Client Document – Functional Overview)**

---

## 1. Project Context

**System Name:** ECI Segmenter

**Objective:** Create geographically balanced operational segments for field-level election activities.

After voters are grouped into Families (Households), the system divides them into **Segments** — structured, manageable field units.

Each segment represents:

- A defined geographic area with **wall-to-wall spatial coverage**
- A manageable voter load (90–135 voters)
- A deployable operational unit for one field officer

This document describes the **Grid-Based BFS Region Growing** algorithm — an adaptive segmentation strategy that builds a square grid over the voter geography and grows contiguous regions using Breadth-First Search (BFS) flood-fill.

---

## 2. What is Segment Generation?

Segment Generation is the structured process of grouping Families (not individual voters) into geographically contiguous operational clusters.

These clusters are:

- Balanced in voter count
- Geographically compact and contiguous
- Deterministic and reproducible
- Legally defensible
- **Wall-to-wall** — every part of the geographic area is assigned to a segment with no gaps

---

## 3. Why Segmentation Is Required

Election operations require structured workload allocation.

**Without segmentation:**

- 3,000 voters across a city
- 1,200 family units
- No defined operational grouping

**With segmentation:**

- Segment SEG-001 – 115 voters – North Zone
- Segment SEG-002 – 142 voters – Central Zone
- Segment SEG-003 – 118 voters – South Zone
- ...

Each segment:

- Assigned to one officer
- Operated independently
- Mapped visually with complete area coverage
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
- **Adaptive** — grid cell size adjusts to voter density and geographic spread
- **Wall-to-wall coverage** — no geographic gaps between segments

---

## 5. Segmentation Logic Overview

The system uses a **Grid-Based BFS Region Growing** model.

### What is an Adaptive Square Grid?

Instead of using fixed-size tiles (like GeoHash), the system computes a **custom square grid** tailored to the specific geography and voter density of each area.

**How the grid size is calculated:**

1. Estimate the number of segments needed: `total_families × 2.65 / 125`
2. Target approximately **6 grid cells per segment**
3. Calculate raw cell size: `√(total_area / target_cells)`
4. Clamp the cell size between **50 meters and 2,000 meters**

This means:

- Dense urban areas → smaller cells (~50–200m)
- Sparse rural areas → larger cells (~500–2000m)
- The grid adapts automatically to the data

### What is BFS Region Growing?

BFS (Breadth-First Search) Region Growing is a spatial expansion algorithm:

1. Start from a **seed cell** (a grid cell containing voters)
2. Expand outward to **neighboring cells** (including diagonal neighbors)
3. Keep adding cells until the voter count reaches the **ideal target (~115)**
4. Never exceed the **absolute maximum (135)**
5. The result is a geographically contiguous cluster of cells — a **region** (future segment)

This guarantees that each segment is a **connected, compact geographic unit**.

---

## 6. Segmentation Workflow

The system follows a strict **8-step deterministic process**.

### Step 1 — Load Families (Atomic Units)

All families with GPS coordinates are loaded and grouped.

**Grouping logic:**

- **Primary:** Group by `family_id`
- **Fallback:** Group by address + floor number (hashed)
- **Last resort:** Individual voter as a unit

For each family:

- A **centroid** (center point) is computed from all member locations
- All voter IDs are collected
- Families are sorted by ID for deterministic ordering

Each family becomes an **atomic unit** — the smallest indivisible building block. No family is ever split.

### Step 2 — Compute Parent Boundary

A tight boundary polygon is computed around all family centroids.

**Method:** Concave Hull (`ST_ConcaveHull` at 0.98 target percent)

This creates a boundary that:

- Follows the actual distribution of voters (not a loose rectangle)
- Tightly wraps around the populated area
- Provides the total area (in m²) used to calculate grid cell size

**Example:**

```
Area = 2.4 km²
Shape = Tight concave polygon following voter clusters
```

### Step 3 — Build Adaptive Square Grid

A square grid is generated over the parent boundary.

**Grid Size Calculation:**

| Parameter          | Formula / Value                                     |
|--------------------|-----------------------------------------------------|
| Estimated Segments | `family_count × 2.65 / 125`                        |
| Cells Per Segment  | 6                                                   |
| Target Total Cells | `estimated_segments × 6`                            |
| Raw Cell Size      | `√(area_m² / max(target_cells, family_count × 0.5))`|
| Minimum Cell Size  | 50 meters                                           |
| Maximum Cell Size  | 2,000 meters                                        |

**Process:**

1. Calculate cell size in meters
2. Convert to degrees using: `meters_per_degree = 111,320 × cos(latitude)`
3. Generate square grid using PostGIS `ST_SquareGrid`
4. Filter: keep only cells that **intersect** the parent boundary
5. Index cells spatially for fast queries

**Example:**

```
1,547 families across 2.4 km²
→ Estimated segments: ~33
→ Target cells: ~198
→ Grid cell size: ~110 meters
→ Grid cells generated: ~220 (after boundary filtering)
```

### Step 4 — Assign Families to Grid Cells

Each family is assigned to the **nearest grid cell** based on its centroid.

**Method:** Spatial nearest-neighbor query (`ORDER BY geom <-> centroid LIMIT 1`)

**Result:**

| Cell   | Families | Voters |
|--------|----------|--------|
| Cell A | 5        | 14     |
| Cell B | 9        | 26     |
| Cell C | 3        | 8      |
| Cell D | 12       | 38     |

**Guarantees:**

- Each family belongs to exactly **one** cell
- No family is split across cells
- All families are assigned (validated — throws error if any are missing)

### Step 5 — Grow Regions (BFS Flood-Fill)

This is the core segmentation step. Cells are grouped into **regions** (future segments) using BFS expansion.

**Segment Size Rules:**

| Constraint     | Value       |
|----------------|-------------|
| Absolute Min   | 90 voters   |
| Target Min     | 100 voters  |
| Target Ideal   | ~115 voters |
| Target Max     | 130 voters  |
| Absolute Max   | 135 voters  |

**Algorithm:**

1. Build **adjacency graph** — find all neighboring cells (including diagonal neighbors)
2. Sort all populated cells **deterministically** (north → south, west → east)
3. Separate oversized cells (>135 voters) — these become standalone regions
4. For each unassigned normal cell (the **seed**):
   - Initialize a new region with the seed cell
   - **BFS expand:** examine neighbors in deterministic order (north → south, west → east, then by cell ID)
   - Add neighbor to region if it won't exceed 135 voters
   - Stop expanding when voter count reaches **115** (ideal target)
   - Mark all added cells as assigned
5. Repeat until all populated cells are assigned

**Result:** A set of geographically contiguous regions, each containing ~90–135 voters.

### Step 6 — Merge Undersized Regions + Fill Empty Cells

**Merge Undersized Regions:**

Regions with fewer than 90 voters are merged into adjacent regions.

- Choose the neighbor that **minimizes overflow** beyond the target maximum (130)
- Deterministic tie-break: smallest region ID
- If no suitable neighbor exists, the region remains flagged for manual review

**Fill Empty Cells (Wall-to-Wall Coverage):**

After region growing, some grid cells may be unpopulated (no voters). These are iteratively assigned to the nearest region:

1. Find empty cells adjacent to existing regions
2. Assign each to the nearest region (by distance to seed cell centroid)
3. Repeat until no adjacent empty cells remain

This ensures **complete geographic coverage** — no gaps between segments on the map.

### Step 7 — Build Segment Geometries

For each region:

1. Collect all grid cell geometries belonging to the region
2. **Union** them into a single polygon: `ST_UnaryUnion(ST_Collect(cell geometries))`
3. **Clean** the geometry: `ST_Buffer(geometry, 0)` to remove self-intersections
4. Compute the **centroid** (center point)
5. Extract and sort all voter IDs deterministically

**Result:**

Each segment is a contiguous polygon (or MultiPolygon in rare cases) ready for map visualization.

If a region produces a non-contiguous MultiPolygon (more than one disconnected part), it is flagged with a warning for review.

### Step 8 — Validation & Deterministic Hash

Before committing to the database, the system validates:

**Pre-Commit Validation:**

- No empty segments (0 voters)
- Total assigned voters = expected total
- No voter assigned to multiple segments

**Post-Commit Validation:**

- All families in scope assigned to a segment
- No overlapping segment geometries
- All geometries are valid (`ST_IsValid`)
- No empty geometries (`ST_IsEmpty`)

**Deterministic Hash:**

A run hash is generated: `md5(all family_ids sorted and concatenated)`

Same data → Same hash → Same segments.

If any validation fails, the **entire transaction is rolled back** — no partial data is ever written.

---

## 7. Visual Representation

### Map View (Conceptual)

```
 ┌───────────────────────────────────────┐
 │  ┌───┬───┬───┐                        │
 │  │   │ ● │ ● │  Segment SEG-001       │
 │  │   │   │   │  (Blue, ~115 voters)   │
 │  ├───┼───┼───┤                        │
 │  │ ● │ ● │   │  Segment SEG-002       │
 │  │   │   │   │  (Green, ~118 voters)  │
 │  ├───┼───┼───┼───┐                    │
 │  │ ● │   │ ● │ ● │  Segment SEG-003   │
 │  │   │   │   │   │  (Red, ~142 voters) │
 │  └───┴───┴───┴───┘                    │
 └───────────────────────────────────────┘

 ● = Grid cell with voters
 Each small square = One grid cell
 Each colored region = One segment (cluster of cells)
 Empty cells within boundary = filled into nearest segment
```

**Key visual properties:**

- Segments **do not overlap**
- Segments provide **wall-to-wall coverage** (no gaps)
- Each segment is a **contiguous region** of grid cells
- Segments contain balanced voter counts
- Grid cell sizes adapt to the geographic area

---

## 8. Production Results (Real Data Example)

**Input:**

- 3,929 voters
- 1,547 families

**Output:**

- 32 segments
- Average segment size: ~122.78 voters
- Range: 90–135 voters
- Grid cell size: ~110 meters (adaptive)
- Grid cells generated: ~220

**Processing Time: ~12 seconds**

| Phase                  | Duration    |
|------------------------|-------------|
| Algorithm execution    | ~3 seconds  |
| Database operations    | ~6 seconds  |
| Validation             | ~3 seconds  |

**Algorithm Execution Breakdown:**

| Step                       | Time       |
|----------------------------|------------|
| Load families              | ~0.5 sec   |
| Compute boundary           | ~0.3 sec   |
| Build adaptive grid        | ~0.4 sec   |
| Assign families to cells   | ~0.5 sec   |
| Grow regions (BFS)         | ~0.5 sec   |
| Merge + fill empty cells   | ~0.3 sec   |
| Build geometries           | ~0.5 sec   |

---

## 9. Deterministic & Legal Compliance Model

The system guarantees:

- **Same dataset → identical segments** every time
- Reproducible via **run hash** (`md5` of sorted family assignments)
- Single **atomic transaction** — all or nothing
- Complete **rollback on failure** — no partial data
- Version-controlled runs

**Determinism is enforced at every step:**

| Step                  | Ordering Guarantee                              |
|-----------------------|-------------------------------------------------|
| Family loading        | Sorted by `unit_id`                             |
| Grid cells            | Sorted by latitude (DESC), longitude (ASC)      |
| Cell assignment       | Sorted by latitude (DESC), longitude (ASC)      |
| BFS seed selection    | Sorted by latitude (DESC), longitude (ASC)      |
| BFS neighbor expansion| Sorted by latitude (DESC), longitude (ASC), then cell ID |
| Undersized merge      | Smallest region ID as tie-break                 |
| Voter ID extraction   | Sorted alphabetically                           |

This ensures:

- Legal auditability
- Election defensibility
- Transparent segmentation

---

## 10. Exception Handling

In rare cases:

### Oversized Segment

If a single grid cell contains more than 135 voters (large indivisible family clusters):

- The cell becomes a **standalone segment**
- Marked as **exception** in metadata
- Flagged for **manual review**
- Exception type: `oversized`
- Reason: "Contains large indivisible families that exceed segment size limit"

### Undersized Segment

If a sparse area produces a region with fewer than 90 voters:

- The system **first attempts to merge** it into an adjacent region
- Chooses the neighbor that minimizes overflow beyond the target maximum
- If merge is not possible (no adjacent regions), the region remains as-is
- Marked as **exception** in metadata
- Flagged for **manual review**
- Exception type: `undersized`
- Reason: "Insufficient voters in grid region"

### Non-Contiguous Geometry

If BFS expansion produces a segment with disconnected parts:

- Detected when `ST_GeometryType = MultiPolygon` with more than one geometry
- Logged as a **warning**
- Typically caused by adjacency gaps in the grid
- Flagged for review

All exceptions are recorded in segment metadata with `requires_manual_review: true`.

---

## 11. Integration With Family Generation

Segmentation operates strictly on:

- **Families** (atomic units)
- **NOT** individual voters

This guarantees:

- No family is split
- Household integrity maintained
- Operational consistency

**Family Generation is mandatory before segmentation.**

The algorithm groups voters by:

1. `family_id` (primary)
2. Address + floor number hash (fallback)
3. Individual voter ID (last resort)

---

## 12. Scalability

| Voters    | Expected Time  |
|-----------|----------------|
| 1,000     | < 5 sec        |
| 10,000    | < 15 sec       |
| 50,000    | < 60 sec       |
| 200,000+  | < 2 minutes    |

The adaptive grid ensures performance scales well:

- Small areas → fewer, smaller cells → fast processing
- Large areas → appropriately sized cells → manageable computation
- BFS flood-fill is linear in the number of cells
- Database operations are chunked (5,000 records per batch)

Designed for district and state-level deployments.

---

## 13. How Grid-Based Differs From GeoHash-Based Segmentation

Both algorithms produce the same output format (segments with geometries, family assignments, deterministic hashes) but differ in approach:

| Aspect                | Grid-Based (BFS Region Growing)                | GeoHash (Fixed Precision)          |
|-----------------------|-------------------------------------------------|------------------------------------|
| Spatial structure     | Adaptive square grid (50m–2000m cells)          | Fixed GeoHash tiles (~152m × 152m) |
| Cell size             | Calculated from area and voter density           | Fixed at precision 7               |
| Segmentation method   | BFS flood-fill (spatial expansion)               | Sequential lexicographic packing   |
| Boundary              | Concave hull computed first                      | Implicit from GeoHash tiles        |
| Geographic coverage   | Wall-to-wall (empty cells filled)                | Only populated tiles               |
| Contiguity            | Guaranteed by BFS adjacency                      | Approximate via GeoHash ordering   |
| Undersized handling   | Merged into adjacent regions                     | May remain undersized              |
| Oversized handling    | Standalone regions, flagged                      | Forced into segments               |
| Determinism           | Spatial sorting (lat/lng)                        | Lexicographic GeoHash sorting      |

---

## 14. Executive Summary

The Grid-Based Segment Generation Engine:

- Converts families into balanced operational units
- Uses an **adaptive square grid** that adjusts to voter density
- Employs **BFS flood-fill** for geographically contiguous region growing
- Ensures balanced voter distribution (90–135 voters per segment)
- Maintains family integrity — no family is ever split
- Produces **non-overlapping, wall-to-wall map-ready polygons**
- Provides **complete geographic coverage** with no gaps
- Is **100% deterministic** — same input always produces same output
- Is **audit-verifiable** via deterministic hashing
- Handles exceptions (oversized/undersized) with flagging for manual review
- Scales to large datasets across district and state-level deployments
- Runs within a single **atomic database transaction** with full rollback on failure

It transforms raw voter geography into deployable, field-ready operational segments with complete spatial coverage.
