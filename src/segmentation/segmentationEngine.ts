import {DbClient, withTransaction} from '../db/transaction.js';
import {logger} from '../config/logger.js';
import {resolveScopeAndVoters} from './scopeResolver.js';

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
 * Family data structure with GeoHash.
 */
type Family = {
	id: string;
	member_count: number;
	latitude: number;
	longitude: number;
	geohash: string;
};

/**
 * Segment data structure.
 */
type Segment = {
	id: string;
	code: string;
	family_ids: string[];
	total_voters: number;
	total_families: number;
	geohash_prefixes: string[];
};

/**
 * Main segmentation engine entrypoint.
 *
 * Executes deterministic GeoHash fixed-precision segmentation (precision 7):
 * 1. Fetch families with 7-char GeoHash
 * 2. Group families by exact geohash, then pack tiles into segments
 * 3. Build segment geometry from ST_UnaryUnion of geohash tiles
 * 4. Compute segment centroid
 * 5. Insert segment records
 * 6. Insert segment members (family_id only)
 * 7. Validation
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
		logger.info({electionId, nodeId, version}, 'Starting GeoHash fixed-precision segmentation (precision 7)');

		// Resolve scope (AC or Booth) to booth IDs so we only segment voters in the selected scope
		const {boothIds} = await resolveScopeAndVoters(client, nodeId, electionId);
		if (boothIds.length === 0) {
			throw new Error('No booths found for the selected assembly constituency or booth');
		}
		logger.info({nodeId, boothCount: boothIds.length}, 'Scope resolved; segmenting only voters in selected scope');

		const algorithmStartTime = Date.now();

		// STEP 1: Fetch families with GeoHash (only for the selected booths)
		const families = await fetchFamiliesWithGeoHash(client, electionId, boothIds);

		if (families.length === 0) {
			throw new Error('No families found for segmentation');
		}

		const totalVoters = families.reduce((sum, f) => sum + f.member_count, 0);
		logger.info({familyCount: families.length, totalVoters}, 'Families loaded with 7-char GeoHash');

		// STEP 2: Fixed-precision GeoHash grouping
		const segments = performFixedPrecisionGrouping(families);
		logger.info({segmentCount: segments.length}, 'Fixed-precision GeoHash grouping completed');

		const algorithmDurationMs = Date.now() - algorithmStartTime;

		// STEP 3-6: Insert segments into database with geometry
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

		// Insert new segments with geometry and centroid
		const segmentIds = await insertSegmentsWithGeometry(client, segments, families, electionId, nodeId, version);

		// Insert segment members (family_id only)
		await insertSegmentMembersByFamily(client, segments, segmentIds);

		const dbWriteDurationMs = Date.now() - dbWriteStartTime;

		// STEP 7: Validation (scoped to this node's segments and families)
		await validateAllFamiliesAssigned(client, electionId, boothIds, nodeId);

		// Overlap validation: Check for interior overlap (not boundary touching)
		await validateNoOverlappingGeometry(client, electionId, nodeId);

		// Geometry validity check
		await validateGeometryValidity(client, electionId, nodeId);

		// Empty geometry check
		await validateNoEmptyGeometry(client, electionId, nodeId);

		// Compute deterministic hash
		const runHash = await computeRunHash(client, nodeId);

		const totalDurationMs = Date.now() - totalStartTime;

		// Count exceptions for reporting
		const oversizedCount = segments.filter((s) => s.total_voters > 165).length;
		const undersizedCount = segments.filter((s) => s.total_voters < 90).length;

		const result: SegmentationResult = {
			segment_count: segments.length,
			voter_count: totalVoters,
			family_count: families.length,
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
 * Fetch families with GeoHash (STEP 1).
 * Only returns families belonging to the given booth IDs (assembly constituency or single booth scope).
 */
async function fetchFamiliesWithGeoHash(client: DbClient, electionId: string, boothIds: string[]): Promise<Family[]> {
	if (boothIds.length === 0) return [];

	const result = await client.query<Family>(
		`
		SELECT
			f.id,
			f.member_count,
			f.latitude,
			f.longitude,
			ST_GeoHash(
				ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326),
				7
			) AS geohash
		FROM families f
		WHERE f.election_id = $1
			AND f.booth_id::text = any($2::text[])
			AND f.member_count > 0
		ORDER BY ST_GeoHash(
			ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326),
			7
		) ASC
		`,
		[electionId, boothIds],
	);

	return result.rows;
}

/**
 * Perform fixed-precision GeoHash grouping (STEP 2).
 * Groups families by 7-character geohash, then packs tiles into segments.
 */
function performFixedPrecisionGrouping(families: Family[]): Segment[] {
	const TARGET_MIN = 90;
	const TARGET_MAX = 165;
	const TARGET_IDEAL = 125;

	// STEP 2.1: Group families by exact 7-character geohash
	const tileMap = new Map<string, {family_ids: string[]; total_voters: number}>();

	for (const family of families) {
		const geohash = family.geohash; // Already 7 characters from query
		const existing = tileMap.get(geohash);

		if (existing) {
			existing.family_ids.push(family.id);
			existing.total_voters += family.member_count;
		} else {
			tileMap.set(geohash, {
				family_ids: [family.id],
				total_voters: family.member_count,
			});
		}
	}

	// STEP 2.2: Convert to sorted array (lexicographic order)
	type Tile = {
		geohash: string;
		family_ids: string[];
		total_voters: number;
	};

	const tiles: Tile[] = Array.from(tileMap.entries())
		.map(([geohash, data]) => ({
			geohash,
			family_ids: data.family_ids,
			total_voters: data.total_voters,
		}))
		.sort((a, b) => a.geohash.localeCompare(b.geohash));

	// STEP 2.3: Sequentially pack tiles into segments
	const segments: Segment[] = [];
	const unassignedTiles = [...tiles];
	let segmentNumber = 1;

	while (unassignedTiles.length > 0) {
		const segmentTiles: Tile[] = [];
		let sumVoters = 0;

		// Greedy packing: add tiles until we reach target
		for (let i = 0; i < unassignedTiles.length; i++) {
			const tile = unassignedTiles[i];
			const newTotal = sumVoters + tile.total_voters;

			if (newTotal <= TARGET_MAX) {
				segmentTiles.push(tile);
				sumVoters = newTotal;

				// Remove from unassigned
				unassignedTiles.splice(i, 1);
				i--; // Adjust index after removal

				// Stop if we've reached ideal size
				if (sumVoters >= TARGET_IDEAL) {
					break;
				}
			}
		}

		// If no tiles fit, take the first tile (oversized exception)
		if (segmentTiles.length === 0) {
			segmentTiles.push(unassignedTiles.shift()!);
			sumVoters = segmentTiles[0].total_voters;
		}

		// Create segment
		const allFamilyIds = segmentTiles.flatMap((t) => t.family_ids);
		const geohashTiles = segmentTiles.map((t) => t.geohash);

		segments.push({
			id: `seg-${segmentNumber}`,
			code: String(segmentNumber).padStart(3, '0'),
			family_ids: allFamilyIds,
			total_voters: sumVoters,
			total_families: allFamilyIds.length,
			geohash_prefixes: geohashTiles, // Store exact 7-char geohashes
		});

		segmentNumber++;
	}

	return segments;
}

/**
 * Insert segments with geometry and centroid (STEP 3-5).
 */
async function insertSegmentsWithGeometry(client: DbClient, segments: Segment[], families: Family[], electionId: string, nodeId: string, version: number): Promise<Map<string, string>> {
	const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

	const values: string[] = [];
	const params: unknown[] = [];

	for (let idx = 0; idx < segments.length; idx++) {
		const segment = segments[idx];
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
			algorithm: 'geohash_fixed_precision_7',
			geohash_tiles: segment.geohash_prefixes, // Store exact 7-char geohash tiles
			...(hasException && {
				exception: true,
				exception_type: isOversized ? 'oversized' : 'undersized',
				exception_reason: isOversized ? 'Contains large indivisible families that exceed segment size limit' : 'Insufficient voters in GeoHash region',
				requires_manual_review: true,
			}),
		};

		// Build geometry from GeoHash tiles (ST_UnaryUnion of geohash boxes)
		// geohash_prefixes contains the exact 7-character geohashes for this segment
		const geohashGeometries = segment.geohash_prefixes.map((hash, i) => `ST_GeomFromGeoHash($${offset + 10 + i})`).join(', ');

		// ST_Multi ensures MultiPolygon output (column requires MultiPolygon type)
		const geometryExpression = `ST_Multi(ST_UnaryUnion(ST_Collect(ARRAY[${geohashGeometries}])))`;
		const centroidExpression = `ST_Centroid(ST_UnaryUnion(ST_Collect(ARRAY[${geohashGeometries}])))`;

		values.push(
			`($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}, $${offset + 4}, ` +
				`$${offset + 5}, $${offset + 6}, NULL, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, ` +
				`ST_Y(${centroidExpression}), ST_X(${centroidExpression}), ` +
				`${centroidExpression}, ${geometryExpression})`,
		);

		params.push(electionId, nodeId, `Segment ${segment.code}`, 'auto', segment.total_voters, segment.total_families, 'draft', color, metadata);

		// Add GeoHash tiles as parameters
		for (const hash of segment.geohash_prefixes) {
			params.push(hash);
		}
	}

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
			centroid_lat,
			centroid_lng,
			centroid,
			geometry
		)
		VALUES ${values.join(',')}
		RETURNING id
	`;

	let result;
	try {
		result = await client.query(insertQuery, params);
	} catch (err) {
		throw err;
	}

	// Map segment internal ID to database ID
	const idMap = new Map<string, string>();
	result.rows.forEach((row, idx) => {
		idMap.set(segments[idx].id, String(row.id));
	});

	logger.info({insertedCount: result.rowCount}, 'Segments with geometry inserted into database');

	return idMap;
}

/**
 * Insert segment members by family_id only (STEP 6).
 */
async function insertSegmentMembersByFamily(client: DbClient, segments: Segment[], segmentIdMap: Map<string, string>): Promise<void> {
	const rows: Array<{segment_id: string; family_id: string}> = [];

	for (const segment of segments) {
		const dbSegmentId = segmentIdMap.get(segment.id);
		if (!dbSegmentId) {
			throw new Error(`Segment ID not found in map: ${segment.id}`);
		}

		for (const familyId of segment.family_ids) {
			rows.push({
				segment_id: dbSegmentId,
				family_id: familyId,
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

	logger.info({memberCount: inserted}, 'Segment members (families) inserted');
}

/**
 * Validate all families in scope are assigned (STEP 7a).
 */
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

/**
 * Validate no overlapping geometry (STEP 7b).
 * Uses ST_Overlaps to detect interior overlap only (boundary touching is allowed).
 * Scoped to segments for this node only.
 */
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

/**
 * Validate all geometries are valid (STEP 7c).
 * Scoped to segments for this node only.
 */
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

/**
 * Validate no empty geometries (STEP 7d).
 * Scoped to segments for this node only.
 */
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

/**
 * Compute deterministic hash of segmentation run.
 */
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
