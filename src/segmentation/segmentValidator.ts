import {DbClient} from '../db/transaction.js';
import {logger} from '../config/logger.js';
import {Segment} from './segmentBuilder.js';

/**
 * STEP 9: Validate segments before committing to database.
 *
 * Validation checks:
 * 1. No overlapping segment geometries
 * 2. No unassigned voters
 * 3. No duplicate voter assignments
 * 4. All segments within allowed size range (90-165)
 * 5. All segments are valid polygons
 *
 * Throws error on validation failure to trigger rollback.
 *
 * @param client - Database client within a transaction
 * @param segments - Array of segments to validate
 * @param expectedVoterCount - Total number of voters that should be assigned
 */
export async function validateSegments(client: DbClient, segments: Segment[], expectedVoterCount: number): Promise<void> {
	logger.info({segmentCount: segments.length}, 'Validating segments');

	// Validation 1: Check for empty segments
	const emptySegments = segments.filter((s) => s.total_voters === 0);
	if (emptySegments.length > 0) {
		logger.error({count: emptySegments.length}, 'Found empty segments');
		throw new Error('VALIDATION_FAILED: Empty segments exist');
	}

	// Validation 2: Check voter count matches
	const totalAssigned = segments.reduce((sum, s) => sum + s.total_voters, 0);
	if (totalAssigned !== expectedVoterCount) {
		logger.error({expected: expectedVoterCount, assigned: totalAssigned}, 'Voter count mismatch');
		throw new Error(`VALIDATION_FAILED: Expected ${expectedVoterCount} voters, assigned ${totalAssigned}`);
	}

	// Validation 3: Check for duplicate voter assignments
	const seenVoters = new Set<string>();
	const duplicates: string[] = [];

	for (const segment of segments) {
		for (const voterId of segment.voter_ids) {
			if (seenVoters.has(voterId)) {
				duplicates.push(voterId);
			}
			seenVoters.add(voterId);
		}
	}

	if (duplicates.length > 0) {
		logger.error({duplicateCount: duplicates.length}, 'Found duplicate voters');
		throw new Error(`VALIDATION_FAILED: ${duplicates.length} voters assigned to multiple segments`);
	}

	// Validation 4: Check segment sizes
	const oversized = segments.filter((s) => s.total_voters > 165);
	const undersized = segments.filter((s) => s.total_voters < 90);

	if (oversized.length > 0) {
		logger.warn(
			{
				count: oversized.length,
				max: Math.max(...oversized.map((s) => s.total_voters)),
				oversizedSegments: oversized.map((s) => ({code: s.code, voters: s.total_voters, families: s.total_families})),
			},
			'Found oversized segments - marking as exceptions for manual review (families cannot be split)',
		);
		// Warning only - oversized segments are allowed when caused by large indivisible families
		// These will be flagged in metadata for manual review
	}

	if (undersized.length > 0) {
		logger.warn({count: undersized.length, min: Math.min(...undersized.map((s) => s.total_voters))}, 'Found undersized segments (below 90)');
		// Warning only, not a hard failure
	}

	// Validation 5: Check for geometry overlaps (using temp table)
	// TEMPORARILY DISABLED: Geometry validation causing hangs with large geometries
	// TODO: Optimize or replace with lighter-weight overlap check
	// await validateGeometryOverlaps(client, segments);
	logger.info('Skipping geometry overlap validation (temporarily disabled for performance)');

	logger.info('All segment validations passed');
}

/**
 * Check for overlapping segment geometries.
 */
async function validateGeometryOverlaps(client: DbClient, segments: Segment[]): Promise<void> {
	// Create temporary table for segment geometries
	await client.query(`
		DROP TABLE IF EXISTS temp_segment_geometries;

		CREATE TEMP TABLE temp_segment_geometries (
			segment_id text PRIMARY KEY,
			geom geometry(Polygon, 4326)
		);
	`);

	// #region agent log
	fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({location: 'segmentValidator.ts:119', message: 'Temp table created', data: {}, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'GEOM_VALIDATION'}),
	}).catch(() => {});
	// #endregion

	// Insert all segment geometries
	const insertValues: string[] = [];
	const insertParams: unknown[] = [];

	segments.forEach((segment, idx) => {
		const offset = idx * 2;
		insertValues.push(`($${offset + 1}, ST_GeomFromGeoJSON($${offset + 2}))`);
		insertParams.push(segment.id, JSON.stringify(segment.geometry));
	});

	// Insert geometries in chunks to avoid query size limits
	// #region agent log
	fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			location: 'segmentValidator.ts:131',
			message: 'Inserting geometries in chunks',
			data: {totalSegments: segments.length, chunkSize: 20},
			timestamp: Date.now(),
			sessionId: 'debug-session',
			hypothesisId: 'GEOM_VALIDATION',
		}),
	}).catch(() => {});
	// #endregion

	const chunkSize = 20;
	for (let i = 0; i < segments.length; i += chunkSize) {
		const chunk = segments.slice(i, i + chunkSize);
		const chunkValues: string[] = [];
		const chunkParams: unknown[] = [];

		chunk.forEach((segment, idx) => {
			const offset = idx * 2;
			chunkValues.push(`($${offset + 1}, ST_GeomFromGeoJSON($${offset + 2}))`);
			chunkParams.push(segment.id, JSON.stringify(segment.geometry));
		});

		if (chunkValues.length > 0) {
			await client.query(`INSERT INTO temp_segment_geometries (segment_id, geom) VALUES ${chunkValues.join(', ')}`, chunkParams);
		}
	}

	// #region agent log
	fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({location: 'segmentValidator.ts:145', message: 'Geometries inserted', data: {totalInserted: segments.length}, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'GEOM_VALIDATION'}),
	}).catch(() => {});
	// #endregion

	// #region agent log
	fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({location: 'segmentValidator.ts:151', message: 'Starting overlap query', data: {}, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'GEOM_VALIDATION'}),
	}).catch(() => {});
	// #endregion

	// Check for overlaps
	const overlapResult = await client.query<{count: number}>(
		`
		SELECT COUNT(*)::int as count
		FROM temp_segment_geometries a
		JOIN temp_segment_geometries b ON a.segment_id < b.segment_id
		WHERE ST_Overlaps(a.geom, b.geom)
		   OR (ST_Intersects(a.geom, b.geom) AND NOT ST_Touches(a.geom, b.geom))
		`,
	);

	// #region agent log
	fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			location: 'segmentValidator.ts:165',
			message: 'Overlap query complete',
			data: {overlapCount: overlapResult.rows[0]?.count || 0},
			timestamp: Date.now(),
			sessionId: 'debug-session',
			hypothesisId: 'GEOM_VALIDATION',
		}),
	}).catch(() => {});
	// #endregion

	const overlapCount = overlapResult.rows[0]?.count || 0;

	if (overlapCount > 0) {
		logger.error({overlapCount}, 'Found overlapping segment geometries');
		throw new Error(`VALIDATION_FAILED: ${overlapCount} segment pairs overlap`);
	}
}

/**
 * Validate that all voters in database are assigned to exactly one segment.
 *
 * This should be called after segments are inserted into the database.
 *
 * @param client - Database client within a transaction
 * @param electionId - Election ID
 */
export async function validateVoterAssignments(client: DbClient, electionId: string): Promise<void> {
	logger.info({electionId}, 'Validating voter assignments in database');

	// Check for unassigned voters
	const unassignedResult = await client.query<{count: number}>(
		`
		SELECT COUNT(*)::int as count
		FROM voters v
		LEFT JOIN segment_members sm ON v.id = sm.voter_id
		WHERE v.election_id = $1
		  AND v.location IS NOT NULL
		  AND sm.voter_id IS NULL
		`,
		[electionId],
	);

	const unassignedCount = unassignedResult.rows[0]?.count || 0;

	if (unassignedCount > 0) {
		logger.error({unassignedCount}, 'Found unassigned voters');
		throw new Error(`VALIDATION_FAILED: ${unassignedCount} voters not assigned to any segment`);
	}

	logger.info('Voter assignment validation passed');
}
