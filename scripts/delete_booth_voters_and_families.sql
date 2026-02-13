-- Delete all voters and families for a given booth.
-- segment_members rows for these families/voters are removed by FK CASCADE.
-- Run: psql "$DATABASE_URL" -v booth_id='d084ce7e-1760-4486-be83-83c1ffe01cc4' -f scripts/delete_booth_voters_and_families.sql
-- Or run inline with the booth_id set below.

BEGIN;

-- 1. Delete voters for this booth first (segment_members referencing voter_id CASCADE).
DELETE FROM voters
WHERE booth_id = 'd084ce7e-1760-4486-be83-83c1ffe01cc4';

-- 2. Delete families for this booth (segment_members referencing family_id CASCADE).
DELETE FROM families
WHERE booth_id = 'd084ce7e-1760-4486-be83-83c1ffe01cc4';

COMMIT;
