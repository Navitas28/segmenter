# ECI Segmenter

This repository contains the segmentation engine used to divide a selected election scope into operational segments.

The primary strategy documented here is the current `grid-based` strategy, with atomic units built from the `families` table when `ENABLE_GRID_ATOMIC_UNITS_FROM_FAMILIES=true`.

## Strategy Summary

The grid-based algorithm works on indivisible atomic units, not on individual voters directly.

In the current recommended flow:

- one atomic unit = one family
- family geometry comes from `families.latitude` and `families.longitude`
- family size comes from `families.member_count`
- family members are fetched from `voters.family_id = families.id`
- only families with family-level coordinates are eligible in this mode

This keeps the household together during segmentation and avoids depending on every voter row having its own coordinate.

## Important Flags

- `SEGMENTATION_STRATEGY=grid-based`
- `ENABLE_GRID_ATOMIC_UNITS_FROM_FAMILIES=true`
- `ENABLE_PRE_SEGMENTATION_CHECKS=true`
- `ENABLE_BOOTH_SEGMENT_GRID_DEBUG=true`

## End-to-End Flow

### 1. Resolve scope

The engine starts in `src/segmentation/grid-based/gridEngine.ts`.

It first resolves the requested node into the actual booth scope to segment:

- if the node is a booth, that single booth is used
- if the node is an AC or larger scope, all relevant booth IDs are collected
- voters are then fetched only for those booths and the selected election

This guarantees the rest of the pipeline only works on the requested area.

### 2. Run pre-segmentation checks

When enabled, the engine performs data integrity checks before any geometry is created.

These checks are used to catch:

- voters without locations in the voter-based flow
- family table and voter table count mismatches
- phantom families
- missing family coordinates when the family-based atomic-unit flow is enabled

The purpose is to fail early instead of silently producing weak segments from incomplete input.

### 3. Build atomic units

Atomic units are built in `src/segmentation/grid-based/atomicUnitBuilder.ts`.

There are two supported modes:

#### Families mode

Used when `ENABLE_GRID_ATOMIC_UNITS_FROM_FAMILIES=true`.

For each eligible family:

- `families.id` becomes the atomic unit ID
- `families.member_count` becomes the atomic unit voter count
- `ST_MakePoint(families.longitude, families.latitude)` becomes the atomic unit centroid
- all voters belonging to that family are collected from the `voters` table

Only families that have:

- matching `election_id`
- matching `booth_id`
- `member_count > 0`
- non-null `latitude`
- non-null `longitude`

are included.

This means:

- voter lat/lng is not required in this mode
- the whole family is treated as one indivisible geographic object

#### Voters mode

Used when the family mode flag is off.

In that path:

- voters are grouped by `family_id`
- only voters with non-null `location` are considered
- the family centroid is derived from voter locations using `ST_Centroid(ST_Collect(location))`

### 4. Compute the parent boundary

Once atomic units exist, the algorithm builds a working boundary around them in `src/segmentation/grid-based/parentBoundary.ts`.

It collects all atomic-unit centroids and creates a concave hull. This gives the populated working shape for the current run.

This boundary is used to:

- estimate area
- build the adaptive grid
- limit grid cells to the relevant geography

### 5. Build the adaptive grid

The grid is created in `src/segmentation/grid-based/gridBuilder.ts`.

The algorithm does not use a fixed tile size for every geography. Instead it estimates an appropriate square cell size for the current run using:

- estimated segment count
- total working area
- a target number of cells per segment

The result is:

- smaller cells in dense areas
- larger cells in sparse areas
- fewer unnecessary cells outside the occupied geography

The grid is stored in a temporary PostGIS table and clipped to the parent boundary.

### 6. Assign atomic units to grid cells

Atomic units are assigned in `src/segmentation/grid-based/cellAssigner.ts`.

Each unit is assigned to its nearest grid cell using a nearest-geometry query.

After assignment, each populated cell has:

- a `cell_id`
- a set of `unit_ids`
- a total `voter_count`
- a cell centroid

This is the bridge between family-level data and region-level growth.

### 7. Build the cell adjacency graph

Before region growth starts, the engine builds a neighbor map in `src/segmentation/grid-based/regionGrower.ts`.

Cells are considered neighbors if they touch closely enough in the temporary grid table. Diagonal adjacency is included.

This adjacency graph is what allows regions to grow as contiguous shapes.

### 8. Create seed cells

The populated cells are sorted deterministically:

- north to south
- then west to east
- then by stable identifiers where needed

The next unassigned populated cell becomes the seed of a new region.

This makes the algorithm reproducible. The same input should produce the same initial seeds and the same growth order.

### 9. Grow initial regions with BFS

Initial region formation happens in `src/segmentation/grid-based/regionGrower.ts`.

For each seed cell, the algorithm runs deterministic BFS region growth:

- start with the seed cell
- inspect neighboring populated cells
- add legal neighbors in deterministic order
- stop once the region reaches the ideal size band
- never let a normal region exceed the absolute maximum

The current thresholds are:

- target minimum: `100`
- target ideal: `115`
- target maximum: `130`
- absolute minimum: `90`
- absolute maximum: `135`

If a single populated cell already exceeds `135`, it becomes a standalone oversized exception region and is flagged for manual review.

### 10. Merge easy undersized regions

After BFS, some regions may still be below `90`.

The first repair pass tries the simplest valid action:

- merge the whole undersized region into one adjacent region
- only do it if the combined result stays within `135`
- prefer merges that keep the result closer to the target band
- use spatial closeness as a tie-breaker

This fixes the easy tail cases quickly.

### 11. Geospatial rebalance

If a region is still undersized, the next pass rebalances it by transferring a populated boundary cell from a neighbor.

This pass is geospatial and constrained:

- the transferred cell must be adjacent to the undersized region
- the donor region must remain connected after removal
- the donor region must not fall below `90`
- the receiving region must not exceed `135`
- among legal options, cells closer to the target region are preferred

This is better than simple count-based repair because it adjusts the boundary using nearby geography rather than arbitrary redistribution.

### 12. Global compression

After rebalance, the algorithm runs a stronger compression pass.

This pass tries to reduce the total number of regions by eliminating small or inefficient regions entirely.

It works by:

- selecting candidate source regions
- examining removable populated boundary cells
- moving those cells into adjacent target regions
- checking size limits on every move
- preserving source-region connectivity while cells are removed
- using spatial closeness and capacity fit to score the move

This allows a region to be dissolved across multiple nearby neighbors if that produces fewer legal final segments.

This is the main improvement over a simple greedy merge algorithm.

### 13. Fill empty cells for wall-to-wall coverage

Once populated cells are settled, the algorithm fills any remaining empty grid cells.

These empty cells:

- do not add voters
- do not add families
- do affect final region geometry

This step makes the final segments wall-to-wall, so the map has no visual gaps between operational regions.

### 14. Build final segment geometries

The final segment build happens in `src/segmentation/grid-based/segmentBuilder.ts`.

For each region, the algorithm:

- unions the cell geometries
- cleans geometry where needed
- computes centroids
- attaches the final `unit_ids`
- attaches the final `voter_ids`

At this stage the region becomes a persisted segment candidate.

### 15. Validate

Validation is performed in `src/segmentation/grid-based/segmentValidator.ts` and again after database insert.

The checks include:

- no empty segments
- no duplicate voter assignment
- assigned voter count matches expectation
- geometry validity
- no overlapping segment geometry
- no empty polygons
- warning or exception tracking for undersized and oversized results

### 16. Persist and return

Finally, the engine:

- deletes old draft segments for the same node
- inserts the new segments
- inserts segment members
- computes the run hash
- optionally stores a debug snapshot for a single-booth run

## Why Families Are the Atomic Unit

Using families as atomic units gives the segmentation algorithm a better operational base:

- households remain intact
- a family is never split across segments
- the family location is stable and explicit
- sizing uses `member_count`, not just whatever voter rows happen to have coordinates
- all family members can be attached even if some voter lat/lng values are missing

This makes the output more aligned with real field operations, where a household is usually visited together.

## Why the Grid Is Useful

The grid is not the final output. It is an intermediate spatial scaffold.

It helps the algorithm:

- convert irregular family points into contiguous spatial units
- use deterministic adjacency
- keep region growth local and compact
- rebalance boundaries using discrete neighboring cells
- create wall-to-wall final polygons

## Why the New Rebalance and Compression Steps Matter

A plain BFS region-grower often leaves bad tail cases, such as:

- a tiny leftover region with only a few voters
- one region that should really be absorbed by nearby neighbors
- too many final segments because greedy growth stopped too early

The added geospatial rebalance and global compression steps improve this by:

- borrowing nearby boundary cells instead of only doing whole-region merges
- dissolving small regions across multiple adjacent regions when legal
- reducing the number of undersized exceptions
- reducing the total number of final segments
- keeping the geometry contiguous and non-overlapping

## Debug Replay

When `ENABLE_BOOTH_SEGMENT_GRID_DEBUG=true` and the run is for a single booth, the engine captures a replayable snapshot of the full algorithm.

The debug replay includes:

- scope resolution
- atomic units
- boundary creation
- grid creation
- unit-to-cell assignments
- region growth steps
- merges
- geospatial rebalance transfers
- global compression transfers
- empty-cell fill
- final segments

This is useful for auditing how a specific booth was segmented step by step.

## Current Grid-Based Pipeline in One Line

`scope -> checks -> family atomic units -> parent boundary -> adaptive grid -> unit assignment -> BFS region growth -> merge -> geospatial rebalance -> global compression -> empty-cell fill -> segment geometry -> validation -> persistence`

## Related Files

- `src/segmentation/grid-based/gridEngine.ts`
- `src/segmentation/grid-based/atomicUnitBuilder.ts`
- `src/segmentation/grid-based/parentBoundary.ts`
- `src/segmentation/grid-based/gridBuilder.ts`
- `src/segmentation/grid-based/cellAssigner.ts`
- `src/segmentation/grid-based/regionGrower.ts`
- `src/segmentation/grid-based/segmentBuilder.ts`
- `src/segmentation/grid-based/segmentValidator.ts`
- `src/segmentation/grid-based/debugSnapshot.ts`

## Existing Docs

There are older framework docs in `docs/`.

- `docs/Grid-Based-Segment-Generation-Framework.md`
- `docs/GeoHash-Segment-Generation-Framework.md`

Those are useful background documents, but this `README.md` reflects the current code path more closely, especially the family-based atomic-unit mode and the newer rebalancing/compression flow.
