import {useEffect, useRef, useState} from 'react';
import {useCustomerStore, type MapTypeId} from '../../store/useCustomerStore';
import {loadGoogleMaps} from '../../services/maps';
import type {Segment} from '../../types/api';

interface CustomerMapViewProps {
	segments: Segment[];
	selectedSegment: Segment | null;
}

/** Ensure value is a finite number for LatLng (API may return strings from DB). */
function toNum(v: unknown): number | null {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

/** Valid LatLng literal for Google Maps. */
function toLatLng(lat: unknown, lng: unknown): {lat: number; lng: number} | null {
	const la = toNum(lat);
	const ln = toNum(lng);
	return la != null && ln != null ? {lat: la, lng: ln} : null;
}

const CustomerMapView = ({segments, selectedSegment}: CustomerMapViewProps) => {
	const googleMapRef = useRef<google.maps.Map | null>(null);
	const polygonsRef = useRef<google.maps.Polygon[]>([]);
	const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
	const voterOverlaysRef = useRef<google.maps.Circle[]>([]);
	const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
	const prevMapTypeRef = useRef<MapTypeId | null>(null);

	const MAX_VOTER_OVERLAYS = 2000;
	const initializingRef = useRef(false); // Prevent double initialization
	const {layers, setSelectedSegmentId, mapType, map3DEnabled, setMapType, setMap3DEnabled} = useCustomerStore();
	const [mapReady, setMapReady] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

	// Callback ref pattern - called when div is attached to DOM
	const mapRefCallback = (element: HTMLDivElement | null) => {
		if (!element) return;
		if (googleMapRef.current) return; // Already initialized
		if (initializingRef.current) return; // Already initializing

		initializingRef.current = true;

		if (!apiKey) {
			setError('Google Maps API key missing');
			setLoading(false);
			initializingRef.current = false;
			return;
		}

		loadGoogleMaps(apiKey)
			.then(() => {
				if (!element) {
					initializingRef.current = false;
					return;
				}
				
				// Default center: India center coordinates, or Delhi if segments exist
				const defaultCenter = segments.length > 0
					? {lat: 28.6139, lng: 77.209} // Delhi
					: {lat: 20.5937, lng: 78.9629}; // India center

				const defaultZoom = segments.length > 0 ? 12 : 5; // Zoom out for India view
				
				const map = new google.maps.Map(element, {
					zoom: defaultZoom,
					center: defaultCenter,
					mapId: '62304de93ee45a67',
					mapTypeId: mapType,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: true,
					fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
					zoomControl: true,
					zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
					clickableIcons: false,
					disableDefaultUI: false,
					tilt: map3DEnabled ? 45 : 0,
					heading: 0,
					gestureHandling: 'greedy',
				});

				// Create info window for tooltips
				infoWindowRef.current = new google.maps.InfoWindow();

				googleMapRef.current = map;
				setMapReady(true);
				setLoading(false);
				initializingRef.current = false;
			})
			.catch((err) => {
				setError(`Map loading failed: ${err.message}`);
				setLoading(false);
				initializingRef.current = false;
			});
	};

	// Sync map type and 3D tilt when user changes them
	useEffect(() => {
		if (!googleMapRef.current || !mapReady) return;
		const map = googleMapRef.current;

		// Always apply the requested map type first.
		map.setMapTypeId(mapType);

		// Google Maps 45° tilt is most consistently available on satellite/hybrid at high zoom.
		// If user enables "3D / Realistic", switch to hybrid (keeping labels) and zoom in so the effect is visible.
		if (map3DEnabled) {
			if ((mapType !== 'satellite' && mapType !== 'hybrid')) {
				// Remember the user's preferred map type so we can restore it when 3D is turned off.
				if (!prevMapTypeRef.current) prevMapTypeRef.current = mapType;
				setMapType('hybrid');
				return; // wait for state update to re-run effect
			}

			const currentZoom = map.getZoom() ?? 0;
			if (currentZoom < 18) map.setZoom(18);
			map.setTilt(45);
			map.setHeading(45); // non-zero heading makes the 3D perspective obvious
			map.setOptions({rotateControl: true});
		} else {
			map.setTilt(0);
			map.setHeading(0);

			// Restore original map type if we auto-switched it when enabling 3D.
			if (prevMapTypeRef.current) {
				const prev = prevMapTypeRef.current;
				prevMapTypeRef.current = null;
				// Only restore if user hasn't manually picked a different type while in 3D.
				// (If they did, prevMapTypeRef would still be set, but restoring would feel surprising.)
				if (mapType === 'hybrid') setMapType(prev);
			}
		}
	}, [mapReady, mapType, map3DEnabled, setMapType]);

	// Render segments with advanced features
	useEffect(() => {
		if (!googleMapRef.current || !mapReady) return;

		// Clear existing polygons, markers, and voter overlays
		polygonsRef.current.forEach((p) => p.setMap(null));
		markersRef.current.forEach((m) => (m.map = null));
		voterOverlaysRef.current.forEach((c) => c.setMap(null));
		polygonsRef.current = [];
		markersRef.current = [];
		voterOverlaysRef.current = [];

		if (segments.length === 0) return;

		const bounds = new google.maps.LatLngBounds();

		segments.forEach((segment) => {
			if (!layers.boundaries) return;

			// Get exterior ring: Polygon coordinates[0] = ring; MultiPolygon coordinates[0][0] = first polygon's ring
			let raw: [number, number][] = [];
			const geom = segment.geometry ?? segment.boundary_geojson;
			if (geom && typeof geom === 'object' && 'coordinates' in geom) {
				const coords = (geom as {coordinates: unknown}).coordinates as unknown[];
				const first = coords[0];
				const type = (geom as {type?: string}).type;
				if (type === 'MultiPolygon' && Array.isArray(first) && Array.isArray((first as unknown[])[0])) {
					raw = (((first as [number, number][][])[0]) ?? []) as [number, number][];
				} else if (Array.isArray(first) && first.length > 0) {
					// Polygon: first is ring [[lng,lat],[lng,lat],...]; MultiPolygon first is array of rings
					const elem = (first as unknown[])[0];
					const isRing = Array.isArray(elem) && elem.length >= 2 && typeof elem[0] === 'number';
					raw = isRing ? (first as [number, number][]) : ((((first as [number, number][][])[0]) ?? []) as [number, number][]);
				}
			}
			const coordinates = raw
				.map(([lng, lat]: [number, number]) => toLatLng(lat, lng))
				.filter((c): c is {lat: number; lng: number} => c != null);

			if (coordinates.length === 0) return;

			// Calculate segment height based on voter count (for visual depth)
			const voterCount = segment.total_voters ?? 0;
			const maxVoters = Math.max(...segments.map(s => s.total_voters ?? 0));
			const normalizedHeight = maxVoters > 0 ? voterCount / maxVoters : 0;

			// Create polygon with enhanced styling
			const isSelected = selectedSegment?.id === segment.id;
			const segmentColor = segment.color ?? '#3b82f6';
			const highlight = layers.dimMap;
			const baseFillOpacity = highlight ? 0.45 : 0.2;
			const selectedFillOpacity = highlight ? 0.65 : 0.35;
			const baseStrokeWeight = highlight ? 2.5 : 2;
			const selectedStrokeWeight = highlight ? 4 : 3;

			const polygon = new google.maps.Polygon({
				paths: coordinates,
				strokeColor: isSelected ? '#1e40af' : segmentColor,
				strokeOpacity: 0.9,
				strokeWeight: isSelected ? selectedStrokeWeight : baseStrokeWeight,
				fillColor: segmentColor,
				fillOpacity: isSelected ? selectedFillOpacity : baseFillOpacity,
				map: googleMapRef.current,
				clickable: true,
				zIndex: isSelected ? 1000 : Math.floor(normalizedHeight * 100),
			});

			// Click handler
			polygon.addListener('click', () => {
				setSelectedSegmentId(segment.id);
			});

			// Hover effects with info window
			polygon.addListener('mouseover', (e: google.maps.MapMouseEvent) => {
				polygon.setOptions({
					fillOpacity: highlight ? 0.7 : 0.45,
					strokeWeight: highlight ? 4.5 : 3,
					strokeColor: '#1e40af',
				});

				// Show tooltip
				if (infoWindowRef.current && e.latLng) {
					const content = `
						<div style="padding: 8px; font-family: system-ui;">
							<div style="font-weight: 600; font-size: 14px; color: #111827; margin-bottom: 6px;">
								${segment.display_name ?? segment.segment_name ?? 'Segment'}
							</div>
							<div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">
								<span style="font-weight: 500;">Voters:</span> ${voterCount.toLocaleString()}
							</div>
							<div style="font-size: 12px; color: #6b7280;">
								<span style="font-weight: 500;">Families:</span> ${(segment.total_families ?? 0).toLocaleString()}
							</div>
						</div>
					`;
					infoWindowRef.current.setContent(content);
					infoWindowRef.current.setPosition(e.latLng);
					infoWindowRef.current.open(googleMapRef.current);
				}
			});

			polygon.addListener('mouseout', () => {
				polygon.setOptions({
					fillOpacity: isSelected ? selectedFillOpacity : baseFillOpacity,
					strokeWeight: isSelected ? selectedStrokeWeight : baseStrokeWeight,
					strokeColor: isSelected ? '#1e40af' : segmentColor,
				});

				// Close tooltip
				if (infoWindowRef.current) {
					infoWindowRef.current.close();
				}
			});

			polygonsRef.current.push(polygon);

			// Extend bounds
			coordinates.forEach((coord) => bounds.extend(coord));

			// Add label with AdvancedMarkerElement (only with valid numeric lat/lng)
			const centroidPos = toLatLng(segment.centroid_lat, segment.centroid_lng);
			if (layers.labels && centroidPos) {
				const labelDiv = document.createElement('div');
				labelDiv.style.cssText = `
					background: white;
					padding: 6px 10px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 600;
					color: #111827;
					box-shadow: 0 2px 8px rgba(0,0,0,0.15);
					border: 1px solid rgba(0,0,0,0.1);
					white-space: nowrap;
				`;
				labelDiv.textContent = segment.display_name ?? segment.segment_name ?? '';

				const label = new google.maps.marker.AdvancedMarkerElement({
					position: centroidPos,
					map: googleMapRef.current,
					content: labelDiv,
				});

				markersRef.current.push(label);
			}

			// Add centroid marker (only with valid numeric lat/lng)
			if (layers.centroids && centroidPos) {
				const centroidDiv = document.createElement('div');
				centroidDiv.style.cssText = `
					width: 12px;
					height: 12px;
					background: ${segmentColor};
					border: 2px solid white;
					border-radius: 50%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				`;

				const centroidMarker = new google.maps.marker.AdvancedMarkerElement({
					position: centroidPos,
					map: googleMapRef.current,
					content: centroidDiv,
				});

				markersRef.current.push(centroidMarker);
			}

			// Voter positions (lat/lng) when layer is on – use Circle overlays to avoid Advanced Markers API issues
			if (layers.showVoters && voterOverlaysRef.current.length < MAX_VOTER_OVERLAYS && (segment.members ?? segment.voters ?? []).length > 0) {
				const list = segment.members ?? segment.voters ?? [];
				const segColor = segment.color ?? '#6b7280';
				for (const m of list) {
					if (voterOverlaysRef.current.length >= MAX_VOTER_OVERLAYS) break;
					const pos = toLatLng(m.latitude, m.longitude);
					if (!pos || !googleMapRef.current) continue;
					try {
						const circle = new google.maps.Circle({
							center: pos,
							radius: 4,
							fillColor: segColor,
							fillOpacity: 0.85,
							strokeColor: '#fff',
							strokeWeight: 1,
							map: googleMapRef.current,
							zIndex: 50,
						});
						voterOverlaysRef.current.push(circle);
					} catch {
						// Skip if Maps API fails (e.g. quota, key restrictions)
					}
				}
			}
		});

		// Fit bounds with smooth animation
		if (!bounds.isEmpty()) {
			googleMapRef.current.fitBounds(bounds, {
				top: 60,
				bottom: 60,
				left: 360, // Account for left sidebar
				right: 380, // Account for right sidebar
			});

			google.maps.event.addListenerOnce(googleMapRef.current, 'bounds_changed', () => {
				const zoom = googleMapRef.current?.getZoom();
				if (zoom && zoom > 18) {
					googleMapRef.current?.setZoom(18);
				}
			});
		}
	}, [segments, layers, selectedSegment, mapReady, setSelectedSegmentId]);

	// Always render map container, overlay loading/error states
	return (
		<div className="w-full h-full relative">
			{/* Map container - ALWAYS rendered so callback ref is invoked */}
			<div ref={mapRefCallback} className="w-full h-full" />

			{/* Map type & 3D controls - only when map is ready */}
			{mapReady && (
				<div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
					<div className="flex rounded-lg overflow-hidden bg-white/95 shadow-lg border border-gray-200">
						{(['roadmap', 'satellite', 'hybrid', 'terrain'] as const).map((id) => (
							<button
								key={id}
								type="button"
								onClick={() => setMapType(id)}
								className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
									mapType === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
								}`}
							>
								{id}
							</button>
						))}
					</div>
					<label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/95 shadow-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
						<input
							type="checkbox"
							checked={map3DEnabled}
							onChange={(e) => setMap3DEnabled(e.target.checked)}
							className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
						/>
						<span className="text-xs font-medium text-gray-700">3D / Realistic view</span>
					</label>
				</div>
			)}
			
			{/* Loading overlay */}
			{loading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
					<div className="text-center">
						<div className="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
						<div className="text-gray-900 font-semibold mb-1">Loading Map</div>
						<div className="text-sm text-gray-500">Initializing Google Maps...</div>
					</div>
				</div>
			)}
			
			{/* Error overlay */}
			{error && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
					<div className="text-center p-8 max-w-md">
						<div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
							<svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</div>
						<div className="text-red-600 font-semibold mb-2">Map Load Error</div>
						<div className="text-sm text-gray-600">{error}</div>
						<div className="text-xs text-gray-500 mt-4">
							Check browser console for details
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default CustomerMapView;
