## 📘 Election Segmentation Engine — Internal Architecture Document

## 1. Purpose of the System

The Segmentation Engine is designed to:

* Divide voters within an AC or Booth into operational segments
* Maintain family atomicity (never split families)
* Be 100% deterministic
* Be legally defensible
* Be repeatable
* Be versioned
* Be auditable
* Be scalable

This system is NOT a spatial clustering engine.
It is a deterministic workload partitioning system.

---

# 2. Core Principles

The system is built on 6 strict principles:

1. Determinism — Same input always produces same output
2. Family Integrity — No family split across segments
3. Boundary Safety — No cross-AC segmentation
4. Version Control — Each run creates a version
5. Auditability — Every run produces hashes and audit logs
6. No Randomness — No probabilistic clustering

---

# 3. Segmentation Scope

Segmentation can run on:

* Assembly Constituency (AC)
* Booth

Scope detection is based on `hierarchy_nodes`.

If AC:

* All booths under that AC are fetched
* All voters from those booths are included

If Booth:

* Only voters from that booth are included

Cross-AC segmentation is strictly blocked.

---

# 4. Data Flow

### Step 1: Job Trigger

User creates `segmentation_jobs` entry with:

```
job_type = 'auto_segment'
status = 'queued'
node_id = selected scope
```

System picks job using:

```
FOR UPDATE SKIP LOCKED
```

This prevents concurrent processing.

---

### Step 2: Transaction Start

Segmentation runs inside:

```
BEGIN ISOLATION LEVEL REPEATABLE READ
```

This guarantees consistent reads.

---

### Step 3: Fetch Voters

Voters are fetched based on scope.

Coordinates are validated.

Memory guard prevents >300k voters in one run.

---

# 5. Family Grouping

Primary grouping key:

```
family_id
```

If `family_id` is NULL:

Fallback grouping:

```
normalized(house_number + address)
```

Families are treated as atomic units.

If any family size > 150:
Segmentation fails.

---

# 6. Spatial Ordering (Grid-Based Deterministic Sorting)

Problem solved:
Simple lat/long sorting causes scanline artifacts.

Solution:
Grid-based spatial indexing.

Grid size:

```
GRID_SIZE = 0.002 degrees (~200 meters)
```

Each family is assigned:

```
gridY = floor(latitude / GRID_SIZE)
gridX = floor(longitude / GRID_SIZE)
```

Sorting order:

1. gridY ASC
2. gridX ASC
3. latitude ASC
4. longitude ASC
5. family_id ASC

This produces compact geographic ordering.

This is deterministic.
No randomness.
No clustering algorithm.

---

# 7. Segment Packing Algorithm

Parameters:

```
TARGET = 120
MAX = 150
MIN = 80
```

Greedy packing:

For each family in sorted order:

```
if current_segment.total + family.total <= MAX:
    add family
else:
    finalize segment
    start new
```

After all families processed:

If last segment < MIN:
Attempt merge with previous if <= MAX.

If cannot merge:
Mark exception.

This is deterministic greedy partitioning.

---

# 8. Versioning Logic

For each node:

```
SELECT MAX(version) FOR UPDATE
new_version = max + 1
```

Existing draft segments are deleted.
New segments inserted with version number.

Unique constraint:

```
(node_id, version, segment_code)
```

Segment codes:

```
SEG-001
SEG-002
SEG-003
```

Zero-padded deterministic numbering.

---

# 9. Geometry Generation

For each segment:

Centroid:

```
Mean(latitude), Mean(longitude)
```

Boundary:
Concave hull of voter coordinates.

If voters < 3:
Create minimal bounding polygon.

Geometry inserted using:

```
ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)
```

This is for visualization only.
Geometry does NOT influence segmentation logic.

---

# 10. Determinism Hashing

For each segment:

```
segment_hash = SHA256(
    node_id +
    version +
    segment_code +
    sorted_voter_ids
)
```

For entire run:

```
run_hash = SHA256(sorted_segment_hashes)
```

Stored in:

```
segmentation_jobs.result
```

This guarantees reproducibility.

---

# 11. Validation Before Commit

Before transaction commit:

* No segment > 150 voters
* No empty segment
* Total assigned voters == fetched voters
* No duplicate voter assignments
* AC boundary integrity confirmed

If any check fails:
Transaction rollback.

---

# 12. Visualization Architecture

Visualization is NOT segmentation.

It is a presentation layer.

We use 4 modes:

---

## Operational Mode (Default)

* Only centroids shown
* No voters shown
* Clean overview

---

## Responsibility Mode

* Selected segment voters shown
* Other segments hidden or faded
* Optional light boundary

---

## Comparison Mode

* Two versions displayed
* Solid vs dashed boundary
* Diff metrics panel

---

## Debug Mode

* Full geometry
* Convex hull
* Hash display
* Raw GeoJSON
* Diagnostic overlays

---

# 13. Why Segments May Appear Visually Overlapping

Segments are not territorial partitions.

They are workload clusters.

Clusters may:

* Touch
* Interleave slightly
* Share proximity

But voters never overlap logically.

Overlap in visualization ≠ overlap in membership.

---

# 14. Why We Did NOT Use Clustering Algorithms

We intentionally avoided:

* K-means
* DBSCAN
* Voronoi partitioning

Because they:

* Introduce non-determinism
* Are sensitive to parameter tuning
* Harder to defend legally
* Harder to reproduce exactly

Our system is:

Simple
Deterministic
Auditable
Legally defensible

---

# 15. System Guarantees

The system guarantees:

* Every voter belongs to exactly one segment
* No family split
* No AC crossing
* Same input → same output
* Version traceability
* Hash verifiability
* Transaction safety

---

# 16. Known Design Trade-offs

Trade-off accepted:

Segments are geographically compact but not mathematically optimal clusters.

Reason:
Operational simplicity > clustering perfection.

---

# 17. When To Change Algorithm

Only change algorithm if:

* Family atomicity rule changes
* Target size rule changes
* Legal requirement changes
* Booth reassignment phase added

Otherwise:
Core engine should remain stable.

---

# 18. Summary

This segmentation engine is:

Deterministic workload partitioning
with spatial ordering
with family atomicity
with version control
with auditability
with hash reproducibility
with AC boundary safety

It is NOT a GIS zoning engine.
