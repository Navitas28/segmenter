import type {Segment, SegmentMember} from '../types/api';
import type * as GeoJSON from 'geojson';

type BoothDistanceMetadata = {
	threshold_meters: number;
	distance_calculation_type: 'geodesic' | 'road';
	far_voter_count: number;
	missing_booth_location_voter_count: number;
	member_location_missing_voter_count: number;
	far_voter_ids: string[];
	missing_booth_location_voter_ids: string[];
	member_location_missing_voter_ids: string[];
	affected_segment: boolean;
};

export const getSegmentHash = (segment: Segment) => segment.segment_hash ?? segment.hash ?? (segment.metadata?.segment_hash as string | undefined) ?? (segment.metadata?.hash as string | undefined) ?? null;

export const getSegmentCode = (segment: Segment) => segment.segment_code ?? (segment.metadata?.segment_code as string | undefined) ?? segment.segment_name ?? String(segment.id);

export const getSegmentVoterCount = (segment: Segment) => Number(segment.total_voters ?? segment.metadata?.total_voters ?? segment.metadata?.voter_count ?? segment.metadata?.voters_count ?? 0);

export const getSegmentFamilyCount = (segment: Segment) => Number(segment.total_families ?? segment.metadata?.total_families ?? segment.metadata?.family_count ?? segment.metadata?.families_count ?? 0);

export const getSegmentMembers = (segment: Segment): SegmentMember[] => {
	const members = segment.members ?? segment.voters ?? (segment.metadata?.members as SegmentMember[] | undefined);
	return members ?? [];
};

/** Returns geometry for map display. Prefers contiguous blocks (geometry) over convex hull (boundary_geojson). */
export const getSegmentBoundary = (segment: Segment) =>
	segment.geometry ??
	(segment.metadata?.geometry as GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | undefined) ??
	segment.boundary_geojson ??
	(segment.metadata?.boundary_geojson as GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | undefined) ??
	(segment.metadata?.boundaryGeoJson as GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | undefined) ??
	null;

export const getSegmentCentroid = (segment: Segment) =>
	segment.centroid_geojson ??
	(segment.metadata?.centroid_geojson as GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | undefined) ??
	(segment.metadata?.centroidGeoJson as GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | undefined) ??
	null;

export const getSegmentCentroidLatLng = (segment: Segment) => {
	const lat = segment.centroid_lat ?? (segment.metadata?.centroid_lat as number | undefined);
	const lng = segment.centroid_lng ?? (segment.metadata?.centroid_lng as number | undefined);
	return lat !== null && lat !== undefined && lng !== null && lng !== undefined ? {lat: Number(lat), lng: Number(lng)} : null;
};

export const getBoothDistanceMetadata = (segment: Segment): BoothDistanceMetadata => {
	const source = (segment.metadata?.booth_distance as Record<string, unknown> | undefined) ?? {};
	const farVoterIds = Array.isArray(source.far_voter_ids) ? source.far_voter_ids.map(String) : [];
	const missingBoothLocationVoterIds = Array.isArray(source.missing_booth_location_voter_ids)
		? source.missing_booth_location_voter_ids.map(String)
		: [];
	const memberLocationMissingVoterIds = Array.isArray(source.member_location_missing_voter_ids)
		? source.member_location_missing_voter_ids.map(String)
		: [];
	const inferredAffectedSegment =
		farVoterIds.length > 0 || missingBoothLocationVoterIds.length > 0 || memberLocationMissingVoterIds.length > 0;

	return {
		threshold_meters: Number(source.threshold_meters ?? 2000),
		distance_calculation_type: source.distance_calculation_type === 'road' ? 'road' : 'geodesic',
		far_voter_count: Number(segment.far_voter_count ?? source.far_voter_count ?? farVoterIds.length ?? 0),
		missing_booth_location_voter_count: Number(
			segment.missing_booth_location_voter_count ?? source.missing_booth_location_voter_count ?? missingBoothLocationVoterIds.length ?? 0,
		),
		member_location_missing_voter_count: Number(
			segment.member_location_missing_voter_count ?? source.member_location_missing_voter_count ?? memberLocationMissingVoterIds.length ?? 0,
		),
		far_voter_ids: farVoterIds,
		missing_booth_location_voter_ids: missingBoothLocationVoterIds,
		member_location_missing_voter_ids: memberLocationMissingVoterIds,
		affected_segment: Boolean(segment.has_booth_distance_issues ?? source.affected_segment ?? inferredAffectedSegment),
	};
};

export const getSegmentFarVoterCount = (segment: Segment) => getBoothDistanceMetadata(segment).far_voter_count;

export const getSegmentMissingBoothLocationCount = (segment: Segment) => getBoothDistanceMetadata(segment).missing_booth_location_voter_count;

export const getSegmentMemberLocationMissingCount = (segment: Segment) => getBoothDistanceMetadata(segment).member_location_missing_voter_count;

export const buildIntegrityReport = (segments: Segment[]) => {
	const tooLarge: Segment[] = [];
	const tooSmall: Segment[] = [];
	const duplicateVoters = new Set<string>();
	const voterIds = new Set<string>();
	let missingMembers = false;
	let farVoters = 0;
	let missingBoothLocations = 0;

	segments.forEach((segment) => {
		const voterCount = getSegmentVoterCount(segment);
		if (voterCount > 150) tooLarge.push(segment);
		if (voterCount > 0 && voterCount < 80) tooSmall.push(segment);
		farVoters += getSegmentFarVoterCount(segment);
		missingBoothLocations += getSegmentMissingBoothLocationCount(segment);

		const members = getSegmentMembers(segment);
		if (!members.length) {
			missingMembers = true;
			return;
		}
		members.forEach((member) => {
			const id = member.voter_id ?? (member.metadata?.voter_id as string | undefined);
			if (!id) return;
			if (voterIds.has(id)) {
				duplicateVoters.add(id);
			} else {
				voterIds.add(id);
			}
		});
	});

	return {
		tooLarge,
		tooSmall,
		duplicateVoters: Array.from(duplicateVoters),
		missingMembers,
		farVoters,
		missingBoothLocations,
	};
};
