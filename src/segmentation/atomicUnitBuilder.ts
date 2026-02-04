import {DbClient} from '../db/transaction.js';
import {logger} from '../config/logger.js';

/**
 * Represents a single atomic unit (family or address-based grouping).
 * This is the smallest indivisible unit in the segmentation algorithm.
 */
export type AtomicUnit = {
	/** Unique identifier for this atomic unit */
	id: string;
	/** Number of voters in this unit */
	voter_count: number;
	/** Array of voter IDs belonging to this unit */
	voter_ids: string[];
	/** Centroid point of all voter locations in this unit */
	centroid: {
		type: 'Point';
		coordinates: [number, number]; // [lng, lat]
	};
};

/**
 * STEP 1: Build atomic units from voters.
 *
 * Groups voters by family_id, or falls back to address + floor_number.
 * Each atomic unit must remain together in the final segmentation.
 *
 * Algorithm:
 * - Group by COALESCE(family_id, md5(address || floor_number), id)
 * - Compute centroid using ST_Centroid(ST_Collect(location))
 * - Return array of atomic units with their centroids
 *
 * This function operates entirely in the database for performance.
 *
 * @param client - Database client within a transaction
 * @param electionId - Election ID to filter voters
 * @returns Array of atomic units sorted deterministically by ID
 */
export async function buildAtomicUnits(client: DbClient, electionId: string): Promise<AtomicUnit[]> {
	logger.info({electionId}, 'Building atomic units from voters');

	const result = await client.query<{
		id: string;
		voter_count: number;
		voter_ids: string[];
		centroid_geojson: string;
	}>(
		`
		WITH grouped_voters AS (
			SELECT
				v.id as voter_id,
				COALESCE(
					v.family_id::text,
					md5(COALESCE(v.address, '') || '|' || COALESCE(v.floor_number::text, '')),
					v.id::text
				) as unit_id,
				v.location
			FROM voters v
			WHERE v.election_id = $1
				AND v.location IS NOT NULL
		),
		atomic_units AS (
			SELECT
				unit_id,
				COUNT(*) as voter_count,
				array_agg(voter_id ORDER BY voter_id) as voter_ids,
				ST_Centroid(ST_Collect(location)) as centroid
			FROM grouped_voters
			GROUP BY unit_id
		)
		SELECT
			unit_id as id,
			voter_count,
			voter_ids,
			ST_AsGeoJSON(centroid)::text as centroid_geojson
		FROM atomic_units
		ORDER BY unit_id
		`,
		[electionId],
	);

	const units: AtomicUnit[] = result.rows.map((row) => ({
		id: row.id,
		voter_count: Number(row.voter_count),
		voter_ids: row.voter_ids.map(String),
		centroid: JSON.parse(row.centroid_geojson),
	}));

	logger.info(
		{
			electionId,
			unitCount: units.length,
			totalVoters: units.reduce((sum, u) => sum + u.voter_count, 0),
		},
		'Atomic units built successfully',
	);

	return units;
}
