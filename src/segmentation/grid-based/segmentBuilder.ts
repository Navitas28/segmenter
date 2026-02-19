import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {Region} from './regionGrower.js';
import {AtomicUnit} from './atomicUnitBuilder.js';
import {CellAssignment} from './cellAssigner.js';

/**
 * Represents a complete segment ready for database insertion.
 */
export type Segment = {
	/** Unique segment identifier */
	id: string;
	/** Segment code (e.g., SEG-001) */
	code: string;
	/** Segment geometry (polygon) */
	geometry: {
		type: 'Polygon' | 'MultiPolygon';
		coordinates: number[][][] | number[][][][];
	};
	/** Segment centroid */
	centroid: {
		type: 'Point';
		coordinates: [number, number]; // [lng, lat]
	};
	/** Total voter count */
	total_voters: number;
	/** Total family/unit count */
	total_families: number;
	/** Voter IDs in this segment */
	voter_ids: string[];
};

/**
 * STEP 7: Build segment geometries from regions.
 *
 * For each region:
 * 1. Collect all cell geometries
 * 2. Union them: ST_UnaryUnion(ST_Collect(cell.geom))
 * 3. Clean geometry: ST_Buffer(geom, 0)
 * 4. Compute centroid: ST_Centroid(geom)
 * 5. Extract voter IDs from atomic units
 *
 * @param client - Database client within a transaction
 * @param regions - Array of grown regions
 * @param assignments - Map of cell assignments
 * @param units - Array of atomic units
 * @returns Array of complete segments
 */
export async function buildSegments(client: DbClient, regions: Region[], assignments: Map<string, CellAssignment>, units: AtomicUnit[]): Promise<Segment[]> {
	if (regions.length === 0) {
		return [];
	}

	logger.info({regionCount: regions.length}, 'Building segment geometries');

	const unitMap = new Map<string, AtomicUnit>();
	for (const unit of units) {
		unitMap.set(unit.id, unit);
	}

	const segments: Segment[] = [];

	for (let i = 0; i < regions.length; i++) {
		const region = regions[i];
		const segmentCode = `SEG-${String(i + 1).padStart(3, '0')}`;

		const cellIds = region.cell_ids;

		if (cellIds.length === 0) {
			logger.warn({regionId: region.id}, 'Skipping empty region');
			continue;
		}

		const geomResult = await client.query<{
			geometry_geojson: string;
			centroid_geojson: string;
			geom_type: string;
			num_parts: number;
		}>(
			`
			WITH region_cells AS (
				SELECT geom
				FROM temp_grid_cells
				WHERE cell_id = ANY($1::text[])
			),
			unioned AS (
				SELECT ST_UnaryUnion(ST_Collect(geom)) as geom
				FROM region_cells
			),
			cleaned AS (
				SELECT ST_Buffer(geom, 0) as geom
				FROM unioned
			)
			SELECT
				ST_AsGeoJSON(geom)::text as geometry_geojson,
				ST_AsGeoJSON(ST_Centroid(geom))::text as centroid_geojson,
				ST_GeometryType(geom) as geom_type,
				ST_NumGeometries(geom) as num_parts
			FROM cleaned
			`,
			[cellIds],
		);

		if (geomResult.rowCount === 0 || !geomResult.rows[0]) {
			logger.error({regionId: region.id}, 'Failed to build geometry');
			throw new Error(`Failed to build geometry for region ${region.id}`);
		}

		const geomType = geomResult.rows[0].geom_type;
		const numParts = Number(geomResult.rows[0].num_parts || 1);

		if (geomType === 'ST_MultiPolygon' && numParts > 1) {
			logger.warn(
				{
					regionId: region.id,
					segmentCode,
					numParts,
					cellCount: cellIds.length,
				},
				'Region produced non-contiguous MultiPolygon — possible adjacency gap in BFS',
			);
		}

		const unitIds = new Set<string>();
		const voterIds: string[] = [];

		for (const cellId of cellIds) {
			const assignment = assignments.get(cellId);
			if (assignment) {
				for (const unitId of assignment.unit_ids) {
					unitIds.add(unitId);
					const unit = unitMap.get(unitId);
					if (unit) {
						voterIds.push(...unit.voter_ids);
					}
				}
			}
		}

		const segment: Segment = {
			id: region.id,
			code: segmentCode,
			geometry: JSON.parse(geomResult.rows[0].geometry_geojson),
			centroid: JSON.parse(geomResult.rows[0].centroid_geojson),
			total_voters: voterIds.length,
			total_families: unitIds.size,
			voter_ids: voterIds.sort(),
		};

		segments.push(segment);
	}

	logger.info(
		{
			segmentCount: segments.length,
			totalVoters: segments.reduce((sum, s) => sum + s.total_voters, 0),
		},
		'Segment geometries built',
	);

	return segments;
}
