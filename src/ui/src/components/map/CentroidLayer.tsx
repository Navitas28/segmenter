import {useEffect, useRef} from 'react';
import type {Segment} from '../../types/api';
import {getSegmentCentroidLatLng, getSegmentCode, getSegmentHash, getSegmentVoterCount} from '../../services/segmentUtils';
import {buildWedgeTooltip, hashToColor} from './utils';
import type {WedgeGeometry} from './WedgeGenerator';

type DebugOptions = {
	showRawGeometry: boolean;
	showCentroidCoords: boolean;
	showBoundingBoxes: boolean;
	showClusteringIndex: boolean;
};

type CentroidLayerProps = {
	map: google.maps.Map;
	segments: Segment[];
	wedgeGeometries: Map<string, WedgeGeometry>;
	selectedSegmentId: string | null;
	hoveredSegmentId: string | null;
	onSelectSegment: (segmentId: string) => void;
	onHoverSegment: (segmentId: string | null) => void;
	showCentroids: boolean;
	visualizationMode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	version: number | null;
	infoWindow: google.maps.InfoWindow | null;
	debugOptions: DebugOptions;
};

type MarkerSet = {
	advanced: google.maps.marker.AdvancedMarkerElement[];
	fallback: google.maps.Marker[];
};

const buildCentroidContent = (segment: Segment, color: string, showCoords: boolean, showHash: boolean) => {
	const code = getSegmentCode(segment);
	const voters = getSegmentVoterCount(segment);
	const centroid = getSegmentCentroidLatLng(segment);
	const hash = getSegmentHash(segment);
	const container = document.createElement('div');
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.alignItems = 'center';
	container.style.gap = '2px';
	container.style.padding = '4px 6px';
	container.style.borderRadius = '8px';
	container.style.background = 'rgba(15, 23, 42, 0.8)';
	container.style.border = `1px solid ${color}`;
	container.innerHTML = `
		<div style="font-weight:700;font-size:12px;color:${color}">${code}</div>
		<div style="font-size:10px;color:#e2e8f0">${voters} voters</div>
		${showCoords && centroid ? `<div style="font-size:9px;color:#94a3b8">${centroid.lat.toFixed(4)}, ${centroid.lng.toFixed(4)}</div>` : ''}
		${showHash && hash ? `<div style="font-size:9px;color:#f8fafc">#${hash}</div>` : ''}
	`;
	return container;
};

const CentroidLayer = ({map, segments, wedgeGeometries, selectedSegmentId, hoveredSegmentId, onSelectSegment, onHoverSegment, showCentroids, visualizationMode, version, infoWindow, debugOptions}: CentroidLayerProps) => {
	const overlaysRef = useRef<MarkerSet>({advanced: [], fallback: []});

	useEffect(() => {
		overlaysRef.current.advanced.forEach((marker) => (marker.map = null));
		overlaysRef.current.fallback.forEach((marker) => marker.setMap(null));
		overlaysRef.current = {advanced: [], fallback: []};

		if (!showCentroids) return;

		segments.forEach((segment) => {
			const centroid = getSegmentCentroidLatLng(segment);
			const geometry = wedgeGeometries.get(segment.id);
			const labelPosition = geometry?.labelPosition ?? centroid;
			if (!labelPosition) return;
			const isSelected = segment.id === selectedSegmentId;
			const isHovered = segment.id === hoveredSegmentId;
			const opacity = selectedSegmentId && !isSelected ? 0.2 : 1;
			const color = hashToColor(getSegmentCode(segment), version);
			const content = buildCentroidContent(segment, color, debugOptions.showCentroidCoords, visualizationMode === 'debug');

			if (google.maps.marker?.AdvancedMarkerElement) {
				const marker = new google.maps.marker.AdvancedMarkerElement({
					map,
					position: labelPosition,
					content,
					zIndex: isSelected ? 40 : 20,
				});
				content.style.opacity = `${opacity}`;
				content.style.transform = isSelected || isHovered ? 'scale(1.05)' : 'scale(1)';

				marker.addListener('gmp-click', () => onSelectSegment(segment.id));
				marker.addListener('gmp-mouseover', () => {
					onHoverSegment(segment.id);
					if (infoWindow && geometry) {
						infoWindow.setContent(buildWedgeTooltip(segment, geometry));
						infoWindow.setPosition(labelPosition);
						infoWindow.open(map);
					}
				});
				marker.addListener('gmp-mouseout', () => {
					onHoverSegment(null);
					if (infoWindow) infoWindow.close();
				});
				overlaysRef.current.advanced.push(marker);
			} else {
				const marker = new google.maps.Marker({
					position: labelPosition,
					map,
					opacity,
					label: {
						text: `${getSegmentCode(segment)} • ${getSegmentVoterCount(segment)}`,
						color: color,
						fontSize: '11px',
						fontWeight: 'bold',
					},
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale: isSelected || isHovered ? 6 : 5,
						fillColor: color,
						fillOpacity: 0.9,
						strokeColor: '#0f172a',
						strokeWeight: 1,
					},
				});
				marker.addListener('click', () => onSelectSegment(segment.id));
				marker.addListener('mouseover', () => {
					onHoverSegment(segment.id);
					if (infoWindow && geometry) {
						infoWindow.setContent(buildWedgeTooltip(segment, geometry));
						infoWindow.setPosition(labelPosition);
						infoWindow.open(map);
					}
				});
				marker.addListener('mouseout', () => {
					onHoverSegment(null);
					if (infoWindow) infoWindow.close();
				});
				overlaysRef.current.fallback.push(marker);
			}
		});
	}, [map, segments, wedgeGeometries, selectedSegmentId, hoveredSegmentId, onSelectSegment, onHoverSegment, showCentroids, visualizationMode, version, infoWindow, debugOptions]);

	return null;
};

export default CentroidLayer;
