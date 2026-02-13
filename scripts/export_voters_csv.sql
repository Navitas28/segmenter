-- Export voters for specified booths to CSV
-- Run: psql "$DATABASE_URL" -f scripts/export_voters_csv.sql
-- (voters.csv is created in the current directory)

\copy (SELECT id, election_id, booth_id, family_id, serial_number, district_id, parliamentary_constituency_id, assembly_constituency_id, assembly_constituency_name, epic_number, full_name, age, gender, relation_type, relation_name, address, house_no, latitude, longitude, floor_number, is_active, is_verified, photo_url, created_at, updated_at FROM voters WHERE booth_id IN ('113db4e3-5810-47a7-ac55-46a480b3f266','49151e65-a99a-48c3-9ed6-254cdaaf71e3','c643c8da-ce7a-44bf-b53f-77ae8760917a','d084ce7e-1760-4486-be83-83c1ffe01cc4') ORDER BY booth_id, serial_number NULLS LAST, full_name) TO 'voters.csv' WITH (FORMAT csv, HEADER true);
