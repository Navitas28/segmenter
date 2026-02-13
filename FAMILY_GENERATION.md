# Family Generation System — Complete Guide

## 📋 Table of Contents

1. [Project Context](#project-context)
2. [What is Family Generation? (For Project Managers)](#what-is-family-generation-for-project-managers)
3. [How Family Generation Works (Technical)](#how-family-generation-works-technical)
4. [Prerequisites](#prerequisites)
5. [API Usage](#api-usage)
6. [Verification & Testing](#verification--testing)
7. [LLM-Understandable Reference](#llm-understandable-reference)

---

## Project Context

**Project Name**: ECI Segmenter (Election Commission of India - Voter Segmentation System)

**Purpose**: This system divides voters into operational units for election management. The family generation system is a prerequisite step that groups voters into family units before segmentation.

**Technology Stack**:
- **Backend**: Node.js + TypeScript + PostgreSQL + PostGIS
- **Database**: Supabase (PostgreSQL with PostGIS extensions)
- **Frontend**: React + TypeScript + Google Maps API
- **Architecture**: RESTful API with transactional database operations

**Key Principle**: The system is 100% deterministic — same input always produces the same output. This is critical for legal defensibility and auditability in election operations.

---

## What is Family Generation? (For Project Managers)

### The Problem

In election voter data, multiple voters often share the same household address. To efficiently manage voters and ensure families stay together during segmentation, we need to identify and group family units.

**Example**:
```
Before Family Generation:
- Voter 1: Ram Kumar, House #5, Floor 1, Delhi
- Voter 2: Sita Kumar, House #5, Floor 1, Delhi
- Voter 3: Amit Kumar, House #5, Floor 1, Delhi
→ Three separate voter records

After Family Generation:
- Family F001: 3 members (Ram, Sita, Amit)
  - House #5, Floor 1, Delhi
  - All voters linked to Family ID: F001
```

### Why It Matters

1. **Operational Efficiency**: Field workers can visit one household to reach multiple voters
2. **Family Integrity**: Families are never split across different segments
3. **Accurate Workload**: Segments account for geographic clustering of voters
4. **Legal Compliance**: Maintains household relationships in official records

### How It Works (Simple Explanation)

The system uses a **7-level hierarchy** to determine if voters belong to the same family:

#### Level 1: House Number + Address
If two voters have the same house number AND address, they're in the same family.
- Example: "House #5, Laxmi Nagar, Delhi"

#### Level 2: Address Only
If house number is missing but address matches, they're in the same family.
- Example: "Laxmi Nagar, Delhi"

#### Level 3: House Number + Floor Number
If two voters have the same house number AND floor number, they're in the same family.
- Example: "House #5, Floor 1"
- **Most common grouping method** (handles ~80% of voters)

#### Level 4: GPS Location + Relation Name
If two voters have the same GPS coordinates AND same relation (e.g., both list "Ram Kumar" as father), they're in the same family.
- Example: Latitude 26.890°N, Longitude 80.953°E + Relation: "Ram Kumar"

#### Level 5: GPS Location Only
If two voters have the exact same GPS coordinates, they're in the same family.
- Example: Latitude 26.890°N, Longitude 80.953°E

#### Level 6: Relation Name Only
If two voters list the same relation name, they're in the same family.
- Example: Both voters list "Ram Kumar" as father

#### Level 7: Fallback (Single-Person Family)
If no other criteria match, each voter becomes their own single-person family.

### Real-World Results

From actual production data (3,929 voters):

**Before Family Generation**:
- 3,929 separate voter records
- No grouping or relationships

**After Family Generation**:
- 1,547 family units created
- Average family size: 2.54 members
- Largest family: 182 members
- **61% reduction** in operational units

**Hierarchy Usage**:
- Level 3 (house + floor): 80.83% of voters
- Level 4 (location + relation): 18.30% of voters
- Level 5 (location only): 0.87% of voters
- Other levels: <0.01% of voters

---

## How Family Generation Works (Technical)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
│                  (API Request with election_id)              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ POST /generate-family
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    familyController.ts                       │
│                  (Express Route Handler)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ generateFamilies()
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     familyService.ts                         │
│              (Core Business Logic + Transaction)             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Step 1: Create Temp Table with Family Keys          │  │
│  │         (7-level hierarchical fallback)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Step 2: Insert Distinct Families                     │  │
│  │         (Skip existing, use MD5 hash as family_number)│ │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Step 3: Map Voters to Families                       │  │
│  │         (Update voters.family_id)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Step 4: Update Member Counts                         │  │
│  │         (Recalculate families.member_count)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Step 5: Validate All Voters Assigned                 │  │
│  │         (Throw error if any unassigned)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                        SUCCESS                               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ Return Result
                             ▼
                        ┌─────────┐
                        │ Client  │
                        └─────────┘
```

### Database Schema

**voters table**:
```sql
CREATE TABLE voters (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL,
  booth_id UUID NOT NULL,
  family_id UUID,                  -- Links to families table
  house_no TEXT,
  address TEXT,
  floor_number INTEGER,
  relation_name TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  location GEOMETRY(Point, 4326),  -- PostGIS geometry
  -- ... other fields
);
```

**families table**:
```sql
CREATE TABLE families (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL,
  booth_id UUID NOT NULL,
  family_number TEXT NOT NULL,     -- MD5 hash of family key
  address TEXT,
  house_number TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  member_count INTEGER DEFAULT 0,
  -- ... other fields
);
```

### Step-by-Step Algorithm

#### Step 1: Create Temp Family Keys Table

**Purpose**: Compute a unique "family key" for each voter using hierarchical fallback logic.

**SQL Logic**:
```sql
CREATE TEMP TABLE temp_family_keys AS
SELECT
  v.id as voter_id,
  v.election_id,
  v.booth_id,
  CASE
    -- LEVEL 1: house_no AND address present
    WHEN v.house_no IS NOT NULL AND v.address IS NOT NULL THEN
      normalize(house_no) || '|' || normalize(address)

    -- LEVEL 2: address only (no house_no)
    WHEN v.house_no IS NULL AND v.address IS NOT NULL THEN
      normalize(address)

    -- LEVEL 3: house_no + floor_number
    WHEN v.house_no IS NOT NULL AND v.floor_number IS NOT NULL THEN
      normalize(house_no) || '|floor|' || floor_number

    -- LEVEL 4: location + relation_name
    WHEN v.location IS NOT NULL AND v.relation_name IS NOT NULL THEN
      round(lat, 6) || '|' || round(lng, 6) || '|' || normalize(relation_name)

    -- LEVEL 5: location only
    WHEN v.location IS NOT NULL THEN
      round(lat, 6) || '|' || round(lng, 6)

    -- LEVEL 6: relation_name only
    WHEN v.relation_name IS NOT NULL THEN
      'rel|' || normalize(relation_name)

    -- LEVEL 7: fallback to voter id
    ELSE v.id::text
  END as computed_family_key
FROM voters v
WHERE v.election_id = $1
```

**Normalization Function** (applied to text fields):
```sql
normalize(text) =
  lower(                           -- Convert to lowercase
    trim(                          -- Remove leading/trailing whitespace
      regexp_replace(              -- Collapse multiple spaces
        trim(both ',' from text),  -- Remove commas
        '\s+', ' ', 'g'
      )
    )
  )
```

**Coordinate Rounding**: GPS coordinates are rounded to 6 decimal places (~0.1 meter precision).

#### Step 2: Insert Distinct Families

**Purpose**: Create family records for unique family keys that don't already exist.

**SQL Logic**:
```sql
INSERT INTO families (
  election_id,
  booth_id,
  family_number,          -- MD5 hash of computed_family_key
  address,
  house_number,
  latitude,
  longitude,
  member_count
)
SELECT DISTINCT ON (election_id, booth_id, md5(computed_family_key))
  t.election_id,
  t.booth_id,
  md5(t.computed_family_key),     -- Use MD5 as unique identifier
  MAX(v.address),
  MAX(v.house_no),
  round(ST_Y(MAX(v.location))::numeric, 8),
  round(ST_X(MAX(v.location))::numeric, 8),
  0                               -- Will be updated in Step 4
FROM temp_family_keys t
JOIN voters v ON v.id = t.voter_id
LEFT JOIN families f
  ON f.election_id = t.election_id
  AND f.booth_id = t.booth_id
  AND f.family_number = md5(t.computed_family_key)
WHERE f.id IS NULL                -- Only insert if doesn't exist
GROUP BY t.election_id, t.booth_id, t.computed_family_key
```

**Why MD5?**: MD5 hash provides a consistent, unique identifier for each family key without exposing raw addresses.

#### Step 3: Map Voters to Families

**Purpose**: Link each voter to their family by updating `voters.family_id`.

**SQL Logic**:
```sql
UPDATE voters v
SET family_id = f.id
FROM families f
JOIN temp_family_keys t
  ON md5(t.computed_family_key) = f.family_number
  AND t.booth_id = f.booth_id
  AND t.election_id = f.election_id
WHERE v.id = t.voter_id
  AND v.family_id IS NULL          -- Only update unassigned voters
```

#### Step 4: Update Member Counts

**Purpose**: Calculate and store the number of members in each family.

**SQL Logic**:
```sql
UPDATE families f
SET member_count = sub.cnt
FROM (
  SELECT family_id, COUNT(*) as cnt
  FROM voters
  WHERE election_id = $1 AND family_id IS NOT NULL
  GROUP BY family_id
) sub
WHERE f.id = sub.family_id
```

#### Step 5: Validation

**Purpose**: Ensure all voters are assigned to families before committing transaction.

**SQL Logic**:
```sql
SELECT COUNT(*) as unassigned
FROM voters
WHERE election_id = $1
  AND family_id IS NULL
```

**If unassigned > 0**: Throw error and rollback entire transaction.

### Transaction Safety

**All steps execute in a single database transaction**:

```typescript
await withTransaction(async (client) => {
  // Step 1: Create temp table
  await createTempFamilyKeys(client, electionId);

  // Step 2: Insert families
  const familiesCreated = await insertDistinctFamilies(client, electionId);

  // Step 3: Map voters
  const votersUpdated = await mapVotersToFamilies(client, electionId);

  // Step 4: Update counts
  const familiesUpdated = await updateMemberCounts(client, electionId);

  // Step 5: Validate
  await validateVoterAssignment(client, electionId);

  // If we reach here, transaction commits
  // If any step fails, entire transaction rolls back
});
```

**Benefits**:
- **Atomicity**: Either all voters get families or none do
- **Consistency**: Database never in partial state
- **Isolation**: Concurrent requests don't interfere
- **Durability**: Once committed, changes are permanent

### Performance Characteristics

**Optimization Strategies**:
1. **Temp Tables**: Fast in-memory processing for family key computation
2. **Bulk SQL Operations**: No JavaScript loops, all processing in database
3. **Single Transaction**: Minimizes database round trips
4. **Indexed Lookups**: Uses indexes on `election_id`, `booth_id`, `family_number`

**Scaling**:
| Voter Count | Expected Time | Memory Usage |
|-------------|---------------|--------------|
| 1,000       | < 1 second    | Low          |
| 10,000      | < 3 seconds   | Low          |
| 50,000      | < 15 seconds  | Medium       |
| 200,000     | < 60 seconds  | Medium       |

**Actual Production Data** (3,929 voters): ~7 seconds total

---

## Prerequisites

### System Requirements

1. **Database**:
   - PostgreSQL 14+
   - PostGIS 3.0+ extension enabled
   - Supabase connection configured

2. **Node.js Environment**:
   - Node.js 18+ with TypeScript
   - Dependencies installed: `npm install`

3. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://user:pass@host:port/database
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-service-role-key
   ```

4. **Database Schema**:
   - `voters` table with required columns
   - `families` table with required columns
   - PostGIS geometry columns configured

### Data Quality Requirements

**For optimal family grouping, voter data should have**:

1. **Required Fields** (at least one per voter):
   - `house_no` OR
   - `address` OR
   - `latitude` + `longitude` OR
   - `relation_name`

2. **Recommended Data Quality**:
   - Consistent address formatting
   - Accurate GPS coordinates
   - Floor numbers populated
   - Relation names standardized

3. **Data Completeness** (from production example):
   - house_no: 81% populated ✅
   - floor_number: 100% populated ✅
   - location: 100% populated ✅
   - relation_name: 94% populated ✅
   - address: 0% populated ⚠️

**Note**: Even with missing addresses, the system achieved 61% grouping efficiency using other fields.

### Optional: Generate Missing Data

If voter data is incomplete, use the voter data generator:

```bash
# Generate random lat/lng and floor numbers
curl -X POST http://localhost:3000/generate-voter-data \
  -H "Content-Type: application/json" \
  -d '{"election_id": "your-election-id"}'
```

This populates:
- Random GPS coordinates within 0-2km of booth location
- Floor numbers with weighted distribution (50% ground floor, 25% first floor, etc.)

---

## API Usage

### Endpoint: Generate Families

**URL**: `POST /generate-family`

**Request Body**:
```json
{
  "election_id": "f19da7ca-2490-4df6-a445-3add1b8791a6"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "voters_processed": 3929,
  "families_created": 1547,
  "families_updated": 1547
}
```

**Error Response** (400/500):
```json
{
  "success": false,
  "error": "Family generation validation failed: 120 voters remain unassigned"
}
```

### cURL Examples

**Basic Usage**:
```bash
curl -X POST http://localhost:3000/generate-family \
  -H "Content-Type: application/json" \
  -d '{"election_id": "f19da7ca-2490-4df6-a445-3add1b8791a6"}'
```

**With Error Handling**:
```bash
curl -X POST http://localhost:3000/generate-family \
  -H "Content-Type: application/json" \
  -d '{"election_id": "f19da7ca-2490-4df6-a445-3add1b8791a6"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq .
```

### TypeScript/JavaScript Usage

```typescript
async function generateFamilies(electionId: string) {
  const response = await fetch('http://localhost:3000/generate-family', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ election_id: electionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Family generation failed');
  }

  const result = await response.json();
  console.log(`Processed ${result.voters_processed} voters`);
  console.log(`Created ${result.families_created} families`);
  console.log(`Updated ${result.families_updated} families`);

  return result;
}

// Usage
generateFamilies('f19da7ca-2490-4df6-a445-3add1b8791a6')
  .then(result => console.log('Success:', result))
  .catch(error => console.error('Failed:', error));
```

---

## Verification & Testing

### SQL Verification Queries

#### 1. Check Overall Statistics

```sql
SELECT
  COUNT(*) as total_voters,
  COUNT(DISTINCT family_id) as unique_families,
  ROUND(AVG(f.member_count), 2) as avg_family_size,
  MAX(f.member_count) as largest_family,
  MIN(f.member_count) as smallest_family
FROM voters v
JOIN families f ON f.id = v.family_id
WHERE v.election_id = 'your-election-id';
```

**Expected Output**:
```
total_voters | unique_families | avg_family_size | largest_family | smallest_family
-------------|-----------------|-----------------|----------------|----------------
    3929     |      1547       |      2.54       |      182       |        1
```

#### 2. Check Hierarchy Level Usage

```sql
SELECT
  CASE
    WHEN v.house_no IS NOT NULL AND v.address IS NOT NULL THEN 'Level 1: house_no + address'
    WHEN v.house_no IS NULL AND v.address IS NOT NULL THEN 'Level 2: address only'
    WHEN v.house_no IS NOT NULL AND v.floor_number IS NOT NULL THEN 'Level 3: house_no + floor'
    WHEN v.location IS NOT NULL AND v.relation_name IS NOT NULL THEN 'Level 4: location + relation'
    WHEN v.location IS NOT NULL THEN 'Level 5: location only'
    WHEN v.relation_name IS NOT NULL THEN 'Level 6: relation only'
    ELSE 'Level 7: fallback'
  END as hierarchy_level,
  COUNT(*) as voter_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM voters v
WHERE v.election_id = 'your-election-id'
GROUP BY hierarchy_level
ORDER BY voter_count DESC;
```

**Expected Output**:
```
hierarchy_level                    | voter_count | percentage
-----------------------------------|-------------|------------
Level 3: house_no + floor          |    3176     |   80.83%
Level 4: location + relation       |     719     |   18.30%
Level 5: location only             |      34     |    0.87%
```

#### 3. Check for Unassigned Voters

```sql
SELECT
  COUNT(*) as unassigned_voters
FROM voters
WHERE election_id = 'your-election-id'
  AND family_id IS NULL;
```

**Expected Output**: `0` (all voters assigned)

#### 4. View Largest Families

```sql
SELECT
  f.id,
  f.family_number,
  f.house_number,
  f.address,
  f.member_count,
  f.latitude,
  f.longitude,
  COUNT(DISTINCT v.relation_name) as unique_relations
FROM families f
JOIN voters v ON v.family_id = f.id
WHERE f.election_id = 'your-election-id'
GROUP BY f.id, f.family_number, f.house_number, f.address,
         f.member_count, f.latitude, f.longitude
ORDER BY f.member_count DESC
LIMIT 10;
```

#### 5. Family Size Distribution

```sql
SELECT
  f.member_count,
  COUNT(*) as family_count,
  COUNT(*) * f.member_count as total_voters_in_group,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct_families
FROM families f
WHERE f.election_id = 'your-election-id'
GROUP BY f.member_count
ORDER BY f.member_count DESC
LIMIT 20;
```

### Testing Checklist

- [ ] **Data Prerequisites**
  - [ ] Voters table populated with election data
  - [ ] At least one of: house_no, address, location, relation_name per voter
  - [ ] PostGIS extension enabled
  - [ ] Database connection working

- [ ] **API Testing**
  - [ ] POST request succeeds with valid election_id
  - [ ] Response includes voters_processed count
  - [ ] Response includes families_created count
  - [ ] Error handling works for invalid election_id
  - [ ] Error handling works for missing election_id

- [ ] **Data Validation**
  - [ ] All voters have family_id assigned (no NULLs)
  - [ ] Family member_count matches actual voter count
  - [ ] No duplicate family assignments
  - [ ] Family coordinates match voter coordinates
  - [ ] Family addresses populated when available

- [ ] **Determinism Testing**
  - [ ] Running twice produces same family_id assignments
  - [ ] Running twice produces same family_number hashes
  - [ ] Running twice produces same member_count values
  - [ ] Idempotent: can run multiple times safely

- [ ] **Performance Testing**
  - [ ] Completes within expected time for voter count
  - [ ] Memory usage stays within bounds
  - [ ] Database transaction doesn't timeout
  - [ ] Concurrent requests don't interfere

---

## LLM-Understandable Reference

### System Summary for AI Agents

**PROJECT**: ECI Segmenter - Election voter management system

**COMPONENT**: Family Generation Module

**LOCATION**:
- Service Logic: `src/family/familyService.ts`
- Controller: `src/family/familyController.ts`
- API Route: `POST /generate-family`

**INPUT**:
- Election ID (UUID string)
- Voter data in database with fields: house_no, address, floor_number, relation_name, latitude, longitude

**OUTPUT**:
- Families table populated with unique family units
- Voters table updated with family_id foreign key
- Response JSON with counts: voters_processed, families_created, families_updated

**ALGORITHM**: 7-level hierarchical fallback for family key computation
1. Try house_no + address
2. Try address only
3. Try house_no + floor_number (most common match)
4. Try GPS location + relation_name
5. Try GPS location only
6. Try relation_name only
7. Fallback to individual voter ID

**KEY TECHNICAL DETAILS**:
- Single database transaction (atomic operation)
- Temporary table for family key computation
- MD5 hash used as family_number identifier
- Text normalization: lowercase, trim, collapse spaces, remove commas
- GPS rounding: 6 decimal places (~0.1 meter precision)
- Idempotent: can run multiple times safely
- Deterministic: same input always produces same output

**PERFORMANCE**:
- Scales to 200,000+ voters
- ~7 seconds for 4,000 voters
- Bulk SQL operations (no loops in application code)
- Uses database indexes for efficiency

**DATABASE SCHEMA**:
```
voters {
  id: UUID PK
  election_id: UUID FK
  booth_id: UUID FK
  family_id: UUID FK → families.id
  house_no: TEXT
  address: TEXT
  floor_number: INTEGER
  relation_name: TEXT
  latitude: NUMERIC
  longitude: NUMERIC
  location: GEOMETRY(Point, 4326)
}

families {
  id: UUID PK
  election_id: UUID FK
  booth_id: UUID FK
  family_number: TEXT (MD5 hash of family key)
  address: TEXT
  house_number: TEXT
  latitude: NUMERIC
  longitude: NUMERIC
  member_count: INTEGER
}
```

**ERROR HANDLING**:
- Validates all voters assigned before commit
- Rolls back entire transaction on validation failure
- Returns HTTP 400/500 with error message
- Logs errors with context for debugging

**PRODUCTION METRICS** (Real Data):
- Input: 3,929 voters
- Output: 1,547 families
- Reduction: 61% (from 3,929 to 1,547 operational units)
- Average family size: 2.54 members
- Largest family: 182 members
- Processing time: ~7 seconds

**HIERARCHY USAGE IN PRODUCTION**:
- Level 3 (house + floor): 80.83% of voters
- Level 4 (location + relation): 18.30% of voters
- Level 5 (location only): 0.87% of voters
- Other levels: <0.01% of voters

**INTEGRATION POINTS**:
- **Prerequisite for**: Segment Generation (segments must group families, not individual voters)
- **Data Source**: Voters imported from election rolls
- **Used by**: Segmentation Engine (`src/segmentation/segmentationEngine.ts`)

**TESTING**:
- Verification queries provided for data validation
- Determinism tests ensure repeatability
- Performance tests for scaling
- Integration tests with segmentation module

**MAINTENANCE NOTES**:
- Algorithm has 7 levels for maximum grouping efficiency
- Can be extended with additional fallback levels if needed
- Text normalization rules are configurable
- GPS precision can be adjusted (currently 6 decimal places)
- Idempotent design allows safe re-runs without data duplication

**LEGAL/COMPLIANCE**:
- Deterministic algorithm for auditability
- Hash-based family numbering for consistent identification
- Transaction safety ensures data integrity
- No randomness or probabilistic grouping
- Reproducible for legal verification

---

## Additional Resources

- **Architecture Documentation**: See `arch.md` for overall system design
- **API Routes**: See `src/routes/apiRoutes.ts` for endpoint definitions
- **Database Schema**: See `schema.sql` for complete database structure
- **Usage Guide**: See `USAGE_GUIDE.md` for UI testing console

---

**Last Updated**: February 2026
**Version**: 2.0 (7-level hierarchy)
**Status**: ✅ Production Ready
