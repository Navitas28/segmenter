import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {ParentBoundary} from './parentBoundary.js';

/**
 * Represents a single grid cell.
 */
export type GridCell = {
	/** Unique cell identifier (row and column based) */
	id: string;
	/** Cell geometry (square polygon) */
	geometry: {
		type: 'Polygon';
		coordinates: number[][][];
	};
	/** Cell centroid for sorting */
	centroid: {
		lat: number;
		lng: number;
	};
};

/**
 * STEP 3: Build adaptive square grid over parent boundary.
 *
 * Algorithm:
 * 1. Calculate grid size: sqrt(parent_area / unit_count) * 1.5
 * 2. Use ST_SquareGrid to create grid
 * 3. Filter cells that intersect parent boundary
 * 4. Create temporary table with GIST index for spatial queries
 *
 * @param client - Database client within a transaction
 * @param boundary - Parent boundary containing all units
 * @param unitCount - Total number of atomic units
 * @returns Array of grid cells sorted deterministically
 */
export async function buildAdaptiveGrid(client: DbClient, boundary: ParentBoundary, unitCount: number): Promise<GridCell[]> {
	if (unitCount === 0) {
		throw new Error('Cannot build grid: no atomic units');
	}

	logger.info({area_m2: boundary.area_m2, unitCount}, 'Building adaptive grid');

	const estimatedSegments = Math.max(1, Math.round(unitCount * 2.65 / 115));
	const cellsPerSegment = 6;
	const targetTotalCells = estimatedSegments * cellsPerSegment;
	const rawGridSize = Math.sqrt(boundary.area_m2 / Math.max(targetTotalCells, unitCount * 0.5));

	const gridSizeMeters = Math.max(50, Math.min(rawGridSize, 2000));

	logger.info({gridSizeMeters, estimatedSegments, targetTotalCells}, 'Calculated grid size');

	await client.query(`
		DROP TABLE IF EXISTS temp_grid_cells;

		CREATE TEMP TABLE temp_grid_cells (
			cell_id text PRIMARY KEY,
			geom geometry(Polygon, 4326),
			centroid_lat numeric,
			centroid_lng numeric
		);
	`);

	const boundaryWKT = `ST_GeomFromGeoJSON('${JSON.stringify(boundary.geometry)}')`;

	const centerLatResult = await client.query<{lat: number}>(`SELECT ST_Y(ST_Centroid(${boundaryWKT})) as lat`);
	const centerLat = centerLatResult.rows[0]?.lat || 0;

	const metersPerDegree = 111320 * Math.cos((centerLat * Math.PI) / 180);
	const gridSizeDegrees = gridSizeMeters / metersPerDegree;

	await client.query(
		`
		WITH grid AS (
			SELECT
				(row_number() OVER ())::text as cell_id,
				geom
			FROM ST_SquareGrid(
				$1,
				${boundaryWKT}
			) as geom
		),
		filtered_grid AS (
			SELECT
				cell_id,
				geom,
				ST_Y(ST_Centroid(geom)) as centroid_lat,
				ST_X(ST_Centroid(geom)) as centroid_lng
			FROM grid
			WHERE ST_Intersects(geom, ${boundaryWKT})
		)
		INSERT INTO temp_grid_cells (cell_id, geom, centroid_lat, centroid_lng)
		SELECT cell_id, geom, centroid_lat, centroid_lng
		FROM filtered_grid;
		`,
		[gridSizeDegrees],
	);

	await client.query(`
		CREATE INDEX idx_temp_grid_cells_geom ON temp_grid_cells USING GIST (geom);
	`);

	const result = await client.query<{
		cell_id: string;
		geom_geojson: string;
		centroid_lat: number;
		centroid_lng: number;
	}>(
		`
		SELECT
			cell_id,
			ST_AsGeoJSON(geom)::text as geom_geojson,
			centroid_lat,
			centroid_lng
		FROM temp_grid_cells
		ORDER BY centroid_lat DESC, centroid_lng ASC
		`,
	);

	const cells: GridCell[] = result.rows.map((row) => ({
		id: row.cell_id,
		geometry: JSON.parse(row.geom_geojson),
		centroid: {
			lat: Number(row.centroid_lat),
			lng: Number(row.centroid_lng),
		},
	}));

	logger.info({cellCount: cells.length}, 'Grid built successfully');

	return cells;
}
