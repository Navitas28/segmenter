import {DbClient, withTransaction} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {resolveScopeAndVoters} from '../scopeResolver.js';
import {SegmentationResult} from '../types.js';
import {buildAtomicUnits} from './atomicUnitBuilder.js';
import {computeParentBoundary} from './parentBoundary.js';
import {buildAdaptiveGrid} from './gridBuilder.js';
import {assignUnitsToCells} from './cellAssigner.js';
import {growRegions} from './regionGrower.js';
import {buildSegments, Segment} from './segmentBuilder.js';
import {validateSegments} from './segmentValidator.js';

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
		const {boothIds} = await resolveScopeAndVoters(client, nodeId, electionId);
		if (boothIds.length === 0) {
			throw new Error('No booths found for the selected assembly constituency or booth');
		}
		logger.info({nodeId, boothCount: boothIds.length}, 'Scope resolved; segmenting only voters in selected scope');

		const algorithmStartTime = Date.now();

		// Step 2: Build atomic units
		const units = await buildAtomicUnits(client, electionId, boothIds);
		if (units.length === 0) {
			throw new Error('No atomic units found for segmentation');
		}

		const totalVoters = units.reduce((sum, u) => sum + u.voter_count, 0);
		logger.info({unitCount: units.length, totalVoters}, 'Atomic units built');

		// Step 3: Compute parent boundary
		const boundary = await computeParentBoundary(client, units);

		// Step 4: Build adaptive grid
		const gridCells = await buildAdaptiveGrid(client, boundary, units.length);
		logger.info({gridCellCount: gridCells.length}, 'Adaptive grid built');

		// Step 5: Assign units to cells
		const assignments = await assignUnitsToCells(client, units);

		// Step 6: Grow regions
		const regions = await growRegions(client, assignments);
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
		await validateAllFamiliesAssigned(client, electionId, boothIds, nodeId);
		await validateNoOverlappingGeometry(client, electionId, nodeId);
		await validateGeometryValidity(client, electionId, nodeId);
		await validateNoEmptyGeometry(client, electionId, nodeId);

		const runHash = await computeRunHash(client, nodeId);

		const totalDurationMs = Date.now() - totalStartTime;

		const oversizedCount = segments.filter((s) => s.total_voters > 135).length;
		const undersizedCount = segments.filter((s) => s.total_voters < 90).length;

		const result: SegmentationResult = {
			segment_count: segments.length,
			voter_count: totalVoters,
			family_count: units.length,
			algorithm_ms: algorithmDurationMs,
			db_write_ms: dbWriteDurationMs,
			total_ms: totalDurationMs,
			run_hash: runHash,
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

async function validateAllFamiliesAssigned(client: DbClient, electionId: string, boothIds: string[], nodeId: string): Promise<void> {
	const result = await client.query<{count: string}>(
		`
		SELECT COUNT(*) as count
		FROM families f
		LEFT JOIN segment_members sm ON sm.family_id = f.id
			AND sm.segment_id IN (SELECT id FROM segments WHERE node_id = $3 AND status = 'draft')
		WHERE f.election_id = $1
			AND f.booth_id::text = any($2::text[])
			AND f.member_count > 0
			AND sm.id IS NULL
		`,
		[electionId, boothIds, nodeId],
	);

	const unassignedCount = parseInt(result.rows[0]?.count || '0', 10);
	if (unassignedCount > 0) {
		throw new Error(`Validation failed: ${unassignedCount} families not assigned to any segment`);
	}
	logger.info('Validation passed: All families in scope assigned');
}

async function validateNoOverlappingGeometry(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{count: string}>(
		`
		SELECT COUNT(*) as count
		FROM segments a
		JOIN segments b ON a.id <> b.id
		WHERE a.election_id = $1
			AND a.node_id = $2
			AND b.node_id = $2
			AND ST_Overlaps(a.geometry, b.geometry)
		`,
		[electionId, nodeId],
	);

	const overlapCount = parseInt(result.rows[0]?.count || '0', 10);
	if (overlapCount > 0) {
		throw new Error(`Validation failed: ${overlapCount} segment pairs have interior overlapping geometry`);
	}
	logger.info('Validation passed: No interior overlap detected');
}

async function validateGeometryValidity(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{count: string}>(
		`
		SELECT COUNT(*) as count
		FROM segments
		WHERE election_id = $1
			AND node_id = $2
			AND NOT ST_IsValid(geometry)
		`,
		[electionId, nodeId],
	);

	const invalidCount = parseInt(result.rows[0]?.count || '0', 10);
	if (invalidCount > 0) {
		throw new Error(`Validation failed: ${invalidCount} segments have invalid geometry`);
	}
	logger.info('Validation passed: All geometries are valid');
}

async function validateNoEmptyGeometry(client: DbClient, electionId: string, nodeId: string): Promise<void> {
	const result = await client.query<{count: string}>(
		`
		SELECT COUNT(*) as count
		FROM segments
		WHERE election_id = $1
			AND node_id = $2
			AND ST_IsEmpty(geometry)
		`,
		[electionId, nodeId],
	);

	const emptyCount = parseInt(result.rows[0]?.count || '0', 10);
	if (emptyCount > 0) {
		throw new Error(`Validation failed: ${emptyCount} segments have empty geometry`);
	}
	logger.info('Validation passed: No empty geometries');
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
