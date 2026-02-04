import type {Segment, SegmentMember} from '../../types/api';
import type {WedgeGeometry} from './WedgeGenerator';
import {getSegmentBoundary, getSegmentCentroidLatLng, getSegmentCode, getSegmentMembers, getSegmentVoterCount} from '../../services/segmentUtils';

export const darkMapStyles: google.maps.MapTypeStyle[] = [
	{elementType: 'geometry', stylers: [{color: '#0f172a'}]},
	{elementType: 'labels.text.fill', stylers: [{color: '#94a3b8'}]},
	{elementType: 'labels.text.stroke', stylers: [{color: '#0b1120'}]},
	{featureType: 'administrative', elementType: 'geometry', stylers: [{color: '#1e293b'}]},
	{featureType: 'poi', elementType: 'labels.text.fill', stylers: [{color: '#64748b'}]},
	{featureType: 'poi.park', elementType: 'geometry', stylers: [{color: '#111827'}]},
	{featureType: 'road', elementType: 'geometry', stylers: [{color: '#1f2937'}]},
	{featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#0f172a'}]},
	{featureType: 'road', elementType: 'labels.text.fill', stylers: [{color: '#9ca3af'}]},
	{featureType: 'water', elementType: 'geometry', stylers: [{color: '#0b1120'}]},
	{featureType: 'water', elementType: 'labels.text.fill', stylers: [{color: '#475569'}]},
];

const toNumber = (value: unknown) => {
	if (value === null || value === undefined) return null;
	const numeric = Number(value);
	if (!Number.isNaN(numeric)) return numeric;
	const parsed = Number.parseFloat(String(value));
	return Number.isNaN(parsed) ? null : parsed;
};

export const getMemberLatLng = (member: SegmentMember) => {
	const metadata = member.metadata as Record<string, unknown> | undefined;
	const latRaw = member.latitude ?? (metadata?.latitude as unknown) ?? (metadata?.lat as unknown);
	const lngRaw = member.longitude ?? (metadata?.longitude as unknown) ?? (metadata?.lng as unknown);
	const lat = toNumber(latRaw);
	const lng = toNumber(lngRaw);
	if (lat !== null && lng !== null) return {lat, lng};

	const location = metadata?.location as {type?: string; coordinates?: unknown} | [unknown, unknown] | undefined;
	if (Array.isArray(location) && location.length >= 2) {
		const locLng = toNumber(location[0]);
		const locLat = toNumber(location[1]);
		return locLat !== null && locLng !== null ? {lat: locLat, lng: locLng} : null;
	}
	if (location && typeof location === 'object' && Array.isArray((location as {coordinates?: unknown}).coordinates)) {
		const coordinates = (location as {coordinates?: unknown}).coordinates as unknown[];
		if (coordinates.length >= 2) {
			const locLng = toNumber(coordinates[0]);
			const locLat = toNumber(coordinates[1]);
			return locLat !== null && locLng !== null ? {lat: locLat, lng: locLng} : null;
		}
	}
	return null;
};

export const toLatLngArray = (geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => {
	if ('type' in geometry && geometry.type === 'Feature') {
		return toLatLngArray(geometry.geometry);
	}
	if ('type' in geometry && geometry.type === 'FeatureCollection') {
		const first = geometry.features[0]?.geometry;
		return first ? toLatLngArray(first) : [];
	}
	if (geometry.type === 'Polygon') {
		return geometry.coordinates[0].map(([lng, lat]) => ({lat, lng}));
	}
	if (geometry.type === 'MultiPolygon') {
		return geometry.coordinates[0]?.[0]?.map(([lng, lat]) => ({lat, lng})) ?? [];
	}
	return [];
};

export const getSegmentBounds = (segment: Segment) => {
	const bounds = new google.maps.LatLngBounds();

	// Prefer geometry (wedge) over boundary if available
	if (segment.geometry) {
		const path = toLatLngArray(segment.geometry);
		path.forEach((point) => bounds.extend(point));
		if (!bounds.isEmpty()) return bounds;
	}

	// Fallback to boundary
	const boundary = getSegmentBoundary(segment);
	if (boundary) {
		const path = toLatLngArray(boundary);
		path.forEach((point) => bounds.extend(point));
	}

	// Include member locations
	const members = getSegmentMembers(segment);
	members.forEach((member) => {
		const position = getMemberLatLng(member);
		if (position) bounds.extend(position);
	});

	// Include centroid as fallback
	const centroid = getSegmentCentroidLatLng(segment);
	if (centroid) bounds.extend(centroid);
	return bounds;
};

export const getSegmentsBoundsFromCentroids = (segments: Segment[]) => {
	const bounds = new google.maps.LatLngBounds();
	segments.forEach((segment) => {
		const centroid = getSegmentCentroidLatLng(segment);
		if (centroid) bounds.extend(centroid);
	});
	return bounds;
};

export const getSegmentPoints = (segment: Segment) => {
	const points: {lat: number; lng: number}[] = [];
	const members = getSegmentMembers(segment);
	members.forEach((member) => {
		const position = getMemberLatLng(member);
		if (position) points.push(position);
	});
	const centroid = getSegmentCentroidLatLng(segment);
	if (centroid) points.push(centroid);
	return points;
};

const cross = (o: {lat: number; lng: number}, a: {lat: number; lng: number}, b: {lat: number; lng: number}) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

export const buildConvexHull = (points: {lat: number; lng: number}[]) => {
	if (points.length < 3) return points;
	const sorted = [...points].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));
	const lower: {lat: number; lng: number}[] = [];
	sorted.forEach((point) => {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
			lower.pop();
		}
		lower.push(point);
	});
	const upper: {lat: number; lng: number}[] = [];
	for (let i = sorted.length - 1; i >= 0; i -= 1) {
		const point = sorted[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
			upper.pop();
		}
		upper.push(point);
	}
	upper.pop();
	lower.pop();
	return lower.concat(upper);
};

export const getBoundingBoxPath = (points: {lat: number; lng: number}[]) => {
	if (!points.length) return [];
	const lats = points.map((point) => point.lat);
	const lngs = points.map((point) => point.lng);
	const minLat = Math.min(...lats);
	const maxLat = Math.max(...lats);
	const minLng = Math.min(...lngs);
	const maxLng = Math.max(...lngs);
	return [
		{lat: minLat, lng: minLng},
		{lat: minLat, lng: maxLng},
		{lat: maxLat, lng: maxLng},
		{lat: maxLat, lng: minLng},
		{lat: minLat, lng: minLng},
	];
};

export const hashToColor = (value: string, version: number | null | undefined) => {
	const input = `${value}-${version ?? 'na'}`;
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 70%, 55%)`;
};

export const buildSegmentTooltip = (segment: Segment) => {
	const code = getSegmentCode(segment);
	const voters = getSegmentVoterCount(segment);
	return `
		<div style="font-size:12px;color:#0f172a">
			<div><strong>${code}</strong></div>
			<div>Voters: ${voters}</div>
		</div>
	`;
};

const formatAngle = (angleRad: number) => ((angleRad * 180) / Math.PI + 360) % 360;

const formatMeters = (meters: number) => {
	if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
	return `${Math.round(meters)} m`;
};

export const buildWedgeTooltip = (segment: Segment, geometry: WedgeGeometry) => {
	const code = getSegmentCode(segment);
	const voters = getSegmentVoterCount(segment);
	const minDeg = formatAngle(geometry.minAngle);
	const maxDeg = formatAngle(geometry.maxAngle);
	const spanDeg = (geometry.angleSpan * 180) / Math.PI;
	return `
		<div style="font-size:12px;color:#0f172a">
			<div><strong>${code}</strong></div>
			<div>Voters: ${voters}</div>
			<div>Angle: ${minDeg.toFixed(1)}° → ${maxDeg.toFixed(1)}° (${spanDeg.toFixed(1)}°)</div>
			<div>Radius: ${formatMeters(geometry.radiusMeters)}</div>
		</div>
	`;
};

export const computeClusteringIndex = (segment: Segment) => {
	const centroid = getSegmentCentroidLatLng(segment);
	if (!centroid) return null;
	const members = getSegmentMembers(segment);
	if (!members.length) return null;
	const distances: number[] = [];
	members.forEach((member) => {
		const position = getMemberLatLng(member);
		if (!position) return;
		const dx = position.lng - centroid.lng;
		const dy = position.lat - centroid.lat;
		distances.push(Math.sqrt(dx * dx + dy * dy));
	});
	if (!distances.length) return null;
	const avg = distances.reduce((sum, value) => sum + value, 0) / distances.length;
	return avg;
};

export const buildCentroidLabel = (segment: Segment) => {
	const code = getSegmentCode(segment);
	const voters = getSegmentVoterCount(segment);
	return `
		<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
			<div style="font-weight:700;font-size:12px;color:#e2e8f0">${code}</div>
			<div style="font-size:10px;color:#cbd5f5">${voters} voters</div>
		</div>
	`;
};
