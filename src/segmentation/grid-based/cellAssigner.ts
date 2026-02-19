import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {AtomicUnit} from './atomicUnitBuilder.js';

/**
 * Represents a cell with its assigned atomic units.
 */
export type CellAssignment = {
	/** Cell ID from grid */
	cell_id: string;
	/** IDs of atomic units assigned to this cell */
	unit_ids: string[];
	/** Total voter count in this cell */
	voter_count: number;
	/** Cell centroid for sorting */
	centroid: {
		lat: number;
		lng: number;
	};
};

/**
 * STEP 4: Assign atomic units to grid cells.
 *
 * Each atomic unit is assigned to the cell that contains its centroid.
 * Uses spatial containment (ST_Contains) for precise assignment.
 *
 * Guarantees:
 * - Each atomic unit belongs to exactly one cell
 * - No atomic unit is split across cells
 *
 * @param client - Database client within a transaction
 * @param units - Array of atomic units to assign
 * @returns Map of cell_id to CellAssignment
 */
export async function assignUnitsToCells(client: DbClient, units: AtomicUnit[]): Promise<Map<string, CellAssignment>> {
	if (units.length === 0) {
		return new Map();
	}

	logger.info({unitCount: units.length}, 'Assigning atomic units to cells');

	await client.query(`
		DROP TABLE IF EXISTS temp_atomic_units;

		CREATE TEMP TABLE temp_atomic_units (
			unit_id text PRIMARY KEY,
			voter_count int,
			voter_ids text[],
			centroid geometry(Point, 4326)
		);
	`);

	const insertValues: string[] = [];
	const insertParams: unknown[] = [];

	units.forEach((unit, idx) => {
		const offset = idx * 4;
		insertValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, ST_GeomFromGeoJSON($${offset + 4}))`);
		insertParams.push(unit.id, unit.voter_count, unit.voter_ids, JSON.stringify(unit.centroid));
	});

	await client.query(
		`
		INSERT INTO temp_atomic_units (unit_id, voter_count, voter_ids, centroid)
		VALUES ${insertValues.join(', ')}
		`,
		insertParams,
	);

	const result = await client.query<{
		cell_id: string;
		unit_ids: string[];
		voter_count: number;
		centroid_lat: number;
		centroid_lng: number;
	}>(
		`
		SELECT
			assigned.cell_id,
			array_agg(assigned.unit_id ORDER BY assigned.unit_id) as unit_ids,
			SUM(assigned.voter_count)::int as voter_count,
			assigned.centroid_lat,
			assigned.centroid_lng
		FROM (
			SELECT DISTINCT ON (u.unit_id)
				c.cell_id,
				u.unit_id,
				u.voter_count,
				c.centroid_lat,
				c.centroid_lng
			FROM temp_atomic_units u
			CROSS JOIN LATERAL (
				SELECT cell_id, centroid_lat, centroid_lng, geom
				FROM temp_grid_cells
				ORDER BY geom <-> u.centroid
				LIMIT 1
			) c
			ORDER BY u.unit_id
		) assigned
		GROUP BY assigned.cell_id, assigned.centroid_lat, assigned.centroid_lng
		ORDER BY assigned.centroid_lat DESC, assigned.centroid_lng ASC
		`,
	);

	const assignments = new Map<string, CellAssignment>();

	for (const row of result.rows) {
		assignments.set(row.cell_id, {
			cell_id: row.cell_id,
			unit_ids: row.unit_ids,
			voter_count: Number(row.voter_count),
			centroid: {
				lat: Number(row.centroid_lat),
				lng: Number(row.centroid_lng),
			},
		});
	}

	const assignedUnits = Array.from(assignments.values()).flatMap((a) => a.unit_ids).length;

	if (assignedUnits !== units.length) {
		throw new Error(
			`ASSIGNMENT_FAILED: ${units.length - assignedUnits} of ${units.length} atomic units were not assigned to any cell`
		);
	}

	logger.info(
		{
			cellsWithUnits: assignments.size,
			totalUnitsAssigned: assignedUnits,
		},
		'Units assigned to cells',
	);

	return assignments;
}
