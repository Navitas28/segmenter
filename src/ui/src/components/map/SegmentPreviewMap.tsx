import {useEffect, useRef, useState} from 'react';
import type {Segment} from '../../types/api';
import {loadGoogleMaps} from '../../services/maps';
import {getSegmentBoundary, getSegmentCentroidLatLng, getSegmentCode} from '../../services/segmentUtils';
import {darkMapStyles, hashToColor, toLatLngArray} from './utils';

type SegmentPreviewMapProps = {
	segment: Segment;
};

const SegmentPreviewMap = ({segment}: SegmentPreviewMapProps) => {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const [map, setMap] = useState<google.maps.Map | null>(null);
	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

	useEffect(() => {
		if (!mapRef.current || map || !apiKey) return;
		loadGoogleMaps(apiKey)
			.then(() => {
				const instance = new google.maps.Map(mapRef.current as HTMLDivElement, {
					center: {lat: 20.5937, lng: 78.9629},
					zoom: 9,
					mapId: '62304de93ee45a67',
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
					styles: darkMapStyles,
					backgroundColor: '#0f172a',
				});
				setMap(instance);
			})
			.catch(() => {
				setMap(null);
			});
	}, [apiKey, map]);

	useEffect(() => {
		if (!map) return;
		const boundary = getSegmentBoundary(segment);
		const centroid = getSegmentCentroidLatLng(segment);
		const color = hashToColor(getSegmentCode(segment), segment.version ?? null);
		let polygon: google.maps.Polygon | null = null;
		let marker: google.maps.Marker | null = null;

		if (boundary) {
			const path = toLatLngArray(boundary);
			if (path.length) {
				polygon = new google.maps.Polygon({
					paths: path,
					strokeColor: color,
					strokeOpacity: 0.8,
					strokeWeight: 1.5,
					fillColor: color,
					fillOpacity: 0.1,
				});
				polygon.setMap(map);
				const bounds = new google.maps.LatLngBounds();
				path.forEach((point) => bounds.extend(point));
				map.fitBounds(bounds, 20);
			}
		}
		if (centroid) {
			marker = new google.maps.Marker({
				position: centroid,
				map,
				icon: {
					path: google.maps.SymbolPath.CIRCLE,
					scale: 5,
					fillColor: color,
					fillOpacity: 0.9,
					strokeColor: '#0f172a',
					strokeWeight: 1,
				},
			});
			if (!boundary) {
				map.setCenter(centroid);
				map.setZoom(12);
			}
		}

		return () => {
			if (polygon) polygon.setMap(null);
			if (marker) marker.setMap(null);
		};
	}, [map, segment]);

	if (!apiKey) {
		return <div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-amber-300'>Map preview requires `VITE_GOOGLE_MAPS_API_KEY`.</div>;
	}

	return <div ref={mapRef} className='h-40 w-full rounded-md border border-slate-800 bg-slate-900' />;
};

export default SegmentPreviewMap;
