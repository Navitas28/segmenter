import {DbClient} from '../db/transaction.js';
import {env} from '../config/env.js';
import {logger} from '../config/logger.js';

export const BOOTH_DISTANCE_THRESHOLD_METERS = 2000;

export type BoothDistanceStatus = 'available' | 'missing' | 'member_location_missing';
export type BoothDistanceCalculationType = 'geodesic' | 'road';

export type BoothDistanceAffectedVoter = {
	voter_id: string;
	family_id: string | null;
	booth_id: string | null;
	booth_name: string | null;
	booth_number: string | null;
	geodesic_distance_meters: number | null;
	road_distance_meters: number | null;
	distance_meters: number | null;
	distance_calculation_type: BoothDistanceCalculationType;
	booth_location_status: BoothDistanceStatus;
};

export type BoothDistanceMetadata = {
	threshold_meters: number;
	distance_calculation_type: BoothDistanceCalculationType;
	requested_distance_calculation_type: BoothDistanceCalculationType;
	far_voter_count: number;
	missing_booth_location_voter_count: number;
	member_location_missing_voter_count: number;
	far_voter_ids: string[];
	far_voters: BoothDistanceAffectedVoter[];
	missing_booth_location_voter_ids: string[];
	missing_booth_location_booth_ids: string[];
	member_location_missing_voter_ids: string[];
	has_far_voters: boolean;
	has_missing_booth_location: boolean;
	has_member_location_missing: boolean;
	affected_segment: boolean;
};

type BoothDistanceRow = {
	segment_id: string;
	voter_id: string;
	family_id: string | null;
	booth_id: string | null;
	booth_name: string | null;
	booth_number: string | null;
	member_lat: number | null;
	member_lng: number | null;
	booth_lat: number | null;
	booth_lng: number | null;
	booth_location_status: BoothDistanceStatus;
	geodesic_distance_meters: number | null;
};

export const createEmptyBoothDistanceMetadata = (
	thresholdMeters: number = BOOTH_DISTANCE_THRESHOLD_METERS,
	distanceCalculationType: BoothDistanceCalculationType = env.boothDistanceCalculationType,
	requestedDistanceCalculationType: BoothDistanceCalculationType = env.boothDistanceCalculationType,
): BoothDistanceMetadata => ({
	threshold_meters: thresholdMeters,
	distance_calculation_type: distanceCalculationType,
	requested_distance_calculation_type: requestedDistanceCalculationType,
	far_voter_count: 0,
	missing_booth_location_voter_count: 0,
	member_location_missing_voter_count: 0,
	far_voter_ids: [],
	far_voters: [],
	missing_booth_location_voter_ids: [],
	missing_booth_location_booth_ids: [],
	member_location_missing_voter_ids: [],
	has_far_voters: false,
	has_missing_booth_location: false,
	has_member_location_missing: false,
	affected_segment: false,
});

export function normalizeBoothDistanceMetadata(
	value: unknown,
	thresholdMeters: number = BOOTH_DISTANCE_THRESHOLD_METERS,
): BoothDistanceMetadata {
	const base = createEmptyBoothDistanceMetadata(thresholdMeters);
	if (!value || typeof value !== 'object') return base;

	const source = value as Record<string, unknown>;
	const farVoters = Array.isArray(source.far_voters)
		? source.far_voters
				.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
				.map((item) => {
					const boothLocationStatus: BoothDistanceStatus =
						item.booth_location_status === 'missing' || item.booth_location_status === 'member_location_missing'
							? item.booth_location_status
							: 'available';
					const distanceCalculationType: BoothDistanceCalculationType =
						item.distance_calculation_type === 'road' ? 'road' : 'geodesic';

					return {
						voter_id: String(item.voter_id ?? ''),
						family_id: item.family_id != null ? String(item.family_id) : null,
						booth_id: item.booth_id != null ? String(item.booth_id) : null,
						booth_name: item.booth_name != null ? String(item.booth_name) : null,
						booth_number: item.booth_number != null ? String(item.booth_number) : null,
						geodesic_distance_meters:
							item.geodesic_distance_meters != null && Number.isFinite(Number(item.geodesic_distance_meters))
								? Number(item.geodesic_distance_meters)
								: null,
						road_distance_meters:
							item.road_distance_meters != null && Number.isFinite(Number(item.road_distance_meters))
								? Number(item.road_distance_meters)
								: null,
						distance_meters:
							item.distance_meters != null && Number.isFinite(Number(item.distance_meters))
								? Number(item.distance_meters)
								: null,
						distance_calculation_type: distanceCalculationType,
						booth_location_status: boothLocationStatus,
					};
				})
				.filter((item) => item.voter_id.length > 0)
		: [];

	const farVoterIds = Array.isArray(source.far_voter_ids)
		? source.far_voter_ids.map(String)
		: farVoters.map((item) => item.voter_id);

	const missingBoothLocationVoterIds = Array.isArray(source.missing_booth_location_voter_ids)
		? source.missing_booth_location_voter_ids.map(String)
		: [];
	const missingBoothLocationBoothIds = Array.isArray(source.missing_booth_location_booth_ids)
		? source.missing_booth_location_booth_ids.map(String)
		: [];
	const memberLocationMissingVoterIds = Array.isArray(source.member_location_missing_voter_ids)
		? source.member_location_missing_voter_ids.map(String)
		: [];

	const farVoterCount = Number.isFinite(Number(source.far_voter_count))
		? Number(source.far_voter_count)
		: farVoterIds.length;
	const missingBoothLocationVoterCount = Number.isFinite(Number(source.missing_booth_location_voter_count))
		? Number(source.missing_booth_location_voter_count)
		: missingBoothLocationVoterIds.length;
	const memberLocationMissingVoterCount = Number.isFinite(Number(source.member_location_missing_voter_count))
		? Number(source.member_location_missing_voter_count)
		: memberLocationMissingVoterIds.length;

	return {
		threshold_meters:
			source.threshold_meters != null && Number.isFinite(Number(source.threshold_meters))
				? Number(source.threshold_meters)
				: base.threshold_meters,
		distance_calculation_type: source.distance_calculation_type === 'road' ? 'road' : base.distance_calculation_type,
		requested_distance_calculation_type:
			source.requested_distance_calculation_type === 'road' ? 'road' : base.requested_distance_calculation_type,
		far_voter_count: farVoterCount,
		missing_booth_location_voter_count: missingBoothLocationVoterCount,
		member_location_missing_voter_count: memberLocationMissingVoterCount,
		far_voter_ids: farVoterIds,
		far_voters: farVoters,
		missing_booth_location_voter_ids: missingBoothLocationVoterIds,
		missing_booth_location_booth_ids: missingBoothLocationBoothIds,
		member_location_missing_voter_ids: memberLocationMissingVoterIds,
		has_far_voters: farVoterCount > 0,
		has_missing_booth_location: missingBoothLocationVoterCount > 0,
		has_member_location_missing: memberLocationMissingVoterCount > 0,
		affected_segment: farVoterCount > 0 || missingBoothLocationVoterCount > 0 || memberLocationMissingVoterCount > 0,
	};
}

const toRouteKey = (row: Pick<BoothDistanceRow, 'member_lat' | 'member_lng' | 'booth_lat' | 'booth_lng'>) =>
	`${row.member_lat}:${row.member_lng}:${row.booth_lat}:${row.booth_lng}`;

async function fetchGoogleRoadDistanceMeters(
	memberLat: number,
	memberLng: number,
	boothLat: number,
	boothLng: number,
): Promise<number | null> {
	if (!env.googleMapsApiKey) return null;

	const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': env.googleMapsApiKey,
			'X-Goog-FieldMask': 'routes.distanceMeters',
		},
		body: JSON.stringify({
			origin: {
				location: {
					latLng: {
						latitude: memberLat,
						longitude: memberLng,
					},
				},
			},
			destination: {
				location: {
					latLng: {
						latitude: boothLat,
						longitude: boothLng,
					},
				},
			},
			travelMode: 'DRIVE',
			routingPreference: 'TRAFFIC_UNAWARE',
			units: 'METRIC',
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => '');
		logger.warn(
			{
				status: response.status,
				body: text.slice(0, 300),
			},
			'Google road distance request failed; falling back to geodesic distance',
		);
		return null;
	}

	const payload = (await response.json()) as {routes?: Array<{distanceMeters?: number}>};
	const distanceMeters = payload.routes?.[0]?.distanceMeters;
	return Number.isFinite(Number(distanceMeters)) ? Number(distanceMeters) : null;
}

async function fetchRoadDistancesByRouteKey(rows: BoothDistanceRow[]): Promise<Map<string, number | null>> {
	const roadDistances = new Map<string, number | null>();
	if (env.boothDistanceCalculationType !== 'road' || !env.googleMapsApiKey) return roadDistances;

	const uniqueRouteRows = rows.filter(
		(row) =>
			row.booth_location_status === 'available' &&
			row.member_lat !== null &&
			row.member_lng !== null &&
			row.booth_lat !== null &&
			row.booth_lng !== null &&
			!roadDistances.has(toRouteKey(row)),
	);

	// Keep concurrency modest to avoid rate spikes when a run contains many families.
	for (let index = 0; index < uniqueRouteRows.length; index += 5) {
		const chunk = uniqueRouteRows.slice(index, index + 5);
		const results = await Promise.all(
			chunk.map(async (row) => {
				const distance = await fetchGoogleRoadDistanceMeters(
					row.member_lat as number,
					row.member_lng as number,
					row.booth_lat as number,
					row.booth_lng as number,
				).catch(() => null);
				return {key: toRouteKey(row), distance};
			}),
		);
		results.forEach(({key, distance}) => {
			roadDistances.set(key, distance);
		});
	}

	return roadDistances;
}

export async function persistBoothDistanceMetadata(
	client: DbClient,
	segmentIds: string[],
	thresholdMeters: number = BOOTH_DISTANCE_THRESHOLD_METERS,
): Promise<void> {
	if (segmentIds.length === 0) return;

	const result = await client.query<BoothDistanceRow>(
		`
		SELECT
			sm.segment_id::text AS segment_id,
			v.id::text AS voter_id,
			sm.family_id::text AS family_id,
			v.booth_id::text AS booth_id,
			b.booth_name,
			b.booth_number,
			CASE
				WHEN f.latitude IS NOT NULL AND f.longitude IS NOT NULL THEN f.latitude::float8
				WHEN v.location IS NOT NULL THEN ST_Y(v.location)::float8
				WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN v.latitude::float8
				ELSE NULL
			END AS member_lat,
			CASE
				WHEN f.latitude IS NOT NULL AND f.longitude IS NOT NULL THEN f.longitude::float8
				WHEN v.location IS NOT NULL THEN ST_X(v.location)::float8
				WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN v.longitude::float8
				ELSE NULL
			END AS member_lng,
			CASE
				WHEN b.location IS NOT NULL THEN ST_Y(b.location)::float8
				WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN b.latitude::float8
				ELSE NULL
			END AS booth_lat,
			CASE
				WHEN b.location IS NOT NULL THEN ST_X(b.location)::float8
				WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN b.longitude::float8
				ELSE NULL
			END AS booth_lng,
			CASE
				WHEN (
					b.location IS NULL
					AND (b.latitude IS NULL OR b.longitude IS NULL)
				) THEN 'missing'
				WHEN (
					(f.latitude IS NULL OR f.longitude IS NULL)
					AND v.location IS NULL
					AND (v.latitude IS NULL OR v.longitude IS NULL)
				) THEN 'member_location_missing'
				ELSE 'available'
			END AS booth_location_status,
			CASE
				WHEN (
					(
						b.location IS NOT NULL
						OR (b.latitude IS NOT NULL AND b.longitude IS NOT NULL)
					)
					AND (
						(f.latitude IS NOT NULL AND f.longitude IS NOT NULL)
						OR v.location IS NOT NULL
						OR (v.latitude IS NOT NULL AND v.longitude IS NOT NULL)
					)
				)
				THEN ST_Distance(
					COALESCE(
						b.location,
						ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326)
					)::geography,
					COALESCE(
						CASE
							WHEN f.latitude IS NOT NULL AND f.longitude IS NOT NULL
								THEN ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326)
							ELSE NULL
						END,
						v.location,
						CASE
							WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL
								THEN ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)
							ELSE NULL
						END
					)::geography
				)::float8
				ELSE NULL
			END AS geodesic_distance_meters
		FROM segment_members sm
		JOIN voters v
			ON (
				(sm.family_id IS NOT NULL AND v.family_id = sm.family_id)
				OR (sm.voter_id IS NOT NULL AND v.id = sm.voter_id)
			)
		LEFT JOIN families f ON f.id = sm.family_id
		LEFT JOIN booths b ON b.id = v.booth_id
		WHERE sm.segment_id = ANY($1::uuid[])
		ORDER BY sm.segment_id, v.id
		`,
		[segmentIds],
	);

	const requestedDistanceCalculationType = env.boothDistanceCalculationType;
	const distanceCalculationType: BoothDistanceCalculationType =
		requestedDistanceCalculationType === 'road' && !env.googleMapsApiKey ? 'geodesic' : requestedDistanceCalculationType;
	if (requestedDistanceCalculationType === 'road' && !env.googleMapsApiKey) {
		logger.warn('BOOTH_DISTANCE_CALCULATION_TYPE=road requested without GOOGLE_MAPS_API_KEY; falling back to geodesic distance');
	}
	const roadDistancesByRouteKey =
		distanceCalculationType === 'road' ? await fetchRoadDistancesByRouteKey(result.rows) : new Map<string, number | null>();

	const metadataBySegment = new Map<string, BoothDistanceMetadata>();

	for (const segmentId of segmentIds) {
		metadataBySegment.set(
			segmentId,
			createEmptyBoothDistanceMetadata(thresholdMeters, distanceCalculationType, requestedDistanceCalculationType),
		);
	}

	for (const row of result.rows) {
		const metadata =
			metadataBySegment.get(row.segment_id) ??
			createEmptyBoothDistanceMetadata(thresholdMeters, distanceCalculationType, requestedDistanceCalculationType);
		const roadDistanceMeters =
			row.booth_location_status === 'available' &&
			row.member_lat !== null &&
			row.member_lng !== null &&
			row.booth_lat !== null &&
			row.booth_lng !== null
				? roadDistancesByRouteKey.get(toRouteKey(row)) ?? null
				: null;
		const activeDistanceMeters =
			distanceCalculationType === 'road'
				? roadDistanceMeters ?? row.geodesic_distance_meters
				: row.geodesic_distance_meters;
		const activeDistanceCalculationType: BoothDistanceCalculationType =
			distanceCalculationType === 'road' && roadDistanceMeters !== null ? 'road' : 'geodesic';

		if (row.booth_location_status === 'missing') {
			metadata.missing_booth_location_voter_ids.push(row.voter_id);
			if (row.booth_id && !metadata.missing_booth_location_booth_ids.includes(row.booth_id)) {
				metadata.missing_booth_location_booth_ids.push(row.booth_id);
			}
		} else if (row.booth_location_status === 'member_location_missing') {
			metadata.member_location_missing_voter_ids.push(row.voter_id);
		} else if (activeDistanceMeters !== null && activeDistanceMeters >= thresholdMeters) {
			metadata.far_voter_ids.push(row.voter_id);
			metadata.far_voters.push({
				voter_id: row.voter_id,
				family_id: row.family_id,
				booth_id: row.booth_id,
				booth_name: row.booth_name,
				booth_number: row.booth_number,
				geodesic_distance_meters: row.geodesic_distance_meters,
				road_distance_meters: roadDistanceMeters,
				distance_meters: activeDistanceMeters,
				distance_calculation_type: activeDistanceCalculationType,
				booth_location_status: row.booth_location_status,
			});
		}

		metadataBySegment.set(row.segment_id, metadata);
	}

	for (const [segmentId, metadata] of metadataBySegment.entries()) {
		metadata.far_voter_count = metadata.far_voters.length;
		metadata.missing_booth_location_voter_count = metadata.missing_booth_location_voter_ids.length;
		metadata.member_location_missing_voter_count = metadata.member_location_missing_voter_ids.length;
		metadata.has_far_voters = metadata.far_voter_count > 0;
		metadata.has_missing_booth_location = metadata.missing_booth_location_voter_count > 0;
		metadata.has_member_location_missing = metadata.member_location_missing_voter_count > 0;
		metadata.affected_segment =
			metadata.has_far_voters || metadata.has_missing_booth_location || metadata.has_member_location_missing;

		await client.query(
			`
			UPDATE segments
			SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('booth_distance', $2::jsonb),
			    updated_at = NOW()
			WHERE id = $1::uuid
			`,
			[segmentId, JSON.stringify(metadata)],
		);
	}
}
