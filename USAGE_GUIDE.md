# Segmentation Testing Console — Usage Guide

This guide walks through the Segmentation Testing Console UX and how to interpret each panel.

## Step-by-step workflow

1) Select the data scope
- **Election Selector**: pick the election to test.
- **Scope Selector**: choose **AC** or **Booth**.
  - **AC**: select an AC node.
  - **Booth**: select a booth.

2) Choose a version
- **Version Section**:
  - Pick a **version** to view its segments.
  - Optional: select **Base version** + **Compare version**, then click **Compare version** to enable comparison.

3) Run or refresh
- **Run Segmentation**: starts a new job for the selected election + node.
- **Run Determinism Check**: validates repeatability of the segmentation output.
- **Refresh Results**: re-fetches segments, versions, audit logs, and exceptions.
- **Export Full Debug Report**: downloads a JSON bundle of all data.

4) Toggle debug controls
- **Show Raw JSON**: reveals raw API payloads.
- **Show Hashes**: adds segment hashes to tables and map popups.
- **Show Audit Logs / Exceptions**: enables those tabs to show data.
- **Show Geometry Bounds / Boundaries / Voters / Centroids / Highlight Families**:
  - Controls map rendering details.

5) Inspect the map
- Click any polygon/marker to select a segment.
- **Fit to bounds** zooms to all overlays.
- **Comparison overlay** appears when comparing versions.
- If the map is blank, set `VITE_GOOGLE_MAPS_API_KEY` in `src/ui/.env`.

6) Review analytics tabs
- **Overview**: totals, distribution, metadata, performance, integrity checks, version comparison.
- **Segments Table**: list of segments and core attributes.
- **Segment Detail**: deep dive into one segment’s voters, families, centroid, and geometry.
- **Exceptions**: exception list with metadata.
- **Audit Log**: audit records with metadata.
- **Determinism**: deterministic vs mismatch details.
- **Graphs**: distribution and trend charts.

## How to interpret each area

### Overview
- **Totals**: total voters, segments, families.
- **Distribution**: average/min/max segment size.
- **Run Metadata**: version and run hash.
- **Performance**: algorithm time, DB write time, total time.
- **Integrity checks**:
  - Segments > 150 voters or < 80 voters are flagged.
  - Duplicate voters indicates overlap across segments.
  - Member list available indicates if voters are present per segment.

### Map Visualization
- **Boundaries**: segment polygons.
- **Voters**: individual voter markers.
- **Centroids**: segment centers with voter count labels.
- **Highlight Family Clusters**: colors voters by family id.
- **Comparison overlay**: pink boundaries for the compare version.

### Segments Table
- **Segment Code**: primary segment identifier.
- **Voter Count / Family Count**: size metrics.
- **Hash**: used to compare outputs across runs or versions.
- **Status / Created At**: operational metadata.

### Segment Detail
- **Segment Hash**: exact output identity.
- **Centroid**: lat/lng center point.
- **Voter List**: paginated voters with family and coordinates.
- **Family Groups**: grouped counts by family.
- **Geometry JSON**: raw GeoJSON boundary.

### Version Comparison
- **Segment count diff**: net change in segment count.
- **Voter redistribution diff**: total voter changes across same segment codes.
- **Hash differences**: number of segments with changed hashes.
- Map overlay shows comparison version geometry.

### Determinism
- **Deterministic**: same hashes across runs.
- **Mismatch detected**: includes mismatch payload and hash lists.

### Exceptions & Audit Log
- **Exceptions**: errors or anomalies during segmentation.
- **Audit Log**: trace records of segmentation operations.

### Graphs
- **Segment Size Distribution**: bar chart of per-segment sizes.
- **Version Comparison**: line chart of segments per version.
- **Segment Size Buckets**: pie chart across size ranges.
- **Family Size Histogram**: bar chart of family counts.

## Recommended analysis sequence

1) **Overview** for totals and integrity.
2) **Segments Table** to spot outliers.
3) **Map** to validate spatial coherence.
4) **Segment Detail** for a problematic segment.
5) **Exceptions / Audit Log** for anomalies.
6) **Determinism** if repeatability is in question.
7) **Graphs** to confirm distribution shape.
