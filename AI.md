# AI Integration System — Complete Guide (Advisory-Only, Deterministic-Safe)

> **Project**: ECI Segmenter (Election voter management system)  
> **Scope**: AI improvements around *Family Generation* + *Segment Generation* without breaking determinism, auditability, or transaction safety.  
> **Core Rule**: AI **never** becomes the source-of-truth for assignments. The deterministic engine remains the sole producer of final segments.

---

## 📋 Table of Contents

1. [Why AI Here (And What We Must Not Do)](#why-ai-here-and-what-we-must-not-do)
2. [Current Deterministic Pipeline (Baseline)](#current-deterministic-pipeline-baseline)
3. [AI Integration Principles](#ai-integration-principles)
4. [AI Use-Cases (Phased)](#ai-use-cases-phased)
5. [Architecture Diagram](#architecture-diagram)
6. [Data Model Additions](#data-model-additions)
7. [Training Data Pipeline](#training-data-pipeline)
8. [Model Choices (Exact Types)](#model-choices-exact-types)
9. [Job Processor Integration (Safe Hook Points)](#job-processor-integration-safe-hook-points)
10. [Guardrails, Fallbacks, and Compliance](#guardrails-fallbacks-and-compliance)
11. [UX: How AI Appears in /customer](#ux-how-ai-appears-in-customer)
12. [Metrics & Monitoring](#metrics--monitoring)
13. [Rollout Plan](#rollout-plan)
14. [LLM-Understandable Reference](#llm-understandable-reference)

---

## Why AI Here (And What We Must Not Do)

### ✅ What AI can improve
AI can help reduce exceptions and improve real-world operability by:
- recommending **GeoHash precision** per node (density-adaptive)
- advising **tile ordering** for deterministic packing
- predicting **exceptions** and surfacing manual-review candidates
- scoring **segment quality** (compactness, fragmentation, walkability proxies)
- suggesting **merge/split candidates** for future manual editing tools

### ❌ What AI must NOT do
To preserve legal defensibility and reproducibility, AI must not:
- directly assign families to segments in production
- introduce randomness into packing
- bypass PostGIS validation rules
- modify run_hash computation logic
- create partial/soft commits outside the single-transaction guarantee

> Determinism and transaction safety are core system principles in both family generation and segment generation.  
> - Family generation is deterministic and runs as a single DB transaction.  
> - Segment generation is deterministic (lexicographic ordering, stable packing), validated, and committed atomically.

---

## Current Deterministic Pipeline (Baseline)

### Step A — Family Generation (Prerequisite)
- Groups voters into families via a **7-level deterministic hierarchy**, using normalized keys and MD5 identifiers.
- Updates:
  - `families` table populated
  - `voters.family_id` updated
  - `families.member_count` computed
- Runs in **one transaction**; rollback on validation failure.

### Step B — Segment Generation (Core)
- Uses **7-character GeoHash** tiles (~152m × 152m) computed from family coordinates.
- Groups families into GeoHash tiles, then greedily packs tiles into segments:
  - target range: **90–165** voters (ideal ~125)
  - tiles processed in **lexicographic order** for determinism
- Builds PostGIS geometry per segment using `ST_GeomFromGeoHash` + `ST_UnaryUnion` + `ST_Multi`.
- Inserts segments + segment_members in batches.
- Validates:
  - all families assigned
  - no overlaps (ST_Overlaps = 0)
  - valid geometries (ST_IsValid)
  - non-empty geometries (ST_IsEmpty = false)
- Computes deterministic `run_hash` (MD5 over ordered assignments).

---

## AI Integration Principles

1. **Advisory-first**  
   AI outputs suggestions, scores, and flags. The deterministic engine remains the executor.

2. **Deterministic application**  
   If AI affects execution, it can only do so via deterministic inputs:
   - recommended precision ∈ {6,7,8} (fixed)
   - ranked tile list with stable sorting (`score DESC, geohash ASC`)
   - recommended thresholds (still applied as fixed constants during the run)

3. **Full traceability**  
   Store:
   - AI inputs fingerprint (hash)
   - model version
   - recommendations
   - explanations (top factors)
   - whether the run applied AI or fell back

4. **Fail-safe**  
   If AI is unavailable or outputs invalid data:
   - fall back to precision=7 and lexicographic packing
   - record fallback reason

---

## AI Use-Cases (Phased)

### Phase 1 — Low risk, high ROI (recommended first)
**(1) Precision recommender**
- Recommend GeoHash precision for the node: 6 vs 7 vs 8
- Goal: reduce undersized/oversized exceptions

**(2) Exception predictor**
- Predict which segments will be exceptions and why
- Goal: faster review and better client trust

**(3) Quality scoring**
- Score each segment using compactness/fragmentation metrics
- Goal: measurable quality KPIs for audits and comparisons

### Phase 2 — Medium risk (still deterministic)
**(4) Tile ordering advisor**
- Recommend a ranked list of tiles to feed into deterministic greedy packing
- Goal: reduce fragmentation and improve size distribution

### Phase 3 — Advanced GIS intelligence
**(5) Road-network / barrier awareness**
- Compute walkability proxies or avoid splitting across highways/rivers
- Goal: real-world operational efficiency
- Note: may require external datasets and heavier compute

---

## Architecture Diagram

```mermaid
flowchart LR
  UI[Customer UI (/customer)] -->|POST /api/jobs/segment| API[API Layer]
  API --> DB[(Postgres + PostGIS)]
  API --> Q[(segmentation_jobs queue)]
  Q --> JP[Job Processor]

  JP -->|optional advisory call| AISVC[AI Advisory Service]
  AISVC -->|recommendations + scores| DB

  JP --> CORE[Segmentation Engine\n(deterministic)]
  CORE --> DB

  JP --> VALID[Validation + run_hash]
  VALID --> DB

  UI -->|GET /api/segments?versionId=| API2[API Layer]
  API2 --> DB
```

---

## Data Model Additions

> Keep existing schema intact; only add fields/tables. Default behavior stays unchanged.

### 1) `segmentation_ai_runs` (new)
Stores advisory outputs per job/version.

```sql
CREATE TABLE segmentation_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES segmentation_jobs(id),
  election_id UUID NOT NULL,
  node_id UUID NOT NULL,
  version INTEGER,
  input_fingerprint TEXT NOT NULL,     -- hash of stable input features
  mode TEXT NOT NULL,                  -- recommend_only | apply_precision | apply_order
  recommended_precision INTEGER,        -- 6/7/8
  recommended_tile_order TEXT[],        -- optional; stable ranked list
  confidence NUMERIC,
  explanations JSONB,                  -- top factors, SHAP-ish summaries
  model_versions JSONB,                -- {precision_model: "v1.2", ...}
  applied BOOLEAN DEFAULT FALSE,        -- whether suggestions were applied
  fallback_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2) `segmentation_quality_metrics` (new)
Stores per-segment quality scores and predictions.

```sql
CREATE TABLE segmentation_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id),
  job_id UUID REFERENCES segmentation_jobs(id),
  version INTEGER,
  quality_score NUMERIC,
  compactness NUMERIC,
  fragmentation_count INTEGER,
  perimeter_area_ratio NUMERIC,
  exception_pred BOOLEAN,
  exception_pred_type TEXT,            -- oversized | undersized | overlap-risk | invalid-geom-risk
  created_at TIMESTAMP DEFAULT NOW()
);
```

> Optional: store node-level aggregates for dashboards.

---

## Training Data Pipeline

### Data sources (existing)
- `segmentation_jobs.result` contains counts, timings, run_hash
- `segments` contains geometry, metadata, totals
- `segment_members` links families to segments
- `families` has coordinates + member_count
- `voters` (for family generation feedback, if used)

### Feature extraction (offline batch)
Create a batch job (nightly/weekly):

1. **Node snapshot**
   - family_count, voter_count
   - bounding box / extent
   - density stats (voters per km² proxy)
   - tile distributions at precision 6/7/8 (fast summary)
   - historical exceptions rate

2. **Segment geometry metrics**
   - `ST_Area(geometry::geography)`
   - `ST_Perimeter(geometry::geography)`
   - fragmentation: `ST_NumGeometries(geometry)`
   - perimeter/area ratio
   - centroid dispersion across tiles

3. **Labels**
   - For precision recommender: choose precision that minimizes objective computed from simulated runs:
     - exceptions count
     - size variance
     - fragmentation
     - (optional) runtime cost
   - For exception predictor: from metadata (`exception`, `exception_type`)
   - For quality scoring: rule-based target at first; later can use manual edits/feedback

### Storage
- Store extracted datasets as parquet/csv in object storage
- Save feature schema version

---

## Model Choices (Exact Types)

### 1) Precision recommender (Phase 1)
**Type**: Gradient-Boosted Decision Trees (GBDT)  
- LightGBM / XGBoost
- Multi-class classification: {6, 7, 8}

**Why**: fast, explainable, strong on tabular features, CPU-friendly.

### 2) Exception predictor (Phase 1)
**Type**: GBDT binary + multi-class
- `exception_pred`: binary classifier
- `exception_pred_type`: multi-class classifier

### 3) Quality scoring (Phase 1)
**Type**: Start rule-based + regression later
- Rule-based score from compactness/fragmentation thresholds
- Upgrade to GBDT regression once you have feedback labels

### 4) Tile ordering advisor (Phase 2)
**Type**: Learning-to-rank (LightGBM Ranker) OR regression scoring model
- output: score per tile
- enforce stable ordering (score desc then geohash asc)

> Important: do not let the model output “randomness”. Treat it as a deterministic scoring function.

---

## Job Processor Integration (Safe Hook Points)

### Where to integrate
In `src/services/jobProcessor.ts`, before invoking the segmentation engine:

**Hook: `AI Advisory Step (optional)`**
1. Build stable feature payload (no PII) from DB summaries
2. Call AI service `/ai/recommendations`
3. Store response in `segmentation_ai_runs`
4. Decide mode:
   - recommend_only: store suggestions, run precision=7 default
   - apply_precision: run with recommended precision (still deterministic)
   - apply_order: run with recommended precision + deterministic ranked tile list

### Fallback behavior (mandatory)
- AI timeout/error → fallback to baseline algorithm:
  - precision = 7
  - lexicographic tile order
- Record fallback_reason + applied=false

---

## Guardrails, Fallbacks, and Compliance

### Guardrails
- Validate AI outputs:
  - precision ∈ {6,7,8}
  - tile list contains only existing tiles
  - tile list stable and unique
- Run existing validations unchanged:
  - families assigned
  - no overlaps
  - valid geometry
  - no empty geometry
- Compute run_hash unchanged.

### Compliance / Audit
- Store:
  - model_versions used
  - input_fingerprint
  - whether AI was applied
  - explanations
- Make AI explainability visible in `/customer` (read-only).

---

## UX: How AI Appears in /customer

Add an “AI Insights” panel (read-only, safe language):

- Recommended precision: 7 (confidence 0.82)
- Expected exceptions risk: Low/Medium/High
- Segment quality distribution: A/B/C
- “Why” bullets (from explanations):
  - high density variation
  - many sparse boundary tiles
  - large single-tile clusters detected

Do NOT expose raw model internals to customers (keep `/admin` for deeper debug).

---

## Metrics & Monitoring

### Must track
- Exceptions rate (undersized/oversized) over time by node
- Size variance and average segment size
- Fragmentation metrics (avg ST_NumGeometries)
- AI impact:
  - delta exceptions vs baseline
  - delta fragmentation vs baseline
  - time overhead

### Model drift checks
- tile density distribution drift
- family size distribution drift
- geospatial extent drift

---

## Rollout Plan

### Step 0 — Data readiness
- Ensure historical segmentation jobs + results are stored.
- Ensure exceptions are reliably captured in metadata.

### Step 1 — Phase 1 models in “recommend_only”
- Deploy AI service (CPU)
- Log recommendations, don’t apply
- Validate improvements via backtests

### Step 2 — Apply precision (opt-in)
- Feature flag per node/election
- Compare outcomes vs baseline

### Step 3 — Apply tile ordering (opt-in)
- Restrict to nodes where it improves fragmentation

### Step 4 — Road awareness (pilot)
- Only for selected geographies + strong need

---

## LLM-Understandable Reference

### System Summary for AI Agents

**PROJECT**: ECI Segmenter  
**PIPELINE**: Family Generation → Segment Generation → UI Visualization

**Family Generation**  
- Deterministic 7-level hierarchical keying, MD5 family_number, single-transaction rollback safety.

**Segment Generation**  
- Deterministic GeoHash fixed-precision segmentation (default precision 7).  
- Tiles grouped and packed in lexicographic order, greedy, 90–165 voters/segment.  
- PostGIS geometry unioned into MultiPolygon; validations enforce non-overlap and validity.  
- run_hash computed deterministically.

**AI Integration Goal**  
- Add an **advisory layer** that improves:
  - precision selection
  - exception prediction
  - quality scoring
  - (later) tile ordering
- AI must be non-authoritative, fully logged, deterministic when applied, and always fail-safe.

**Key Files**  
- Segment engine: `src/segmentation/segmentationEngine.ts`  
- Job orchestration: `src/services/jobProcessor.ts`  
- API: `POST /api/jobs/segment`, `GET /api/jobs/:jobId`, `GET /api/segments`

---
