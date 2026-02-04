import {useEffect, useMemo, useRef, useState} from 'react';
import type {Booth, Segment, SegmentMember} from '../types/api';
import {loadGoogleMaps} from '../services/maps';
import {getSegmentBoundary, getSegmentCentroidLatLng, getSegmentCode, getSegmentFamilyCount, getSegmentHash, getSegmentMembers, getSegmentVoterCount} from '../services/segmentUtils';

type MapPanelProps = {
	segments: Segment[];
	comparisonSegments: Segment[];
	booths: Booth[];
	selectedSegmentId: string | null;
	scopeType: 'AC' | 'BOOTH';
	showBoundaries: boolean;
	showVoters: boolean;
	showCentroids: boolean;
	showGeometryBounds: boolean;
	highlightFamilies: boolean;
	onSelectSegment?: (segmentId: string) => void;
};

type MapOverlays = {
	polygons: google.maps.Polygon[];
	markers: google.maps.Marker[];
};

const palette = ['#38bdf8', '#c084fc', '#f472b6', '#facc15', '#4ade80', '#22d3ee'];

const toNumber = (value: unknown) => {
	if (value === null || value === undefined) return null;
	const numeric = Number(value);
	if (!Number.isNaN(numeric)) return numeric;
	const parsed = Number.parseFloat(String(value));
	return Number.isNaN(parsed) ? null : parsed;
};

const getMemberLatLng = (member: SegmentMember) => {
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

const toLatLngArray = (geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => {
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

const buildBounds = (overlays: MapOverlays) => {
	const bounds = new google.maps.LatLngBounds();
	overlays.polygons.forEach((polygon) => {
		polygon.getPath().forEach((point) => bounds.extend(point));
	});
	overlays.markers.forEach((marker) => {
		const position = marker.getPosition();
		if (position) bounds.extend(position);
	});
	return bounds;
};

const MapPanel = ({segments, comparisonSegments, booths, selectedSegmentId, scopeType, showBoundaries, showVoters, showCentroids, showGeometryBounds, highlightFamilies, onSelectSegment}: MapPanelProps) => {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const [map, setMap] = useState<google.maps.Map | null>(null);
	const overlaysRef = useRef<MapOverlays>({polygons: [], markers: []});
	const comparisonRef = useRef<MapOverlays>({polygons: [], markers: []});
	const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

	useEffect(() => {
		if (!mapRef.current || map) return;
		if (!apiKey) return;
		loadGoogleMaps(apiKey)
			.then(() => {
				const instance = new google.maps.Map(mapRef.current as HTMLDivElement, {
					center: {lat: 20.5937, lng: 78.9629},
					zoom: 5,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
					mapId: '62304de93ee45a67',
				});
				infoWindowRef.current = new google.maps.InfoWindow();
				setMap(instance);
			})
			.catch(() => {
				setMap(null);
			});
	}, [apiKey, map]);

	const clearOverlays = (overlays: MapOverlays) => {
		overlays.polygons.forEach((polygon) => polygon.setMap(null));
		overlays.markers.forEach((marker) => marker.setMap(null));
		overlays.polygons = [];
		overlays.markers = [];
	};

	const familyColors = useMemo(() => new Map<string, string>(), []);

	const addVoterMarkers = (members: SegmentMember[], color: string) => {
		members.forEach((member) => {
			const position = getMemberLatLng(member);
			if (!position) return;
			const marker = new google.maps.Marker({
				position,
				map: map ?? undefined,
				icon: {
					path: google.maps.SymbolPath.CIRCLE,
					scale: 3,
					fillColor: color,
					fillOpacity: 0.8,
					strokeColor: '#0f172a',
					strokeWeight: 1,
				},
			});
			overlaysRef.current.markers.push(marker);
		});
	};

	useEffect(() => {
		if (!map) return;
		clearOverlays(overlaysRef.current);

		segments.forEach((segment) => {
			const isSelected = segment.id === selectedSegmentId;
			const boundary = getSegmentBoundary(segment);
			const infoContent = `
				<div style="font-size:12px;color:#0f172a">
					<div><strong>${getSegmentCode(segment)}</strong></div>
					<div>Voters: ${getSegmentVoterCount(segment)}</div>
					<div>Families: ${getSegmentFamilyCount(segment)}</div>
					<div>Hash: ${getSegmentHash(segment) ?? 'n/a'}</div>
				</div>
			`;

			if (showBoundaries && boundary) {
				const path = toLatLngArray(boundary);
				if (path.length) {
					const polygon = new google.maps.Polygon({
						paths: path,
						strokeColor: isSelected ? '#f97316' : segment.color ?? '#38bdf8',
						strokeWeight: isSelected ? 3 : 1.5,
						fillColor: segment.color ?? '#38bdf8',
						fillOpacity: showGeometryBounds ? 0.25 : 0.05,
					});
					polygon.setMap(map);
					polygon.addListener('click', (event) => {
						onSelectSegment?.(segment.id);
						if (infoWindowRef.current && event.latLng) {
							infoWindowRef.current.setContent(infoContent);
							infoWindowRef.current.setPosition(event.latLng);
							infoWindowRef.current.open(map);
						}
					});
					overlaysRef.current.polygons.push(polygon);
				}
			}

			const centroid = getSegmentCentroidLatLng(segment);
			if (showCentroids && centroid) {
				const marker = new google.maps.Marker({
					position: centroid,
					map,
					label: {
						text: String(getSegmentVoterCount(segment)),
						color: '#e2e8f0',
						fontSize: '10px',
						fontWeight: 'bold',
					},
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale: isSelected ? 6 : 4,
						fillColor: isSelected ? '#f97316' : segment.color ?? '#22d3ee',
						fillOpacity: 0.9,
						strokeColor: '#0f172a',
						strokeWeight: 1,
					},
				});
				marker.addListener('click', () => {
					onSelectSegment?.(segment.id);
					if (infoWindowRef.current) {
						infoWindowRef.current.setContent(infoContent);
						infoWindowRef.current.open(map, marker);
					}
				});
				overlaysRef.current.markers.push(marker);
			}

			if (showVoters) {
				const members = getSegmentMembers(segment);
				if (!members.length) return;
				members.forEach((member) => {
					const familyId = member.family_id ?? (member.metadata?.family_id as string | undefined);
					if (!familyId) return;
					if (!familyColors.has(familyId)) {
						familyColors.set(familyId, palette[familyColors.size % palette.length]);
					}
				});
				const defaultColor = segment.color ?? '#22d3ee';
				if (highlightFamilies) {
					members.forEach((member) => {
						const familyId = member.family_id ?? (member.metadata?.family_id as string | undefined);
						const color = familyId ? familyColors.get(familyId) ?? defaultColor : defaultColor;
						addVoterMarkers([member], color);
					});
				} else {
					addVoterMarkers(members, defaultColor);
				}
			}
		});

		if (scopeType === 'BOOTH') {
			booths.forEach((booth) => {
				if (booth.latitude == null || booth.longitude == null) return;
				const marker = new google.maps.Marker({
					position: {lat: Number(booth.latitude), lng: Number(booth.longitude)},
					map,
					icon: {
						path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
						scale: 4,
						fillColor: '#facc15',
						fillOpacity: 0.9,
						strokeColor: '#0f172a',
						strokeWeight: 1,
					},
					title: booth.booth_name ?? booth.name ?? booth.code ?? (booth.booth_number ? `Booth ${booth.booth_number}` : booth.id),
				});
				overlaysRef.current.markers.push(marker);
			});
		}

		if (overlaysRef.current.polygons.length || overlaysRef.current.markers.length) {
			const bounds = buildBounds(overlaysRef.current);
			if (!bounds.isEmpty()) {
				map.fitBounds(bounds);
			}
		}
	}, [map, segments, booths, selectedSegmentId, scopeType, showBoundaries, showVoters, showCentroids, showGeometryBounds, highlightFamilies, onSelectSegment, familyColors]);

	useEffect(() => {
		if (!map) return;
		clearOverlays(comparisonRef.current);
		if (!comparisonSegments.length) return;

		comparisonSegments.forEach((segment) => {
			const boundary = getSegmentBoundary(segment);
			if (showBoundaries && boundary) {
				const path = toLatLngArray(boundary);
				if (path.length) {
					const polygon = new google.maps.Polygon({
						paths: path,
						strokeColor: '#f472b6',
						strokeWeight: 1.5,
						fillColor: '#f472b6',
						fillOpacity: 0.1,
					});
					polygon.setMap(map);
					comparisonRef.current.polygons.push(polygon);
				}
			}
		});
	}, [map, comparisonSegments, showBoundaries]);

	const handleFitBounds = () => {
		if (!map) return;
		const bounds = buildBounds(overlaysRef.current);
		if (!bounds.isEmpty()) {
			map.fitBounds(bounds);
		}
	};

	return (
		<div className='panel h-full flex flex-col gap-3'>
			<div className='flex items-center justify-between gap-3'>
				<div className='panel-title'>Map Visualization</div>
				<button type='button' className='button button-secondary' onClick={handleFitBounds}>
					Fit to bounds
				</button>
			</div>
			{!apiKey ? <div className='text-sm text-amber-300'>Google Maps API key missing. Set `VITE_GOOGLE_MAPS_API_KEY` in `src/ui/.env`.</div> : null}
			<div ref={mapRef} className='flex-1 rounded-md border border-slate-800 bg-slate-900' />
			<div className='grid grid-cols-3 gap-2 text-xs text-slate-300'>
				<div>Segments: {segments.length}</div>
				<div>Selected: {selectedSegmentId ?? 'None'}</div>
				<div>Comparison: {comparisonSegments.length}</div>
			</div>
			<div className='grid grid-cols-3 gap-2 text-xs text-slate-400'>
				<div>Boundaries: {showBoundaries ? 'On' : 'Off'}</div>
				<div>Voters: {showVoters ? 'On' : 'Off'}</div>
				<div>Centroids: {showCentroids ? 'On' : 'Off'}</div>
			</div>
		</div>
	);
};

export default MapPanel;
