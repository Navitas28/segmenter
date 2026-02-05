# Family Generation Implementation

## Overview

This document describes the deterministic family generation functionality added to the eci-segmenter project.

## Files Created

### 1. `src/family/familyService.ts`
Core service implementing the family generation logic with hierarchical fallback.

**Key Function:** `generateFamilies(electionId: string): Promise<FamilyGenerationResult>`

**Process:**
1. Creates temp table with computed family keys using hierarchical fallback
2. Inserts distinct families (skips duplicates)
3. Maps voters to families via family_id
4. Updates member_count for all families
5. Validates all voters are assigned

### 2. `src/family/familyController.ts`
Express route handler for the family generation endpoint.

**Route:** `POST /generate-family`

**Request Body:**
```json
{
  "election_id": "uuid-string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "voters_processed": 150000,
  "families_created": 45000,
  "families_updated": 45000
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message"
}
```

### 3. `src/routes/apiRoutes.ts` (Updated)
Integrated family routes into the existing API routing structure.

## Family Key Generation Hierarchy

The implementation uses a 5-level hierarchical fallback to compute family keys:

### LEVEL 1: house_no + address
```sql
normalize(house_no) || '|' || normalize(address)
```

### LEVEL 2: address only
```sql
normalize(address)
```

### LEVEL 3: location + relation_name
```sql
round(ST_Y(location),6) || '|' || round(ST_X(location),6) || '|' || normalize(relation_name)
```

### LEVEL 4: location only
```sql
round(ST_Y(location),6) || '|' || round(ST_X(location),6)
```

### LEVEL 5: fallback to voter ID
```sql
id::text
```

## Normalization Rules

Text fields are normalized using:
- `lower()` - convert to lowercase
- `trim()` - remove leading/trailing whitespace
- `regexp_replace('\\s+', ' ', 'g')` - collapse multiple spaces to single space
- `trim(both ',' from ...)` - remove leading/trailing commas

## Database Operations

### Temp Table Creation
```sql
CREATE TEMP TABLE temp_family_keys AS
SELECT
  v.id as voter_id,
  v.election_id,
  v.booth_id,
  [computed_family_key using CASE]
FROM voters v
WHERE v.election_id = $1
```

### Family Insertion
```sql
INSERT INTO families (...)
SELECT DISTINCT ON (election_id, booth_id, md5(computed_family_key))
  [fields]
FROM temp_family_keys t
JOIN voters v ON v.id = t.voter_id
LEFT JOIN families f ON [matching conditions]
WHERE f.id IS NULL
GROUP BY election_id, booth_id, computed_family_key
```

### Voter Mapping
```sql
UPDATE voters v
SET family_id = f.id
FROM families f
JOIN temp_family_keys t ON [matching conditions]
WHERE v.id = t.voter_id AND v.family_id IS NULL
```

### Member Count Update
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

## Key Features

✅ **Transactional**: Uses `withTransaction` wrapper - all-or-nothing
✅ **Idempotent**: Can be run multiple times safely (skips existing families)
✅ **Scalable**: Bulk SQL operations, no Node.js loops
✅ **Deterministic**: Same input always produces same output
✅ **Validated**: Ensures all voters are assigned before commit
✅ **Logged**: Comprehensive logging at each step

## Testing the Implementation

### 1. Start the server
```bash
npm run dev
```

### 2. Call the endpoint
```bash
curl -X POST http://localhost:3000/generate-family \
  -H "Content-Type: application/json" \
  -d '{"election_id": "your-election-uuid"}'
```

### 3. Expected workflow
1. Server logs "Starting family generation"
2. Creates temp table with family keys
3. Inserts new families
4. Maps voters to families
5. Updates member counts
6. Validates all voters assigned
7. Returns success response with counts

### 4. Verify results in database
```sql
-- Check families created
SELECT
  election_id,
  booth_id,
  COUNT(*) as family_count,
  SUM(member_count) as total_members
FROM families
WHERE election_id = 'your-election-uuid'
GROUP BY election_id, booth_id;

-- Check voter assignments
SELECT
  COUNT(*) as total_voters,
  COUNT(family_id) as assigned_voters,
  COUNT(*) - COUNT(family_id) as unassigned_voters
FROM voters
WHERE election_id = 'your-election-uuid';

-- View sample families
SELECT
  f.id,
  f.family_number,
  f.house_number,
  f.address,
  f.member_count,
  f.latitude,
  f.longitude
FROM families f
WHERE f.election_id = 'your-election-uuid'
ORDER BY f.member_count DESC
LIMIT 10;
```

## Error Handling

The service will rollback the entire transaction if:
- Any SQL operation fails
- Validation finds unassigned voters
- Database connection issues occur

Errors are logged with context and returned to the client.

## Performance Considerations

- Optimized for 200k+ voters
- Uses single transaction (no intermediate commits)
- Bulk operations only (no loops)
- Temp tables for efficient joins
- Indexed lookups on election_id, booth_id, family_number

## Notes

- Family numbers are MD5 hashes of the computed family keys
- Existing families are preserved (INSERT only where not exists)
- Member counts are recalculated for ALL families in the election
- Temp table is automatically dropped at transaction end
