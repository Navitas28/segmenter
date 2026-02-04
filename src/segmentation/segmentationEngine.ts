import {DbClient, withTransaction} from '../db/transaction.js';
import {logger} from '../config/logger.js';
import {buildAtomicUnits} from './atomicUnitBuilder.js';
import {computeParentBoundary} from './parentBoundary.js';
import {buildAdaptiveGrid} from './gridBuilder.js';
import {assignUnitsToCells} from './cellAssigner.js';
import {growRegions} from './regionGrower.js';
import {buildSegments} from './segmentBuilder.js';
import {validateSegments, validateVoterAssignments} from './segmentValidator.js';

/**
 * Result of a segmentation run.
 */
export type SegmentationResult = {
	/** Number of segments created */
	segment_count: number;
	/** Total voters segmented */
	voter_count: number;
	/** Total atomic units (families) */
	family_count: number;
	/** Algorithm execution time in milliseconds */
	algorithm_ms: number;
	/** Database write time in milliseconds */
	db_write_ms: number;
	/** Total execution time in milliseconds */
	total_ms: number;
	/** Deterministic hash of the run */
	run_hash: string;
};

/**
 * Main segmentation engine entrypoint.
 *
 * Executes the complete grid-based region growing algorithm:
 * 1. Build atomic units from voters
 * 2. Compute parent boundary
 * 3. Generate adaptive grid
 * 4. Assign units to cells
 * 5. Grow regions via BFS
 * 6. Build segment geometries
 * 7. Validate segments
 * 8. Insert into database
 * 9. Validate final assignments
 *
 * All operations occur within a single transaction.
 * Rollback on any validation failure.
 *
 * @param electionId - Election ID to segment
 * @param nodeId - Hierarchy node ID for scope
 * @param version - Segment version number
 * @returns Segmentation result with statistics
 */
export async function runSegmentation(electionId: string, nodeId: string, version: number): Promise<SegmentationResult> {
	const totalStartTime = Date.now();

	return withTransaction(async (client) => {
		logger.info({electionId, nodeId, version}, 'Starting segmentation');

		const algorithmStartTime = Date.now();

		// STEP 1: Build atomic units
		const units = await buildAtomicUnits(client, electionId);

		if (units.length === 0) {
			throw new Error('No voters found for segmentation');
		}

		const totalVoters = units.reduce((sum, u) => sum + u.voter_count, 0);
		logger.info({unitCount: units.length, totalVoters}, 'Atomic units created');

		// STEP 2: Compute parent boundary
		const boundary = await computeParentBoundary(client, units);

		// STEP 3: Build adaptive grid
		const grid = await buildAdaptiveGrid(client, boundary, units.length);

		// STEP 4: Assign units to cells
		const assignments = await assignUnitsToCells(client, units);

		// STEP 5 & 6: Grow regions via BFS
		const regions = await growRegions(client, assignments);

		// STEP 7: Build segment geometries
		const segments = await buildSegments(client, regions, assignments, units);

		const algorithmDurationMs = Date.now() - algorithmStartTime;

		// STEP 8: Validate segments
		await validateSegments(client, segments, totalVoters);

		// STEP 9: Insert segments into database
		const dbWriteStartTime = Date.now();

		// Delete old draft segments
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

		// Insert new segments
		const segmentIds = await insertSegments(client, segments, electionId, nodeId, version);

		// Insert segment members
		await insertSegmentMembers(client, segments, segmentIds);

		const dbWriteDurationMs = Date.now() - dbWriteStartTime;

		// STEP 10: Validate voter assignments in database
		await validateVoterAssignments(client, electionId);

		// Compute deterministic hash
		const runHash = await computeRunHash(client, nodeId);

		const totalDurationMs = Date.now() - totalStartTime;

		// Count exceptions for reporting
		const oversizedCount = segments.filter((s) => s.total_voters > 165).length;
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
				'Segmentation completed with exceptions requiring manual review',
			);
		} else {
			logger.info(result, 'Segmentation completed successfully');
		}

		return result;
	});
}

/**
 * Insert segments into database.
 */
async function insertSegments(
	client: DbClient,
	segments: Array<{id: string; code: string; geometry: object; centroid: object; total_voters: number; total_families: number}>,
	electionId: string,
	nodeId: string,
	version: number,
): Promise<Map<string, string>> {
	const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

	const values: string[] = [];
	const params: unknown[] = [];

	segments.forEach((segment, idx) => {
		const offset = params.length;
		const color = COLORS[idx % COLORS.length];

		// Check if segment is oversized (>165) or undersized (<90)
		const isOversized = segment.total_voters > 165;
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
				exception_reason: isOversized ? 'Contains large indivisible families that exceed segment size limit' : 'Insufficient voters in region after spatial clustering',
				requires_manual_review: true,
			}),
		};

		values.push(
			`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, ` +
				`$${offset + 5}, $${offset + 6}, NULL, $${offset + 7}, $${offset + 8}, $${offset + 9}, ` +
				`ST_GeomFromGeoJSON($${offset + 10}), ST_GeomFromGeoJSON($${offset + 11}))`,
		);

		const centroid = segment.centroid as {coordinates: [number, number]};

		params.push(electionId, nodeId, `Segment ${segment.code}`, 'auto', segment.total_voters, segment.total_families, 'draft', color, metadata, JSON.stringify(segment.centroid), JSON.stringify(segment.geometry));
	});

	const insertQuery = `
		INSERT INTO segments (
			election_id,
			node_id,
			segment_name,
			segment_type,
			total_voters,
			total_families,
			assigned_blo_id,
			status,
			color,
			metadata,
			centroid,
			geometry
		)
		VALUES ${values.join(',')}
		RETURNING id
	`;

	const result = await client.query(insertQuery, params);

	// Map segment internal ID to database ID
	const idMap = new Map<string, string>();
	result.rows.forEach((row, idx) => {
		idMap.set(segments[idx].id, String(row.id));
	});

	logger.info({insertedCount: result.rowCount}, 'Segments inserted into database');

	return idMap;
}

/**
 * Insert segment members (voter assignments).
 */
async function insertSegmentMembers(client: DbClient, segments: Array<{id: string; voter_ids: string[]}>, segmentIdMap: Map<string, string>): Promise<void> {
	const rows: Array<{segment_id: string; voter_id: string}> = [];

	for (const segment of segments) {
		const dbSegmentId = segmentIdMap.get(segment.id);
		if (!dbSegmentId) {
			throw new Error(`Segment ID not found in map: ${segment.id}`);
		}

		for (const voterId of segment.voter_ids) {
			rows.push({
				segment_id: dbSegmentId,
				voter_id: voterId,
			});
		}
	}

	// Insert in chunks to avoid parameter limit
	const chunkSize = 5000;
	let inserted = 0;

	for (let i = 0; i < rows.length; i += chunkSize) {
		const chunk = rows.slice(i, i + chunkSize);
		const values: string[] = [];
		const params: unknown[] = [];

		chunk.forEach((row) => {
			const offset = params.length;
			values.push(`($${offset + 1}, $${offset + 2}, NULL, NOW())`);
			params.push(row.segment_id, row.voter_id);
		});

		await client.query(
			`
			INSERT INTO segment_members (segment_id, voter_id, family_id, added_at)
			VALUES ${values.join(',')}
			`,
			params,
		);

		inserted += chunk.length;
	}

	logger.info({memberCount: inserted}, 'Segment members inserted');
}

/**
 * Compute deterministic hash of segmentation run.
 */
async function computeRunHash(client: DbClient, nodeId: string): Promise<string> {
	const result = await client.query<{hash: string}>(
		`
		SELECT md5(string_agg(voter_id::text, ',' ORDER BY voter_id))::text as hash
		FROM segment_members sm
		JOIN segments s ON sm.segment_id = s.id
		WHERE s.node_id = $1 AND s.status = 'draft'
		`,
		[nodeId],
	);

	return result.rows[0]?.hash || 'unknown';
}
