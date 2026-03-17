import {DbClient, withTransaction} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {env} from '../../config/env.js';
import {resolveScopeAndVoters} from '../scopeResolver.js';
import {SegmentationResult} from '../types.js';
import {buildAtomicUnits} from './atomicUnitBuilder.js';
import {computeParentBoundary} from './parentBoundary.js';
import {buildAdaptiveGrid} from './gridBuilder.js';
import {assignUnitsToCells} from './cellAssigner.js';
import {growRegionsWithOptions} from './regionGrower.js';
import {buildSegments, Segment} from './segmentBuilder.js';
import {validateSegments} from './segmentValidator.js';
import {buildBoothGridDebugSnapshot} from './debugSnapshot.js';

const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

/**
 * Grid-based segmentation strategy using BFS region growing.
 *
 * 1. Resolve scope to booth IDs
 * 2. Build atomic units (families grouped by family_id)
 * 3. Compute parent boundary (concave hull)
 * 4. Build adaptive square grid
 * 5. Assign atomic units to grid cells
 * 6. Grow regions via deterministic BFS flood-fill
 * 7. Build segment geometries from regions
 * 8. Validate segments
 * 9. Insert into database (same tables as geo-hash strategy)
 * 10. Return SegmentationResult
 */
export async function runGridSegmentation(electionId: string, nodeId: string, version: number): Promise<SegmentationResult> {
	const totalStartTime = Date.now();

	return withTransaction(async (client) => {
		logger.info({electionId, nodeId, version}, 'Starting grid-based segmentation (BFS region growing)');

		// Step 1: Resolve scope
		const {scope, boothIds, voters} = await resolveScopeAndVoters(client, nodeId, electionId);
		if (boothIds.length === 0) {
			throw new Error('No booths found for the selected assembly constituency or booth');
		}
		logger.info({nodeId, boothCount: boothIds.length}, 'Scope resolved; segmenting only voters in selected scope');
		const boothGridDebugEnabled = env.enableBoothSegmentGridDebug && scope === 'BOOTH' && boothIds.length === 1;

		if (env.enableBoothSegmentGridDebug && !boothGridDebugEnabled) {
			logger.info(
				{nodeId, scope, boothCount: boothIds.length},
				'Booth grid debug snapshot requested, but skipped because the current scope is not a single booth',
			);
		}

		if (env.enablePreSegmentationChecks) {
			await performPreSegmentationChecks(client, electionId, boothIds, nodeId, {
				requireFamilyCoordinates: env.enableGridAtomicUnitsFromFamilies,
			});
		}

		const algorithmStartTime = Date.now();

		// Step 2: Build atomic units
		const atomicUnitSource = env.enableGridAtomicUnitsFromFamilies ? 'families' : 'voters';
		const units = await buildAtomicUnits(client, electionId, boothIds, {source: atomicUnitSource});
		if (units.length === 0) {
			throw new Error('No atomic units found for segmentation');
		}

		const totalVoters = units.reduce((sum, u) => sum + u.voter_count, 0);
		logger.info({unitCount: units.length, totalVoters, atomicUnitSource}, 'Atomic units built');

		// Step 3: Compute parent boundary
		const boundary = await computeParentBoundary(client, units);

		// Step 4: Build adaptive grid
		const gridCells = await buildAdaptiveGrid(client, boundary, units.length);
		logger.info({gridCellCount: gridCells.length}, 'Adaptive grid built');

		// Step 5: Assign units to cells
		const assignments = await assignUnitsToCells(client, units);

		// Step 6: Grow regions
		const regions = await growRegionsWithOptions(client, assignments, {captureDebug: boothGridDebugEnabled});
		logger.info({regionCount: regions.length}, 'Regions grown');

		// Step 7: Build segment geometries
		const segments = await buildSegments(client, regions, assignments, units);

		// Step 8: Validate
		await validateSegments(client, segments, totalVoters);

		const algorithmDurationMs = Date.now() - algorithmStartTime;

		// Step 9: Write to database
		const dbWriteStartTime = Date.now();

		// Delete old draft segments for this node
		await client.query(
			`
			DELETE FROM segment_members
			WHERE segment_id IN (
				SELECT id FROM segments
				WHERE node_id = $1 AND status = 'draft'
			)
			`,
			[nodeId],
		);
		await client.query(`DELETE FROM segments WHERE node_id = $1 AND status = 'draft'`, [nodeId]);

		// Insert segments
		const segmentIdMap = await insertSegments(client, segments, electionId, nodeId, version);

		// Insert segment members by family
		await insertSegmentMembers(client, segments, segmentIdMap, units);

		const dbWriteDurationMs = Date.now() - dbWriteStartTime;

		// Post-insert validation
		await validateAllFamiliesAssigned(client, electionId, boothIds, nodeId, {
			requireFamilyCoordinates: env.enableGridAtomicUnitsFromFamilies,
		});
		await validateNoOverlappingGeometry(client, electionId, nodeId);
		await validateGeometryValidity(client, electionId, nodeId);
		await validateNoEmptyGeometry(client, electionId, nodeId);

		const runHash = await computeRunHash(client, nodeId);

		const totalDurationMs = Date.now() - totalStartTime;

		const oversizedCount = segments.filter((s) => s.total_voters > 135).length;
		const undersizedCount = segments.filter((s) => s.total_voters < 90).length;
		const debugSnapshot = boothGridDebugEnabled
			? await buildBoothGridDebugSnapshot({
					client,
					electionId,
					nodeId,
					version,
					boothIds,
					boundary,
					gridCells,
					units,
					assignments,
					regions,
					segments,
					voters,
			  })
			: undefined;

		const result: SegmentationResult = {
			segment_count: segments.length,
			voter_count: totalVoters,
			family_count: units.length,
			algorithm_ms: algorithmDurationMs,
			db_write_ms: dbWriteDurationMs,
			total_ms: totalDurationMs,
			run_hash: runHash,
			debug_snapshot: debugSnapshot,
		};

		if (oversizedCount > 0 || undersizedCount > 0) {
			logger.info(
				{
					...result,
					exceptions: {
						oversized: oversizedCount,
						undersized: undersizedCount,
						total: oversizedCount + undersizedCount,
					},
				},
				'Grid segmentation completed with exceptions requiring manual review',
			);
		} else {
			logger.info(result, 'Grid segmentation completed successfully');
		}

		return result;
	});
}
export class PreCheckError extends Error {
	public details: any;
	constructor(message: string, details: any) {
		super(message);
		this.name = 'PreCheckError';
		this.details = details;
	}
}


/**
 * Perform pre-segmentation checks to ensure data integrity before running the spatial algorithm.
 * Validates that voters have locations and the families table is synced with the voters table.
 */
async function performPreSegmentationChecks(
	client: DbClient,
	electionId: string,
	boothIds: string[],
	nodeId: string,
	options: {requireFamilyCoordinates?: boolean} = {},
): Promise<void> {
	logger.info({electionId, boothCount: boothIds.length, nodeId}, 'Running pre-segmentation data integrity checks');
	const errors: any[] = [];

	// 1. Check for voters without locations
	const unlocatedVotersResult = await client.query<{id: string; full_name: string; epic_number: string}>(
		`
		SELECT id, full_name, epic_number
		FROM voters
		WHERE election_id = $1
			AND booth_id::text = any($2::text[])
			AND location IS NULL
		LIMIT 100
		`,
		[electionId, boothIds]
	);

	if ((unlocatedVotersResult.rowCount ?? 0) > 0) {
		const sampleIds = unlocatedVotersResult.rows.slice(0, 10).map(r => r.id);
		logger.error(
			{electionId, nodeId, sampleVoterIds: sampleIds},
			'Pre-check failed: Found voters without geographic coordinates'
		);
		errors.push({
			type: 'unlocated_voters',
			voters: unlocatedVotersResult.rows
		});
	}

	// 2. Check if families table is out of sync with voters table
	// i.e., member_count in families table doesn't match the actual number of voters
	const unsyncedFamiliesResult = await client.query<{id: string; expected_count: number; actual_count: number}>(
		`
		WITH actual_counts AS (
			SELECT family_id, COUNT(*) as count
			FROM voters
			WHERE election_id = $1 AND booth_id::text = any($2::text[]) AND family_id IS NOT NULL
			GROUP BY family_id
		)
		SELECT f.id, f.member_count as expected_count, COALESCE(ac.count, 0) as actual_count
		FROM families f
		LEFT JOIN actual_counts ac ON f.id = ac.family_id
		WHERE f.election_id = $1
			AND f.booth_id::text = any($2::text[])
			AND f.member_count != COALESCE(ac.count, 0)
			AND f.member_count > 0
		LIMIT 100
		`,
		[electionId, boothIds]
	);

	if ((unsyncedFamiliesResult.rowCount ?? 0) > 0) {
		const offendingFamilies = unsyncedFamiliesResult.rows.slice(0, 10).map(r => `${r.id} (expected ${r.expected_count}, found ${r.actual_count})`);
		logger.error(
			{electionId, nodeId, offendingFamilies},
			'Pre-check failed: families table member_count is out of sync with voters table'
		);
		errors.push({
			type: 'unsynced_families',
			families: unsyncedFamiliesResult.rows
		});
	}

	// 3. Check for phantom families (present in families table but no voters reference them)
	const phantomFamiliesResult = await client.query<{id: string}>(
		`
		SELECT f.id
		FROM families f
		WHERE f.election_id = $1
			AND f.booth_id::text = any($2::text[])
			AND NOT EXISTS (
				SELECT 1 FROM voters v
				WHERE v.family_id = f.id
			)
		LIMIT 100
		`,
		[electionId, boothIds]
	);

	if ((phantomFamiliesResult.rowCount ?? 0) > 0) {
		const sampleIds = phantomFamiliesResult.rows.slice(0, 10).map(r => r.id);
		logger.error(
			{electionId, nodeId, sampleFamilyIds: sampleIds},
			'Pre-check failed: Found phantom families (no voters reference these family IDs)'
		);
		errors.push({
			type: 'phantom_families',
			families: phantomFamiliesResult.rows
		});
	}

	// 4. Check for voters missing family_id
	const unassignedVotersResult = await client.query<{id: string; full_name: string; epic_number: string}>(
		`
		SELECT id, full_name, epic_number
		FROM voters
		WHERE election_id = $1
			AND booth_id::text = any($2::text[])
			AND family_id IS NULL
		LIMIT 100
		`,
		[electionId, boothIds]
	);

	if ((unassignedVotersResult.rowCount ?? 0) > 0) {
		const sampleIds = unassignedVotersResult.rows.slice(0, 10).map(r => r.id);
		logger.error(
			{electionId, nodeId, sampleVoterIds: sampleIds},
			'Pre-check failed: Found voters not assigned to any family'
		);
		errors.push({
			type: 'unassigned_voters',
			voters: unassignedVotersResult.rows
		});
	}

	if (options.requireFamilyCoordinates) {
		const familiesMissingCoordinatesResult = await client.query<{id: string}>(
			`
			SELECT f.id
			FROM families f
			WHERE f.election_id = $1
				AND f.booth_id::text = any($2::text[])
				AND f.member_count > 0
				AND (f.latitude IS NULL OR f.longitude IS NULL)
			LIMIT 100
			`,
			[electionId, boothIds]
		);

		if ((familiesMissingCoordinatesResult.rowCount ?? 0) > 0) {
			const sampleIds = familiesMissingCoordinatesResult.rows.slice(0, 10).map((r) => r.id);
			logger.warn(
				{electionId, nodeId, sampleFamilyIds: sampleIds},
				'Pre-check warning: Some families are missing family coordinates; they will be excluded from family-based atomic-unit building'
			);
			errors.push({
				type: 'families_missing_coordinates',
				families: familiesMissingCoordinatesResult.rows
			});
		}
	}
	
	// Aggregate potential multiple errors instead of failing on the first one
	if (errors.length > 0) {
		logger.warn({errors}, `PRE_CHECK_FAILED: ${errors.length} condition(s) failed, but proceeding as requested.`);
	}
	
	logger.info('Pre-segmentation checks passed');
}

/**
 * Insert segments into the segments table with geometry, boundary, and centroid.
 * Uses the same schema as the geo-hash strategy so API responses are identical.
 */
async function insertSegments(
	client: DbClient,
	segments: Segment[],
	electionId: string,
	nodeId: string,
	version: number,
): Promise<Map<string, string>> {
	const values: string[] = [];
	const params: unknown[] = [];

	for (let idx = 0; idx < segments.length; idx++) {
		const segment = segments[idx];
		const offset = params.length;
		const color = COLORS[idx % COLORS.length];

		const isOversized = segment.total_voters > 135;
		const isUndersized = segment.total_voters < 90;
		const hasException = isOversized || isUndersized;

		const metadata = {
			node_id: nodeId,
			voter_count: segment.total_voters,
			family_count: segment.total_families,
			version,
			segment_code: segment.code,
			deterministic: true,
			algorithm: 'grid_region_growing',
			...(hasException && {
				exception: true,
				exception_type: isOversized ? 'oversized' : 'undersized',
				exception_reason: isOversized
					? 'Contains large indivisible families that exceed segment size limit'
					: 'Insufficient voters in grid region',
				requires_manual_review: true,
			}),
		};

		const geomJson = JSON.stringify(segment.geometry);
		const centroidJson = JSON.stringify(segment.centroid);

		values.push(
			`($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}, $${offset + 4}, ` +
			`$${offset + 5}, $${offset + 6}, NULL, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, ` +
			`ST_Y(ST_GeomFromGeoJSON($${offset + 10})), ST_X(ST_GeomFromGeoJSON($${offset + 10})), ` +
			`ST_GeomFromGeoJSON($${offset + 10}), ` +
			`ST_Multi(ST_GeomFromGeoJSON($${offset + 11})), ` +
			`ST_Multi(ST_GeomFromGeoJSON($${offset + 11})))`,
		);

		params.push(
			electionId, nodeId, `Segment ${segment.code}`, 'auto',
			segment.total_voters, segment.total_families, 'draft', color,
			metadata, centroidJson, geomJson,
		);
	}

	const insertQuery = `
		INSERT INTO segments (
			election_id, node_id, segment_name, segment_type,
			total_voters, total_families, assigned_blo_id, status, color,
			metadata, centroid_lat, centroid_lng, centroid, boundary, geometry
		)
		VALUES ${values.join(',')}
		RETURNING id
	`;

	const result = await client.query(insertQuery, params);

	const idMap = new Map<string, string>();
	result.rows.forEach((row, idx) => {
		idMap.set(segments[idx].id, String(row.id));
	});

	logger.info({insertedCount: result.rowCount}, 'Grid segments with geometry inserted into database');

	return idMap;
}

/**
 * Insert segment members by family_id (same schema as geo-hash strategy).
 * Maps from atomic units (which represent families) to segment_members rows.
 */
async function insertSegmentMembers(
	client: DbClient,
	segments: Segment[],
	segmentIdMap: Map<string, string>,
	units: import('./atomicUnitBuilder.js').AtomicUnit[],
): Promise<void> {
	// Build voter_id → unit_id lookup to find which family each voter belongs to
	const voterToUnit = new Map<string, string>();
	for (const unit of units) {
		for (const voterId of unit.voter_ids) {
			voterToUnit.set(voterId, unit.id);
		}
	}

	const rows: Array<{segment_id: string; family_id: string}> = [];

	for (const segment of segments) {
		const dbSegmentId = segmentIdMap.get(segment.id);
		if (!dbSegmentId) {
			throw new Error(`Segment ID not found in map: ${segment.id}`);
		}

		// Collect unique family (unit) IDs for this segment
		const familyIds = new Set<string>();
		for (const voterId of segment.voter_ids) {
			const unitId = voterToUnit.get(voterId);
			if (unitId) familyIds.add(unitId);
		}

		for (const familyId of familyIds) {
			rows.push({segment_id: dbSegmentId, family_id: familyId});
		}
	}

	const chunkSize = 5000;
	let inserted = 0;

	for (let i = 0; i < rows.length; i += chunkSize) {
		const chunk = rows.slice(i, i + chunkSize);
		const values: string[] = [];
		const params: unknown[] = [];

		chunk.forEach((row) => {
			const offset = params.length;
			values.push(`($${offset + 1}, $${offset + 2}, false)`);
			params.push(row.segment_id, row.family_id);
		});

		await client.query(
			`
			INSERT INTO segment_members (segment_id, family_id, is_manual_override)
			VALUES ${values.join(',')}
			`,
			params,
		);

		inserted += chunk.length;
	}

	logger.info({memberCount: inserted}, 'Grid segment members (families) inserted');
}

async function validateAllFamiliesAssigned(
	client: DbClient,
	electionId: string,
	boothIds: string[],
	nodeId: string,
	options: {requireFamilyCoordinates?: boolean} = {},
): Promise<void> {
	const result = await client.query<{id: string}>(
		`
		SELECT f.id
		FROM families f
		LEFT JOIN segment_members sm ON sm.family_id = f.id
			AND sm.segment_id IN (SELECT id FROM segments WHERE node_id = $3 AND status = 'draft')
		WHERE f.election_id = $1
			AND f.booth_id::text = any($2::text[])
			AND f.member_count > 0
			AND ($4::boolean = false OR (f.latitude IS NOT NULL AND f.longitude IS NOT NULL))
			AND sm.id IS NULL
		LIMIT 100
		`,
		[electionId, boothIds, nodeId, options.requireFamilyCoordinates === true],
	);

	if ((result.rowCount ?? 0) > 0) {
		const sampleIds = result.rows.slice(0, 10).map((r) => r.id);
		logger.warn({
			type: 'unassigned_families',
			families: result.rows
		}, `Validation failed: ${result.rowCount} families not assigned to any segment (Sample IDs: ${sampleIds.join(', ')}). Proceeding anyway.`);
	}
	logger.info('Validation check: All families in scope assigned or logged as unassigned');
}

async function validateNoOverlappingGeometry(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{a_id: string; b_id: string}>(
		`
		SELECT a.id as a_id, b.id as b_id
		FROM segments a
		JOIN segments b ON a.id <> b.id
		WHERE a.election_id = $1
			AND a.node_id = $2
			AND b.node_id = $2
			AND ST_Overlaps(a.geometry, b.geometry)
		LIMIT 100
		`,
		[electionId, nodeId],
	);

	if ((result.rowCount ?? 0) > 0) {
		const samplePairs = result.rows.slice(0, 5).map((r) => `(${r.a_id}, ${r.b_id})`);
		logger.warn({
			type: 'overlapping_geometry',
			segment_pairs: result.rows
		}, `Validation failed: ${result.rowCount} segment pairs have interior overlapping geometry (Sample pairs: ${samplePairs.join(', ')}). Proceeding anyway.`);
	}
	logger.info('Validation check: No interior overlap detected or logged');
}

async function validateGeometryValidity(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{id: string}>(
		`
		SELECT id
		FROM segments
		WHERE election_id = $1
			AND node_id = $2
			AND NOT ST_IsValid(geometry)
		LIMIT 100
		`,
		[electionId, nodeId],
	);

	if ((result.rowCount ?? 0) > 0) {
		const sampleIds = result.rows.slice(0, 10).map((r) => r.id);
		logger.warn({
			type: 'invalid_geometry',
			segments: result.rows
		}, `Validation failed: ${result.rowCount} segments have invalid geometry (Sample IDs: ${sampleIds.join(', ')}). Proceeding anyway.`);
	}
	logger.info('Validation check: All geometries are valid or logged');
}

async function validateNoEmptyGeometry(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{id: string}>(
		`
		SELECT id
		FROM segments
		WHERE election_id = $1
			AND node_id = $2
			AND (geometry IS NULL OR ST_IsEmpty(geometry))
		LIMIT 100
		`,
		[electionId, nodeId],
	);

	if ((result.rowCount ?? 0) > 0) {
		const sampleIds = result.rows.slice(0, 10).map((r) => r.id);
		logger.warn({
			type: 'empty_geometry',
			segments: result.rows
		}, `Validation failed: ${result.rowCount} segments have empty geometry (Sample IDs: ${sampleIds.join(', ')}). Proceeding anyway.`);
	}
	logger.info('Validation check: No empty geometries detected or logged');
}

async function computeRunHash(client: DbClient, nodeId: string): Promise<string> {
	const result = await client.query<{hash: string}>(
		`
		SELECT md5(string_agg(family_id::text, ',' ORDER BY family_id))::text as hash
		FROM segment_members sm
		JOIN segments s ON sm.segment_id = s.id
		WHERE s.node_id = $1 AND s.status = 'draft'
		`,
		[nodeId],
	);

	return result.rows[0]?.hash || 'unknown';
}
