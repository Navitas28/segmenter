import type {Segment} from '../../types/api';
import {getSegmentCentroidLatLng, getSegmentMembers} from '../../services/segmentUtils';
import {getMemberLatLng, toLatLngArray} from './utils';

export type WedgeGeometry = {
	segmentId: string;
	center: google.maps.LatLngLiteral;
	minAngle: number;
	maxAngle: number;
	angleSpan: number;
	radiusMeters: number;
	path: google.maps.LatLngLiteral[];
	labelPosition: google.maps.LatLngLiteral;
};

const EARTH_RADIUS_METERS = 6378137;
const ARC_STEPS = 30;
const DEFAULT_RADIUS_METERS = 250;

const toNumber = (value: unknown) => {
	if (value === null || value === undefined) return null;
	const numeric = Number(value);
	if (!Number.isNaN(numeric)) return numeric;
	const parsed = Number.parseFloat(String(value));
	return Number.isNaN(parsed) ? null : parsed;
};

const toRadiansIfNeeded = (value: number) => (Math.abs(value) > Math.PI * 2 + 0.001 ? (value * Math.PI) / 180 : value);

const normalizeAngleRange = (minAngle: number, maxAngle: number) => {
	const min = toRadiansIfNeeded(minAngle);
	const max = toRadiansIfNeeded(maxAngle);
	if (Number.isNaN(min) || Number.isNaN(max)) return null;
	const normalizedMax = max < min ? max + Math.PI * 2 : max;
	return {min, max: normalizedMax, span: normalizedMax - min};
};

const extractAngle = (segment: Segment, keys: string[]) => {
	const metadata = segment.metadata ?? {};
	for (const key of keys) {
		const value = toNumber((metadata as Record<string, unknown>)[key]);
		if (value !== null) return value;
	}
	return null;
};

const getSegmentAngleRange = (segment: Segment) => {
	const minRaw = extractAngle(segment, ['min_angle', 'minAngle', 'angle_min', 'angleStart', 'start_angle', 'startAngle']) ?? extractAngle(segment, ['min_theta', 'theta_min', 'thetaStart']);
	const maxRaw = extractAngle(segment, ['max_angle', 'maxAngle', 'angle_max', 'angleEnd', 'end_angle', 'endAngle']) ?? extractAngle(segment, ['max_theta', 'theta_max', 'thetaEnd']);
	if (minRaw === null || maxRaw === null) return null;
	return normalizeAngleRange(minRaw, maxRaw);
};

const getGlobalCentroid = (segment: Segment) => {
	const metadata = segment.metadata as Record<string, unknown> | undefined;
	const latKeys = ['global_centroid_lat', 'global_center_lat', 'center_lat', 'overall_centroid_lat'];
	const lngKeys = ['global_centroid_lng', 'global_center_lng', 'center_lng', 'overall_centroid_lng'];

	if (metadata) {
		for (const key of latKeys) {
			const lat = toNumber(metadata[key]);
			if (lat !== null) {
				for (const lngKey of lngKeys) {
					const lng = toNumber(metadata[lngKey]);
					if (lng !== null) return {lat, lng};
				}
			}
		}

		const globalCentroid = metadata.global_centroid as {lat?: unknown; lng?: unknown; coordinates?: unknown} | [unknown, unknown] | undefined;
		if (Array.isArray(globalCentroid) && globalCentroid.length >= 2) {
			const lng = toNumber(globalCentroid[0]);
			const lat = toNumber(globalCentroid[1]);
			if (lat !== null && lng !== null) return {lat, lng};
		}
		if (globalCentroid && typeof globalCentroid === 'object') {
			const lat = toNumber(globalCentroid.lat);
			const lng = toNumber(globalCentroid.lng);
			if (lat !== null && lng !== null) return {lat, lng};
			const coordinates = (globalCentroid as {coordinates?: unknown}).coordinates;
			if (Array.isArray(coordinates) && coordinates.length >= 2) {
				const coordLng = toNumber(coordinates[0]);
				const coordLat = toNumber(coordinates[1]);
				if (coordLat !== null && coordLng !== null) return {lat: coordLat, lng: coordLng};
			}
		}
	}

	return getSegmentCentroidLatLng(segment);
};

const haversineMeters = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) => {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const dLat = lat2 - lat1;
	const dLng = toRad(b.lng - a.lng);
	const sinLat = Math.sin(dLat / 2);
	const sinLng = Math.sin(dLng / 2);
	const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
	return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const getRadiusMeters = (segment: Segment, center: google.maps.LatLngLiteral) => {
	const metadata = segment.metadata as Record<string, unknown> | undefined;
	const candidates = [metadata?.radius_m, metadata?.radiusMeters, metadata?.max_distance_m, metadata?.max_distance_meters, metadata?.max_distance, metadata?.maxDistance];
	for (const value of candidates) {
		const numeric = toNumber(value);
		if (numeric !== null && numeric > 0) return numeric;
	}

	const members = getSegmentMembers(segment);
	let maxDistance = 0;
	members.forEach((member) => {
		const position = getMemberLatLng(member);
		if (!position) return;
		const distance = haversineMeters(center, position);
		if (distance > maxDistance) maxDistance = distance;
	});
	return maxDistance > 0 ? maxDistance : DEFAULT_RADIUS_METERS;
};

const metersToLatLngOffset = (meters: number, baseLat: number) => {
	const latOffset = (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
	const lngOffset = (meters / (EARTH_RADIUS_METERS * Math.cos((baseLat * Math.PI) / 180))) * (180 / Math.PI);
	return {latOffset, lngOffset};
};

const buildArcPoints = (center: google.maps.LatLngLiteral, minAngle: number, span: number, radiusMeters: number) => {
	const points: google.maps.LatLngLiteral[] = [];
	for (let i = 0; i <= ARC_STEPS; i += 1) {
		const angle = minAngle + (i / ARC_STEPS) * span;
		const latMeters = radiusMeters * Math.cos(angle);
		const lngMeters = radiusMeters * Math.sin(angle);
		const {latOffset} = metersToLatLngOffset(latMeters, center.lat);
		const {lngOffset} = metersToLatLngOffset(lngMeters, center.lat);
		points.push({
			lat: center.lat + latOffset,
			lng: center.lng + lngOffset,
		});
	}
	return points;
};

const buildLabelPosition = (center: google.maps.LatLngLiteral, minAngle: number, span: number, radiusMeters: number) => {
	const midAngle = minAngle + span / 2;
	const labelRadius = radiusMeters * 0.6;
	const latMeters = labelRadius * Math.cos(midAngle);
	const lngMeters = labelRadius * Math.sin(midAngle);
	const {latOffset} = metersToLatLngOffset(latMeters, center.lat);
	const {lngOffset} = metersToLatLngOffset(lngMeters, center.lat);
	return {lat: center.lat + latOffset, lng: center.lng + lngOffset};
};

/**
 * Build wedge geometry from persisted geometry column (preferred method)
 */
export const buildWedgeGeometryFromGeometry = (segment: Segment): WedgeGeometry | null => {
	// Use persisted geometry if available
	if (segment.geometry) {
		const path = toLatLngArray(segment.geometry);
		if (path.length === 0) return null;

		// Extract center (first point in the wedge polygon)
		const center = path[0];
		if (!center) return null;

		// Extract angles from metadata if available
		const metadata = segment.metadata as Record<string, unknown> | undefined;
		const minAngle = toNumber(metadata?.min_angle);
		const maxAngle = toNumber(metadata?.max_angle);

		// Compute bounds to get radius
		let maxDistance = 0;
		path.forEach((point) => {
			const distance = haversineMeters(center, point);
			if (distance > maxDistance) maxDistance = distance;
		});

		const radiusMeters = maxDistance > 0 ? maxDistance : DEFAULT_RADIUS_METERS;
		const angleSpan = minAngle !== null && maxAngle !== null ? maxAngle - minAngle : Math.PI / 6;
		const effectiveMinAngle = minAngle ?? 0;
		const effectiveMaxAngle = maxAngle ?? angleSpan;

		return {
			segmentId: segment.id,
			center,
			minAngle: effectiveMinAngle,
			maxAngle: effectiveMaxAngle,
			angleSpan,
			radiusMeters,
			path,
			labelPosition: buildLabelPosition(center, effectiveMinAngle, angleSpan, radiusMeters),
		};
	}

	return null;
};

/**
 * Build wedge geometry from segment metadata (fallback method)
 */
export const buildWedgeGeometryFromMetadata = (segment: Segment): WedgeGeometry | null => {
	const center = getGlobalCentroid(segment);
	if (!center) return null;
	const angleRange = getSegmentAngleRange(segment);
	if (!angleRange) return null;
	const radiusMeters = getRadiusMeters(segment, center);
	const arcPoints = buildArcPoints(center, angleRange.min, angleRange.span, radiusMeters);
	if (!arcPoints.length) return null;
	return {
		segmentId: segment.id,
		center,
		minAngle: angleRange.min,
		maxAngle: angleRange.max,
		angleSpan: angleRange.span,
		radiusMeters,
		path: [center, ...arcPoints, center],
		labelPosition: buildLabelPosition(center, angleRange.min, angleRange.span, radiusMeters),
	};
};

/**
 * Build wedge geometry with fallback support
 * Tries persisted geometry first, falls back to metadata-based computation
 */
export const buildWedgeGeometry = (segment: Segment): WedgeGeometry | null => {
	// Try persisted geometry first
	const geometryBased = buildWedgeGeometryFromGeometry(segment);
	if (geometryBased) return geometryBased;

	// Fallback to metadata-based computation
	return buildWedgeGeometryFromMetadata(segment);
};

export const buildWedgeGeometries = (segments: Segment[]) => {
	const geometries = new Map<string, WedgeGeometry>();
	segments.forEach((segment) => {
		const geometry = buildWedgeGeometry(segment);
		if (geometry) geometries.set(segment.id, geometry);
	});
	return geometries;
};

export const getWedgeBounds = (geometry: WedgeGeometry) => {
	const bounds = new google.maps.LatLngBounds();
	geometry.path.forEach((point) => bounds.extend(point));
	return bounds;
};

export const getWedgesBounds = (geometries: Iterable<WedgeGeometry>) => {
	const bounds = new google.maps.LatLngBounds();
	for (const geometry of geometries) {
		geometry.path.forEach((point) => bounds.extend(point));
	}
	return bounds;
};
