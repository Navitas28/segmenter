import {useEffect, useMemo, useRef} from 'react';
import type {Segment} from '../../types/api';
import {buildConvexHull, buildWedgeTooltip, getBoundingBoxPath, getSegmentPoints, hashToColor} from './utils';
import {getSegmentCode} from '../../services/segmentUtils';
import type {WedgeGeometry} from './WedgeGenerator';
import {getWedgeBounds} from './WedgeGenerator';

type DebugOptions = {
	showRawGeometry: boolean;
	showCentroidCoords: boolean;
	showBoundingBoxes: boolean;
	showClusteringIndex: boolean;
};

type BoundaryLayerProps = {
	map: google.maps.Map;
	segments: Segment[];
	wedgeGeometries: Map<string, WedgeGeometry>;
	selectedSegmentId: string | null;
	hoveredSegmentId: string | null;
	onSelectSegment: (segmentId: string) => void;
	onHoverSegment: (segmentId: string | null) => void;
	showBoundaries: boolean;
	showAllBoundaries: boolean;
	boundaryStyle: 'wedge' | 'bbox' | 'convexhull';
	showGeometryBounds: boolean;
	visualizationMode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	version: number | null;
	infoWindow: google.maps.InfoWindow | null;
	debugOptions: DebugOptions;
};

type OverlaySet = {
	polygons: google.maps.Polygon[];
	polylines: google.maps.Polyline[];
};

const BoundaryLayer = ({
	map,
	segments,
	wedgeGeometries,
	selectedSegmentId,
	hoveredSegmentId,
	onSelectSegment,
	onHoverSegment,
	showBoundaries,
	showAllBoundaries,
	boundaryStyle,
	showGeometryBounds,
	visualizationMode,
	version,
	infoWindow,
	debugOptions,
}: BoundaryLayerProps) => {
	const overlaysRef = useRef<OverlaySet>({polygons: [], polylines: []});

	const visibleSegments = useMemo(() => {
		if (showAllBoundaries) return segments;
		if (visualizationMode === 'operational') return segments;
		if (visualizationMode === 'responsibility' && selectedSegmentId) {
			return segments.filter((segment) => segment.id === selectedSegmentId);
		}
		return segments;
	}, [segments, visualizationMode, selectedSegmentId, showAllBoundaries]);

	useEffect(() => {
		overlaysRef.current.polygons.forEach((polygon) => polygon.setMap(null));
		overlaysRef.current.polylines.forEach((line) => line.setMap(null));
		overlaysRef.current = {polygons: [], polylines: []};

		if (!showBoundaries && !showAllBoundaries) return;

		visibleSegments.forEach((segment) => {
			const geometry = wedgeGeometries.get(segment.id);
			if (!geometry) return;

			// Determine which path to use based on boundary style
			let path: google.maps.LatLngLiteral[];
			if (boundaryStyle === 'wedge') {
				path = geometry.path;
			} else if (boundaryStyle === 'bbox') {
				const points = getSegmentPoints(segment);
				path = points.length ? getBoundingBoxPath(points) : geometry.path;
			} else {
				// convexhull
				const points = getSegmentPoints(segment);
				path = points.length >= 3 ? buildConvexHull(points) : geometry.path;
			}

			const isSelected = segment.id === selectedSegmentId;
			const isHovered = segment.id === hoveredSegmentId;
			const baseOpacity = selectedSegmentId && !isSelected && !showAllBoundaries ? 0.3 : 1;
			const fillOpacity = (isHovered ? 0.35 : 0.25) * baseOpacity;
			const strokeWeight = isSelected ? 4 : isHovered ? 3.5 : 3;
			const color = hashToColor(getSegmentCode(segment), version);

			const polygon = new google.maps.Polygon({
				paths: path,
				strokeColor: color,
				strokeOpacity: 0.95 * baseOpacity,
				strokeWeight,
				fillColor: color,
				fillOpacity,
				clickable: true,
			});

			polygon.setMap(map);
			polygon.addListener('click', (event) => {
				onSelectSegment(segment.id);
				const bounds = getWedgeBounds(geometry);
				if (!bounds.isEmpty()) {
					map.fitBounds(bounds, 40);
				}
				if (infoWindow && event.latLng) {
					infoWindow.setContent(buildWedgeTooltip(segment, geometry));
					infoWindow.setPosition(event.latLng);
					infoWindow.open(map);
				}
			});
			polygon.addListener('mouseover', (event) => {
				onHoverSegment(segment.id);
				polygon.setOptions({
					fillOpacity: 0.35 * baseOpacity,
					strokeOpacity: 1,
					strokeWeight: strokeWeight + 0.5,
				});
				if (infoWindow && event.latLng) {
					infoWindow.setContent(buildWedgeTooltip(segment, geometry));
					infoWindow.setPosition(event.latLng);
					infoWindow.open(map);
				}
			});
			polygon.addListener('mouseout', () => {
				onHoverSegment(null);
				polygon.setOptions({
					fillOpacity,
					strokeOpacity: 0.95 * baseOpacity,
					strokeWeight,
				});
				if (infoWindow) infoWindow.close();
			});
			overlaysRef.current.polygons.push(polygon);

			if (visualizationMode === 'debug') {
				const points = getSegmentPoints(segment);
				if (points.length >= 3) {
					const convexHull = buildConvexHull(points);
					const hullPolygon = new google.maps.Polygon({
						paths: convexHull,
						strokeColor: '#38bdf8',
						strokeOpacity: 0.9 * baseOpacity,
						strokeWeight: 1.5,
						fillColor: '#38bdf8',
						fillOpacity: 0.05 * baseOpacity,
						clickable: false,
					});
					hullPolygon.setMap(map);
					overlaysRef.current.polygons.push(hullPolygon);
				}

				if (debugOptions.showBoundingBoxes && points.length) {
					const boxPath = getBoundingBoxPath(points);
					const box = new google.maps.Polyline({
						path: boxPath,
						strokeColor: '#facc15',
						strokeOpacity: 0.7 * baseOpacity,
						strokeWeight: 1,
						clickable: false,
					});
					box.setMap(map);
					overlaysRef.current.polylines.push(box);
				}

				if (debugOptions.showRawGeometry && showGeometryBounds) {
					const rawOverlay = new google.maps.Polygon({
						paths: path,
						strokeColor: '#f97316',
						strokeOpacity: 0.8 * baseOpacity,
						strokeWeight: 1,
						fillColor: '#f97316',
						fillOpacity: 0.03 * baseOpacity,
						clickable: false,
					});
					rawOverlay.setMap(map);
					overlaysRef.current.polygons.push(rawOverlay);
				}
			}
		});
	}, [
		map,
		visibleSegments,
		wedgeGeometries,
		selectedSegmentId,
		hoveredSegmentId,
		onSelectSegment,
		onHoverSegment,
		showBoundaries,
		showAllBoundaries,
		boundaryStyle,
		showGeometryBounds,
		visualizationMode,
		version,
		infoWindow,
		debugOptions,
	]);

	return null;
};

export default BoundaryLayer;
