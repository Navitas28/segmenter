import {useEffect, useMemo, useRef, useState} from 'react';
import type {Booth, Segment} from '../../types/api';
import {loadGoogleMaps} from '../../services/maps';
import {useConsoleStore} from '../../store/useConsoleStore';
import {computeClusteringIndex, darkMapStyles, getSegmentBounds} from './utils';
import type {WedgeGeometry} from './WedgeGenerator';
import {buildWedgeGeometries, getWedgeBounds} from './WedgeGenerator';
import MapControls from './MapControls';
import MapLegend from './MapLegend';
import SegmentLayer from './SegmentLayer';
import ComparisonLayer from './ComparisonLayer';

type MapContainerProps = {
	segments: Segment[];
	baseSegments: Segment[];
	compareSegments: Segment[];
	booths: Booth[];
	scopeType: 'AC' | 'BOOTH';
	selectedVersion: number | null;
	baseVersion: number | null;
	compareVersion: number | null;
	versionOptions: number[];
	performanceMetrics?: Record<string, unknown> | null;
};

const NEUTRAL_CENTER = {lat: 0, lng: 0};
const NEUTRAL_ZOOM = 2;
const FIT_PADDING = {top: 80, bottom: 80, left: 80, right: 80};
const SMALL_BOUNDS_THRESHOLD = 0.0005;
const MIN_FIT_ZOOM = 10;
const MAX_FIT_ZOOM = 15;

const MapContainer = ({segments, baseSegments, compareSegments, booths, scopeType, selectedVersion, baseVersion, compareVersion, versionOptions, performanceMetrics}: MapContainerProps) => {
	const {
		visualizationMode,
		showBoundaries,
		showAllBoundaries,
		boundaryStyle,
		showVoters,
		showCentroids,
		showGeometryBounds,
		highlightFamilies,
		showHeatmap,
		showRawGeometry,
		showCentroidCoords,
		showBoundingBoxes,
		showClusteringIndex,
		selectedSegmentId,
		setSelectedSegmentId,
		resetSelection,
	} = useConsoleStore();

	const mapRef = useRef<HTMLDivElement | null>(null);
	const [map, setMap] = useState<google.maps.Map | null>(null);
	const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
	const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
	const ignoreMapClickRef = useRef(false);
	const [debouncedZoom, setDebouncedZoom] = useState(5);

	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

	useEffect(() => {
		if (!mapRef.current || map) return;
		if (!apiKey) return;

		loadGoogleMaps(apiKey)
			.then(() => {
				const instance = new google.maps.Map(mapRef.current as HTMLDivElement, {
					center: NEUTRAL_CENTER,
					zoom: NEUTRAL_ZOOM,
					mapId: '62304de93ee45a67',
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
					styles: darkMapStyles,
					backgroundColor: '#0f172a',
				});
				infoWindowRef.current = new google.maps.InfoWindow();
				setMap(instance);
			})
			.catch(() => {
				setMap(null);
			});
	}, [apiKey, map]);

	useEffect(() => {
		if (!map) return;
		const listener = map.addListener('click', () => {
			if (ignoreMapClickRef.current) {
				ignoreMapClickRef.current = false;
				return;
			}
			resetSelection();
		});
		return () => listener.remove();
	}, [map, resetSelection]);

	useEffect(() => {
		if (!map) return;
		const listener = map.addListener('tilesloaded', () => {});
		return () => listener.remove();
	}, [map]);

	useEffect(() => {
		if (!map) return;
		let timeout: number | null = null;
		const listener = map.addListener('zoom_changed', () => {
			if (timeout) window.clearTimeout(timeout);
			timeout = window.setTimeout(() => {
				const zoom = map.getZoom();
				setDebouncedZoom(zoom ?? 5);
			}, 160);
		});
		return () => {
			if (timeout) window.clearTimeout(timeout);
			listener.remove();
		};
	}, [map]);

	const handleSelectSegment = (segmentId: string) => {
		ignoreMapClickRef.current = true;
		setSelectedSegmentId(segmentId);
		window.setTimeout(() => {
			ignoreMapClickRef.current = false;
		}, 0);
	};

	const activeSegments = visualizationMode === 'comparison' && baseSegments.length ? baseSegments : segments;
	const wedgeGeometries = useMemo(() => buildWedgeGeometries(activeSegments), [activeSegments]);
	const compareWedgeGeometries = useMemo(() => buildWedgeGeometries(compareSegments), [compareSegments]);

	const fitMapToWedges = (geometries: Iterable<WedgeGeometry>) => {
		if (!map) return;
		const bounds = new google.maps.LatLngBounds();
		for (const geometry of geometries) {
			geometry.path.forEach((point) => bounds.extend(point));
		}
		if (bounds.isEmpty()) return;
		map.fitBounds(bounds, FIT_PADDING);
		const northEast = bounds.getNorthEast();
		const southWest = bounds.getSouthWest();
		const latSpan = Math.abs(northEast.lat() - southWest.lat());
		const lngSpan = Math.abs(northEast.lng() - southWest.lng());
		window.setTimeout(() => {
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') {
				if (latSpan < SMALL_BOUNDS_THRESHOLD && lngSpan < SMALL_BOUNDS_THRESHOLD) {
					if (currentZoom > MAX_FIT_ZOOM) {
						map.setZoom(MAX_FIT_ZOOM);
					}
				} else if (currentZoom < MIN_FIT_ZOOM) {
					map.setZoom(MIN_FIT_ZOOM);
				}
			}
		}, 100);
	};

	const scheduleFitToWedges = (geometries: Iterable<WedgeGeometry>) => {
		if (!map) return;
		let rafId = 0;
		let rafId2 = 0;
		rafId = window.requestAnimationFrame(() => {
			rafId2 = window.requestAnimationFrame(() => {
				fitMapToWedges(geometries);
			});
		});
		return () => {
			if (rafId) window.cancelAnimationFrame(rafId);
			if (rafId2) window.cancelAnimationFrame(rafId2);
		};
	};

	useEffect(() => {
		if (!map) return;
		if (!selectedSegmentId) return;
		const sourceSegments = visualizationMode === 'comparison' && baseSegments.length ? baseSegments : segments;
		const selectedSegment = sourceSegments.find((segment) => segment.id === selectedSegmentId);
		if (!selectedSegment) return;
		const wedgeGeometry = wedgeGeometries.get(selectedSegment.id);
		const bounds = wedgeGeometry ? getWedgeBounds(wedgeGeometry) : getSegmentBounds(selectedSegment);
		if (!bounds.isEmpty()) {
			map.fitBounds(bounds, 40);
		}
	}, [map, selectedSegmentId, segments, baseSegments, visualizationMode, wedgeGeometries]);

	useEffect(() => {
		if (!map) return;
		if (wedgeGeometries.size === 0) return;
		const cleanup = scheduleFitToWedges(wedgeGeometries.values());
		return () => {
			if (cleanup) cleanup();
		};
	}, [map, wedgeGeometries, selectedVersion, baseVersion, compareVersion, scopeType, visualizationMode]);

	const fitToSegments = () => {
		if (!map) return;
		scheduleFitToWedges(wedgeGeometries.values());
	};

	const comparisonEnabled = visualizationMode === 'comparison' && !!baseVersion && !!compareVersion;
	const selectedSegment = useMemo(() => activeSegments.find((segment) => segment.id === selectedSegmentId) ?? null, [activeSegments, selectedSegmentId]);
	const clusteringIndex = selectedSegment && showClusteringIndex ? computeClusteringIndex(selectedSegment) : null;
	const debugOptions = useMemo(
		() => ({
			showRawGeometry,
			showCentroidCoords,
			showBoundingBoxes,
			showClusteringIndex,
		}),
		[showRawGeometry, showCentroidCoords, showBoundingBoxes, showClusteringIndex],
	);

	return (
		<div className='panel h-full flex flex-col gap-3'>
			<MapControls map={map} versionOptions={versionOptions} selectedVersion={selectedVersion} baseVersion={baseVersion} compareVersion={compareVersion} onFitToSegments={fitToSegments} />
			{!apiKey ? <div className='text-sm text-amber-300'>Google Maps API key missing. Set `VITE_GOOGLE_MAPS_API_KEY` in `src/ui/.env`.</div> : null}
			<div ref={mapRef} className='flex-1 rounded-md border border-slate-800 bg-slate-900' />
			<MapLegend segments={activeSegments} wedgeGeometries={wedgeGeometries} mode={visualizationMode} baseVersion={baseVersion} compareVersion={compareVersion} />
			{visualizationMode === 'debug' && performanceMetrics ? (
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300'>
					<div className='panel-title'>Performance Metrics</div>
					<div className='mt-2 grid grid-cols-2 gap-2'>
						<div>Algorithm time: {String(performanceMetrics.algorithm_time ?? 'n/a')}</div>
						<div>DB write time: {String(performanceMetrics.db_write_time ?? 'n/a')}</div>
						<div>Total time: {String(performanceMetrics.total_time ?? 'n/a')}</div>
					</div>
				</div>
			) : null}
			{visualizationMode === 'debug' && showClusteringIndex ? (
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300'>
					<div className='panel-title'>Clustering Index</div>
					<div className='mt-2'>{selectedSegment ? <span>Avg distance from centroid: {clusteringIndex !== null ? clusteringIndex.toFixed(6) : 'n/a'}</span> : <span>Select a segment to view clustering index.</span>}</div>
				</div>
			) : null}
			{visualizationMode === 'debug' && showRawGeometry ? (
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300'>
					<div className='panel-title'>Raw Geometry JSON</div>
					<div className='mt-2 max-h-40 overflow-auto rounded-md border border-slate-800 bg-slate-950/40 p-2'>
						<pre className='whitespace-pre-wrap'>{selectedSegment ? JSON.stringify(selectedSegment.boundary_geojson ?? selectedSegment.metadata?.boundary_geojson ?? {}, null, 2) : 'Select a segment to view geometry.'}</pre>
					</div>
				</div>
			) : null}
			{map ? (
				<>
					<SegmentLayer
						map={map}
						segments={activeSegments}
						wedgeGeometries={wedgeGeometries}
						booths={booths}
						scopeType={scopeType}
						selectedSegmentId={selectedSegmentId}
						hoveredSegmentId={hoveredSegmentId}
						onSelectSegment={handleSelectSegment}
						onHoverSegment={setHoveredSegmentId}
						showBoundaries={showBoundaries}
						showAllBoundaries={showAllBoundaries}
						boundaryStyle={boundaryStyle}
						showVoters={showVoters}
						showCentroids={showCentroids}
						showGeometryBounds={showGeometryBounds}
						showHeatmap={showHeatmap}
						highlightFamilies={highlightFamilies}
						visualizationMode={visualizationMode}
						version={visualizationMode === 'comparison' ? baseVersion : selectedVersion}
						infoWindow={infoWindowRef.current}
						debouncedZoom={debouncedZoom}
						debugOptions={debugOptions}
					/>
					{comparisonEnabled ? (
						<ComparisonLayer
							map={map}
							segments={compareSegments}
							wedgeGeometries={compareWedgeGeometries}
							selectedSegmentId={selectedSegmentId}
							showBoundaries={showBoundaries}
							showVoters={showVoters}
							version={compareVersion}
							infoWindow={infoWindowRef.current}
							debouncedZoom={debouncedZoom}
						/>
					) : null}
				</>
			) : null}
		</div>
	);
};

export default MapContainer;
