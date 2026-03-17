import type {BoothGridDebugRegion, BoothGridDebugSegment, BoothGridDebugSnapshot, Segment} from '../types/api';
import {getSegmentCode} from './segmentUtils';

export const findDebugSegmentByCode = (
	snapshot: BoothGridDebugSnapshot | null,
	selectedSegmentCode: string | null,
): BoothGridDebugSegment | null => {
	if (!snapshot) return null;
	if (!selectedSegmentCode) {
		return snapshot.segments.length === 1 ? snapshot.segments[0] : null;
	}
	return snapshot.segments.find((segment) => segment.segment_code === selectedSegmentCode) ?? null;
};

export const findDebugRegionByCode = (
	snapshot: BoothGridDebugSnapshot | null,
	selectedSegmentCode: string | null,
): BoothGridDebugRegion | null => {
	if (!snapshot) return null;

	const debugSegment = findDebugSegmentByCode(snapshot, selectedSegmentCode);
	if (!debugSegment) {
		return snapshot.regions.length === 1 ? snapshot.regions[0] : null;
	}

	return snapshot.regions.find((region) => region.region_id === debugSegment.source_region_id) ?? null;
};

export const findDebugRegionForSegment = (
	snapshot: BoothGridDebugSnapshot | null,
	selectedSegment: Segment | null,
): BoothGridDebugRegion | null => {
	const selectedCode = selectedSegment ? getSegmentCode(selectedSegment) : null;
	return findDebugRegionByCode(snapshot, selectedCode);
};
