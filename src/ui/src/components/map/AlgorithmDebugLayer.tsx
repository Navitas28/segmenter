import {useEffect} from 'react';
import type * as GeoJSON from 'geojson';
import type {BoothGridDebugSnapshot} from '../../types/api';
import {findDebugRegionByCode} from '../../services/debugSnapshot';
import {hashToColor, toLatLngPathsArray} from './utils';

type AlgorithmDebugLayerProps = {
	map: google.maps.Map;
	snapshot: BoothGridDebugSnapshot | null;
	selectedSegmentCode: string | null;
	showVoters: boolean;
	currentStep: number | null;
	infoWindow: google.maps.InfoWindow | null;
};

const toNumber = (value: unknown) => {
	if (value === null || value === undefined) return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const toText = (value: unknown) => {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return null;
	return String(value);
};

const getPointPosition = (feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) => {
	if (feature.geometry.type !== 'Point') return null;
	const coordinates = feature.geometry.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
	const lng = toNumber(coordinates[0]);
	const lat = toNumber(coordinates[1]);
	return lat !== null && lng !== null ? {lat, lng} : null;
};

const buildCellInfoHtml = (properties: Record<string, unknown>) => `
	<div style="font-size:12px;color:#0f172a;min-width:180px">
		<div><strong>Cell ${toText(properties.cell_id) ?? 'n/a'}</strong></div>
		<div>Segment: ${toText(properties.segment_code) ?? 'unassigned'}</div>
		<div>Region: ${toText(properties.region_id) ?? 'n/a'}</div>
		<div>Units: ${toText(properties.assigned_unit_count) ?? '0'}</div>
		<div>Voters: ${toText(properties.assigned_voter_count) ?? '0'}</div>
		<div>Seed cell: ${properties.is_seed_cell ? 'yes' : 'no'}</div>
		<div>Empty fill: ${properties.is_empty_fill_cell ? 'yes' : 'no'}</div>
	</div>
`;

const buildMarkerInfoHtml = (title: string, properties: Record<string, unknown>) => `
	<div style="font-size:12px;color:#0f172a;min-width:180px">
		<div><strong>${title}</strong></div>
		${Object.entries(properties)
			.filter(([, value]) => value !== null && value !== undefined && !Array.isArray(value))
			.slice(0, 8)
			.map(([key, value]) => `<div>${key}: ${String(value)}</div>`)
			.join('')}
	</div>
`;

const AlgorithmDebugLayer = ({map, snapshot, selectedSegmentCode, showVoters, currentStep, infoWindow}: AlgorithmDebugLayerProps) => {
	useEffect(() => {
		if (!snapshot) return;

		const polygons: google.maps.Polygon[] = [];
		const markers: google.maps.Marker[] = [];
		const polylines: google.maps.Polyline[] = [];
		const cellFeatureById = new Map<string, GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>>();
		const timeline = snapshot.timeline ?? [];
		const activeTimelineStep =
			timeline.length > 0
				? timeline[Math.max(1, Math.min(currentStep ?? timeline.length, timeline.length)) - 1] ?? null
				: null;
		const visibleCellIds = new Set(activeTimelineStep?.visible_cell_ids ?? []);
		const highlightedCellIds = new Set(activeTimelineStep?.highlighted_cell_ids ?? []);
		const highlightedUnitIds = new Set(activeTimelineStep?.highlighted_unit_ids ?? []);
		const showBoundary = activeTimelineStep?.show_boundary ?? true;
		const showGrid = activeTimelineStep?.show_grid ?? true;
		const showFamilyPoints = activeTimelineStep?.show_family_points ?? true;
		const showBooths = activeTimelineStep?.show_booths ?? true;
		const showSnapshotVoters = activeTimelineStep?.show_voters ?? true;
		const showSegments = activeTimelineStep?.show_segments ?? false;

		for (const feature of snapshot.grid_cells.features) {
			const cellId = toText(feature.properties?.cell_id);
			if (cellId) cellFeatureById.set(cellId, feature);
		}

		const focusedRegion = activeTimelineStep?.focus_region_id
			? snapshot.regions.find((region) => region.region_id === activeTimelineStep.focus_region_id) ?? null
			: findDebugRegionByCode(snapshot, selectedSegmentCode);
		const focusedSegmentCode = activeTimelineStep?.focus_segment_code ?? focusedRegion?.segment_code ?? selectedSegmentCode;

		if (showBoundary) {
			const boundaryFeature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> = {
				type: 'Feature',
				geometry: snapshot.boundary as GeoJSON.Geometry,
				properties: {},
			};
			const boundaryPaths = toLatLngPathsArray(boundaryFeature);
			if (boundaryPaths.length > 0) {
				polygons.push(
					new google.maps.Polygon({
						map,
						paths: boundaryPaths,
						strokeColor: '#f8fafc',
						strokeOpacity: 0.45,
						strokeWeight: 2,
						fillOpacity: 0,
						zIndex: 1,
					}),
				);
			}
		}

		if (showBooths) {
			for (const booth of snapshot.booths) {
				if (booth.latitude == null || booth.longitude == null) continue;
				markers.push(
					new google.maps.Marker({
						map,
						position: {lat: Number(booth.latitude), lng: Number(booth.longitude)},
						label: {
							text: 'B',
							color: '#e2e8f0',
							fontWeight: '700',
						},
						icon: {
							path: google.maps.SymbolPath.CIRCLE,
							scale: 11,
							fillColor: '#0f172a',
							fillOpacity: 0.95,
							strokeColor: '#f8fafc',
							strokeWeight: 2,
						},
						title: booth.booth_name ?? booth.booth_number ?? booth.id,
						zIndex: 12,
					}),
				);
			}
		}

		for (const feature of snapshot.grid_cells.features) {
			if (!showGrid) continue;
			const cellId = toText(feature.properties?.cell_id) ?? '';
			const segmentCode = toText(feature.properties?.segment_code);
			const regionId = toText(feature.properties?.region_id);
			const isFocused = focusedSegmentCode ? segmentCode === focusedSegmentCode : true;
			const isRevealed = visibleCellIds.has(cellId);
			const isHighlighted = highlightedCellIds.has(cellId);
			const isSeedCell = Boolean(feature.properties?.is_seed_cell);
			const isEmptyFillCell = Boolean(feature.properties?.is_empty_fill_cell);
			const color = hashToColor((showSegments ? segmentCode : null) ?? regionId ?? segmentCode ?? cellId, snapshot.version);
			const paths = toLatLngPathsArray(feature as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>);

			if (!paths.length) continue;

			const polygon = new google.maps.Polygon({
				map,
				paths,
				strokeColor: color,
				strokeOpacity: isHighlighted ? 0.98 : isRevealed ? (isFocused ? 0.88 : 0.42) : 0.18,
				strokeWeight: isHighlighted ? 2.4 : isSeedCell ? 2 : 1,
				fillColor: color,
				fillOpacity: isHighlighted ? 0.22 : isRevealed ? (isEmptyFillCell ? 0.08 : 0.15) : 0.025,
				zIndex: isHighlighted ? 7 : isRevealed ? 5 : 2,
			});

			polygon.addListener('click', (event: google.maps.MapMouseEvent) => {
				if (!event.latLng || !infoWindow) return;
				infoWindow.setContent(buildCellInfoHtml(feature.properties ?? {}));
				infoWindow.setPosition(event.latLng);
				infoWindow.open(map);
			});

			polygons.push(polygon);

			if (isSeedCell) {
				const centroidLat = toNumber(feature.properties?.centroid_lat);
				const centroidLng = toNumber(feature.properties?.centroid_lng);
				if (centroidLat !== null && centroidLng !== null) {
					markers.push(
						new google.maps.Marker({
							map,
							position: {lat: centroidLat, lng: centroidLng},
							label: {
								text: 'S',
								color: '#f8fafc',
								fontWeight: '700',
							},
							icon: {
								path: google.maps.SymbolPath.CIRCLE,
								scale: 10,
								fillColor: color,
								fillOpacity: 0.95,
								strokeColor: '#020617',
								strokeWeight: 2,
							},
							zIndex: 8,
						}),
					);
				}
			}
		}

		for (const feature of snapshot.family_points.features) {
			if (!showFamilyPoints) continue;
			const position = getPointPosition(feature);
			if (!position) continue;
			const segmentCode = toText(feature.properties?.segment_code);
			const familyId = toText(feature.properties?.family_id) ?? 'family';
			const cellId = toText(feature.properties?.cell_id);
			const isFocused = focusedSegmentCode ? segmentCode === focusedSegmentCode : true;
			const isRevealed = cellId ? visibleCellIds.has(cellId) : false;
			const isHighlighted = highlightedUnitIds.has(familyId);
			const color = hashToColor(segmentCode ?? familyId, snapshot.version);

			const marker = new google.maps.Marker({
				map,
				position,
				icon: {
					path: google.maps.SymbolPath.CIRCLE,
					scale: isHighlighted ? 7 : isRevealed ? 5 : 4,
					fillColor: color,
					fillOpacity: isHighlighted ? 1 : isFocused ? (isRevealed ? 0.92 : 0.28) : 0.18,
					strokeColor: '#e2e8f0',
					strokeWeight: 1,
				},
				zIndex: isHighlighted ? 10 : isRevealed ? 8 : 4,
			});

			marker.addListener('click', () => {
				if (!infoWindow) return;
				infoWindow.setContent(buildMarkerInfoHtml('Family centroid', feature.properties ?? {}));
				infoWindow.setPosition(position);
				infoWindow.open(map);
			});

			markers.push(marker);
		}

		if (showVoters && showSnapshotVoters) {
			for (const feature of snapshot.voter_points.features) {
				const position = getPointPosition(feature);
				if (!position) continue;
				const segmentCode = toText(feature.properties?.segment_code);
				const voterId = toText(feature.properties?.voter_id) ?? 'voter';
				const cellId = toText(feature.properties?.cell_id);
				const isFocused = focusedSegmentCode ? segmentCode === focusedSegmentCode : true;
				const isRevealed = cellId ? visibleCellIds.has(cellId) : false;
				const color = hashToColor(segmentCode ?? voterId, snapshot.version);

				const marker = new google.maps.Marker({
					map,
					position,
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale: isFocused ? 2.6 : 1.8,
						fillColor: color,
						fillOpacity: isFocused ? (isRevealed ? 0.72 : 0.12) : 0.08,
						strokeColor: '#020617',
						strokeWeight: 0.5,
					},
					zIndex: isRevealed ? 7 : 3,
				});

				marker.addListener('click', () => {
					if (!infoWindow) return;
					infoWindow.setContent(buildMarkerInfoHtml('Voter point', feature.properties ?? {}));
					infoWindow.setPosition(position);
					infoWindow.open(map);
				});

				markers.push(marker);
			}
		}

		if (
			focusedRegion &&
			activeTimelineStep?.focus_cell_id &&
			(activeTimelineStep.stage === 'region_growth' ||
				activeTimelineStep.stage === 'region_rebalance' ||
				activeTimelineStep.stage === 'region_compression')
		) {
			const fromFeature = activeTimelineStep.from_cell_id ? cellFeatureById.get(activeTimelineStep.from_cell_id) : null;
			const toFeature = cellFeatureById.get(activeTimelineStep.focus_cell_id);
			const fromLat = toNumber(fromFeature?.properties?.centroid_lat);
			const fromLng = toNumber(fromFeature?.properties?.centroid_lng);
			const toLat = toNumber(toFeature?.properties?.centroid_lat);
			const toLng = toNumber(toFeature?.properties?.centroid_lng);

			if (fromLat !== null && fromLng !== null && toLat !== null && toLng !== null && activeTimelineStep.from_cell_id) {
				const isGrowth = activeTimelineStep.stage === 'region_growth';
				const accepted = isGrowth ? activeTimelineStep.growth_action === 'add_neighbor' : true;
				const strokeColor =
					activeTimelineStep.stage === 'region_rebalance'
						? '#f59e0b'
						: activeTimelineStep.stage === 'region_compression'
							? '#d946ef'
							: accepted
								? '#22d3ee'
								: '#fb7185';
				const linePath = isGrowth
					? [
							{lat: fromLat, lng: fromLng},
							{lat: toLat, lng: toLng},
					  ]
					: [
							{lat: toLat, lng: toLng},
							{lat: fromLat, lng: fromLng},
					  ];
				const line = new google.maps.Polyline({
					map,
					path: linePath,
					strokeColor,
					strokeOpacity: accepted ? 0.9 : 0,
					strokeWeight: accepted ? 2.2 : 1,
					icons: [
						accepted
							? {
									icon: {
										path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
										scale: 2.8,
										strokeColor,
										fillColor: strokeColor,
										fillOpacity: 1,
									},
									offset: '100%',
							  }
							: {
									icon: {
										path: 'M 0,-1 0,1',
										strokeOpacity: 1,
										strokeColor: '#fb7185',
										scale: 3,
									},
									offset: '0',
									repeat: '10px',
							  },
					],
					zIndex: 10,
				});

				polylines.push(line);
			}
		}

		return () => {
			polygons.forEach((polygon) => polygon.setMap(null));
			markers.forEach((marker) => marker.setMap(null));
			polylines.forEach((polyline) => polyline.setMap(null));
		};
	}, [map, snapshot, selectedSegmentCode, showVoters, currentStep, infoWindow]);

	return null;
};

export default AlgorithmDebugLayer;
