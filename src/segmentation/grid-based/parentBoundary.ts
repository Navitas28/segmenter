import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {AtomicUnit} from './atomicUnitBuilder.js';

/**
 * Represents the parent boundary that contains all atomic units.
 */
export type ParentBoundary = {
	/** GeoJSON polygon geometry */
	geometry: {
		type: 'Polygon';
		coordinates: number[][][];
	};
	/** Area in square meters */
	area_m2: number;
};

/**
 * STEP 2: Compute parent boundary using concave hull.
 *
 * Creates a boundary polygon that encompasses all atomic unit centroids.
 * Uses ST_ConcaveHull with 0.98 target percent to create a tight boundary
 * that follows the actual distribution of voters.
 *
 * @param client - Database client within a transaction
 * @param units - Array of atomic units
 * @returns Parent boundary polygon with area
 */
export async function computeParentBoundary(client: DbClient, units: AtomicUnit[]): Promise<ParentBoundary> {
	if (units.length === 0) {
		throw new Error('Cannot compute parent boundary: no atomic units');
	}

	logger.info({unitCount: units.length}, 'Computing parent boundary');

	await client.query(`
		DROP TABLE IF EXISTS temp_boundary_points;
		CREATE TEMP TABLE temp_boundary_points (
			id serial PRIMARY KEY,
			geom geometry(Point, 4326)
		);
	`);

	const chunkSize = 2000;
	for (let i = 0; i < units.length; i += chunkSize) {
		const chunk = units.slice(i, i + chunkSize);
		const values: string[] = [];
		const params: unknown[] = [];

		chunk.forEach((unit, idx) => {
			values.push(`(ST_GeomFromGeoJSON($${idx + 1}))`);
			params.push(JSON.stringify(unit.centroid));
		});

		await client.query(
			`INSERT INTO temp_boundary_points (geom) VALUES ${values.join(', ')}`,
			params,
		);
	}

	const result = await client.query<{
		boundary_geojson: string;
		area_m2: number;
	}>(
		`
		WITH collected AS (
			SELECT ST_Collect(geom) as geom_collection
			FROM temp_boundary_points
		),
		hull AS (
			SELECT ST_ConcaveHull(geom_collection, 0.98) as boundary
			FROM collected
		)
		SELECT
			ST_AsGeoJSON(boundary)::text as boundary_geojson,
			ST_Area(boundary::geography) as area_m2
		FROM hull
		`,
	);

	await client.query(`DROP TABLE IF EXISTS temp_boundary_points`);

	if (result.rowCount === 0 || !result.rows[0]) {
		throw new Error('Failed to compute parent boundary');
	}

	const boundary: ParentBoundary = {
		geometry: JSON.parse(result.rows[0].boundary_geojson),
		area_m2: Number(result.rows[0].area_m2),
	};

	logger.info(
		{
			area_m2: boundary.area_m2,
			area_km2: (boundary.area_m2 / 1_000_000).toFixed(2),
		},
		'Parent boundary computed',
	);

	return boundary;
}
