import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';

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

export type AtomicUnitBuildOptions = {
	source?: 'voters' | 'families';
};

type AtomicUnitRow = {
	id: string;
	voter_count: number;
	voter_ids: string[];
	centroid_geojson: string;
};

/**
 * STEP 1: Build atomic units for segmentation.
 *
 * The default flow derives family centroids from voter locations.
 * The optional families-table flow uses only families with family-level
 * latitude/longitude and attaches all voters for those families by family_id,
 * regardless of whether individual voter locations are present.
 *
 * @param client - Database client within a transaction
 * @param electionId - Election ID to filter voters
 * @param boothIds - Booth IDs to scope voters
 * @param options - Selects the source used for atomic-unit centroids
 * @returns Array of atomic units sorted deterministically by ID
 */
export async function buildAtomicUnits(
	client: DbClient,
	electionId: string,
	boothIds: string[],
	options: AtomicUnitBuildOptions = {},
): Promise<AtomicUnit[]> {
	const source = options.source ?? 'voters';

	logger.info({electionId, boothCount: boothIds.length, source}, 'Building atomic units');

	if (boothIds.length === 0) return [];

	const result =
		source === 'families'
			? await buildAtomicUnitsFromFamilies(client, electionId, boothIds)
			: await buildAtomicUnitsFromVoters(client, electionId, boothIds);

	const units: AtomicUnit[] = result.rows.map((row) => ({
		id: row.id,
		voter_count: Number(row.voter_count),
		voter_ids: row.voter_ids.map(String),
		centroid: JSON.parse(row.centroid_geojson),
	}));

	logger.info(
		{
			electionId,
			source,
			unitCount: units.length,
			totalVoters: units.reduce((sum, u) => sum + u.voter_count, 0),
		},
		'Atomic units built successfully',
	);

	return units;
}

async function buildAtomicUnitsFromVoters(
	client: DbClient,
	electionId: string,
	boothIds: string[],
): Promise<{rows: AtomicUnitRow[]}> {
	return client.query<AtomicUnitRow>(
		`
		WITH grouped_voters AS (
			SELECT
				v.id as voter_id,
				v.family_id::text as unit_id,
				v.location
			FROM voters v
			WHERE v.election_id = $1
				AND v.booth_id::text = any($2::text[])
				AND v.location IS NOT NULL
				AND v.family_id IS NOT NULL
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
		[electionId, boothIds],
	);
}

async function buildAtomicUnitsFromFamilies(
	client: DbClient,
	electionId: string,
	boothIds: string[],
): Promise<{rows: AtomicUnitRow[]}> {
	const result = await client.query<AtomicUnitRow>(
		`
		WITH scoped_voters AS (
			SELECT
				v.id as voter_id,
				v.family_id::text as unit_id
			FROM voters v
			WHERE v.election_id = $1
				AND v.booth_id::text = any($2::text[])
				AND v.family_id IS NOT NULL
		),
		family_units AS (
			SELECT
				f.id::text as id,
				f.member_count as voter_count,
				array_agg(sv.voter_id ORDER BY sv.voter_id) as voter_ids,
				ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326) as centroid
			FROM families f
			JOIN scoped_voters sv ON sv.unit_id = f.id::text
			WHERE f.election_id = $1
				AND f.booth_id::text = any($2::text[])
				AND f.member_count > 0
				AND f.latitude IS NOT NULL
				AND f.longitude IS NOT NULL
			GROUP BY f.id, f.member_count, f.latitude, f.longitude
		)
		SELECT
			id,
			voter_count,
			voter_ids,
			ST_AsGeoJSON(centroid)::text as centroid_geojson
		FROM family_units
		ORDER BY id
		`,
		[electionId, boothIds],
	);

	return result;
}
