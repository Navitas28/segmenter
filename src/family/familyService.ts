import {logger} from '../config/logger.js';
import {withTransaction, DbClient} from '../db/transaction.js';

export interface FamilyGenerationResult {
	voters_processed: number;
	families_created: number;
	families_updated: number;
}

/**
 * Generate families deterministically for a given election.
 * Uses hierarchical fallback logic to compute family keys.
 * When boothId is provided, only voters in that booth are processed (e.g. when a new booth is added).
 */
export async function generateFamilies(electionId: string, boothId?: string): Promise<FamilyGenerationResult> {
	logger.info({electionId, boothId}, 'Starting family generation');

	const startTime = Date.now();

	const result = await withTransaction(async (client) => {
		// Step 0: Get voter count for scope (election only or election+booth)
		const totalVotersResult = await client.query(
			`SELECT COUNT(*) as total FROM voters WHERE election_id = $1 AND ($2::uuid IS NULL OR booth_id = $2)`,
			[electionId, boothId ?? null],
		);
		const totalVoters = Number(totalVotersResult.rows[0]?.total ?? 0);

		if (totalVoters === 0) {
			logger.warn({electionId, boothId}, 'No voters found for election' + (boothId ? ' and booth' : ''));
			return {
				voters_processed: 0,
				families_created: 0,
				families_updated: 0,
			};
		}

		logger.info({electionId, boothId, totalVoters}, 'Found voters to process');

		// Step 1: Create temp table with computed family keys (filtered by booth when provided)
		await createTempFamilyKeys(client, electionId, boothId ?? null);

		// Step 2: Insert distinct families (only new ones)
		const familiesCreated = await insertDistinctFamilies(client, electionId);

		// Step 3: Map voters to families
		const votersUpdated = await mapVotersToFamilies(client, electionId);

		// Step 4: Update member counts (only affected families when booth_id is set)
		const familiesUpdated = await updateMemberCounts(client, electionId, boothId ?? null);

		// Step 5: Validate all voters in scope are assigned
		await validateVoterAssignment(client, electionId, boothId ?? null);

		// Clean up temp table
		await client.query('DROP TABLE IF EXISTS temp_family_keys');

		return {
			voters_processed: votersUpdated,
			families_created: familiesCreated,
			families_updated: familiesUpdated,
		};
	});

	const durationMs = Date.now() - startTime;
	logger.info(
		{
			electionId,
			boothId,
			result,
			durationMs,
		},
		'Family generation completed',
	);

	return result;
}

/**
 * Step 1: Create temp table with computed family keys using hierarchical fallback logic
 * 7-level hierarchy:
 * 1. house_no + address
 * 2. address only
 * 3. house_no + floor_number (NEW)
 * 4. location + relation_name
 * 5. location only
 * 6. relation_name only (NEW)
 * 7. voter id (fallback)
 */
async function createTempFamilyKeys(client: DbClient, electionId: string, boothId: string | null): Promise<void> {
	logger.info({electionId, boothId}, 'Creating temp family keys table (7-level hierarchy)');

	await client.query(
		`
		CREATE TEMP TABLE temp_family_keys AS
		SELECT
			v.id as voter_id,
			v.election_id,
			v.booth_id,
			CASE
				-- LEVEL 1: house_no AND address present
				WHEN v.house_no IS NOT NULL AND v.address IS NOT NULL THEN
					lower(trim(regexp_replace(trim(both ',' from trim(v.house_no)), '\\s+', ' ', 'g'))) || '|' ||
					lower(trim(regexp_replace(trim(both ',' from trim(v.address)), '\\s+', ' ', 'g')))

				-- LEVEL 2: address only (no house_no)
				WHEN v.house_no IS NULL AND v.address IS NOT NULL THEN
					lower(trim(regexp_replace(trim(both ',' from trim(v.address)), '\\s+', ' ', 'g')))

				-- LEVEL 3: house_no + floor_number (NEW)
				WHEN v.house_no IS NOT NULL AND v.floor_number IS NOT NULL THEN
					lower(trim(regexp_replace(trim(both ',' from trim(v.house_no)), '\\s+', ' ', 'g'))) || '|floor|' ||
					v.floor_number::text

				-- LEVEL 4: location + relation_name
				WHEN v.location IS NOT NULL AND v.relation_name IS NOT NULL THEN
					round(ST_Y(v.location)::numeric, 6)::text || '|' ||
					round(ST_X(v.location)::numeric, 6)::text || '|' ||
					lower(trim(regexp_replace(trim(both ',' from trim(v.relation_name)), '\\s+', ' ', 'g')))

				-- LEVEL 5: location only
				WHEN v.location IS NOT NULL THEN
					round(ST_Y(v.location)::numeric, 6)::text || '|' ||
					round(ST_X(v.location)::numeric, 6)::text

				-- LEVEL 6: relation_name only (NEW)
				WHEN v.relation_name IS NOT NULL THEN
					'rel|' || lower(trim(regexp_replace(trim(both ',' from trim(v.relation_name)), '\\s+', ' ', 'g')))

				-- LEVEL 7: fallback to voter id
				ELSE v.id::text
			END as computed_family_key
		FROM voters v
		WHERE v.election_id = $1 AND ($2::uuid IS NULL OR v.booth_id = $2)
	`,
		[electionId, boothId],
	);

	const countResult = await client.query(`SELECT COUNT(*) as cnt FROM temp_family_keys`);
	logger.info({count: Number(countResult.rows[0]?.cnt ?? 0)}, 'Temp family keys created');
}

/**
 * Step 2: Insert distinct families (skip duplicates)
 */
async function insertDistinctFamilies(client: DbClient, electionId: string): Promise<number> {
	logger.info({electionId}, 'Inserting distinct families');

	const result = await client.query(`
		INSERT INTO families (
			election_id,
			booth_id,
			family_number,
			address,
			house_number,
			latitude,
			longitude,
			member_count
		)
		SELECT DISTINCT ON (t.election_id, t.booth_id, md5(t.computed_family_key))
			t.election_id,
			t.booth_id,
			md5(t.computed_family_key),
			MAX(v.address),
			MAX(v.house_no),
			CASE
				WHEN MAX(v.location) IS NOT NULL
				THEN round(ST_Y(MAX(v.location))::numeric, 8)
				ELSE NULL
			END,
			CASE
				WHEN MAX(v.location) IS NOT NULL
				THEN round(ST_X(MAX(v.location))::numeric, 8)
				ELSE NULL
			END,
			0
		FROM temp_family_keys t
		JOIN voters v ON v.id = t.voter_id
		LEFT JOIN families f
			ON f.election_id = t.election_id
			AND f.booth_id = t.booth_id
			AND f.family_number = md5(t.computed_family_key)
		WHERE f.id IS NULL
		GROUP BY t.election_id, t.booth_id, t.computed_family_key
	`);

	const familiesCreated = result.rowCount ?? 0;
	logger.info({familiesCreated}, 'Families inserted');
	return familiesCreated;
}

/**
 * Step 3: Map voters to families
 */
async function mapVotersToFamilies(client: DbClient, electionId: string): Promise<number> {
	logger.info({electionId}, 'Mapping voters to families');

	const result = await client.query(`
		UPDATE voters v
		SET family_id = f.id
		FROM families f
		JOIN temp_family_keys t
			ON md5(t.computed_family_key) = f.family_number
			AND t.booth_id = f.booth_id
			AND t.election_id = f.election_id
		WHERE v.id = t.voter_id
			AND v.family_id IS NULL
	`);

	const votersUpdated = result.rowCount ?? 0;
	logger.info({votersUpdated}, 'Voters mapped to families');
	return votersUpdated;
}

/**
 * Step 4: Update member counts. When boothId is set, only families for that booth are updated.
 */
async function updateMemberCounts(client: DbClient, electionId: string, boothId: string | null): Promise<number> {
	logger.info({electionId, boothId}, 'Updating family member counts');

	const result = await client.query(
		`
		UPDATE families f
		SET member_count = sub.cnt
		FROM (
			SELECT family_id, COUNT(*) as cnt
			FROM voters
			WHERE election_id = $1 AND family_id IS NOT NULL
			GROUP BY family_id
		) sub
		WHERE f.id = sub.family_id AND ($2::uuid IS NULL OR f.booth_id = $2)
	`,
		[electionId, boothId],
	);

	const familiesUpdated = result.rowCount ?? 0;
	logger.info({familiesUpdated}, 'Family member counts updated');
	return familiesUpdated;
}

/**
 * Step 5: Validate all voters in scope are assigned to families
 */
async function validateVoterAssignment(client: DbClient, electionId: string, boothId: string | null): Promise<void> {
	logger.info({electionId, boothId}, 'Validating voter assignments');

	const result = await client.query(
		`SELECT COUNT(*) as unassigned FROM voters WHERE election_id = $1 AND ($2::uuid IS NULL OR booth_id = $2) AND family_id IS NULL`,
		[electionId, boothId],
	);

	const unassignedCount = Number(result.rows[0]?.unassigned ?? 0);

	if (unassignedCount > 0) {
		const errorMsg = `Family generation validation failed: ${unassignedCount} voters remain unassigned`;
		logger.error({electionId, unassignedCount}, errorMsg);
		throw new Error(errorMsg);
	}

	logger.info({electionId}, 'All voters successfully assigned to families');
}
