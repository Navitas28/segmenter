import type {Segment, SegmentMember} from '../types/api';

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

export const buildIntegrityReport = (segments: Segment[]) => {
	const tooLarge: Segment[] = [];
	const tooSmall: Segment[] = [];
	const duplicateVoters = new Set<string>();
	const voterIds = new Set<string>();
	let missingMembers = false;

	segments.forEach((segment) => {
		const voterCount = getSegmentVoterCount(segment);
		if (voterCount > 150) tooLarge.push(segment);
		if (voterCount > 0 && voterCount < 80) tooSmall.push(segment);

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
	};
};
