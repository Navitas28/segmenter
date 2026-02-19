import {useEffect, useRef} from 'react';
import {MarkerClusterer} from '@googlemaps/markerclusterer';
import type {Segment} from '../../types/api';
import {getSegmentMembers, getSegmentCode} from '../../services/segmentUtils';
import {getMemberLatLng, hashToColor} from './utils';
import type {WedgeGeometry} from './WedgeGenerator';

type ComparisonLayerProps = {
	map: google.maps.Map;
	segments: Segment[];
	wedgeGeometries: Map<string, WedgeGeometry>;
	selectedSegmentId: string | null;
	showBoundaries: boolean;
	showVoters: boolean;
	version: number | null;
	infoWindow: google.maps.InfoWindow | null;
	debouncedZoom: number;
};

type OverlaySet = {
	polygons: google.maps.Polygon[];
	polylines: google.maps.Polyline[];
	markers: google.maps.Marker[];
	clusterer: MarkerClusterer | null;
};

const CLUSTER_ZOOM_THRESHOLD = 11;

const ComparisonLayer = ({map, segments, wedgeGeometries, selectedSegmentId, showBoundaries, showVoters, version, infoWindow, debouncedZoom}: ComparisonLayerProps) => {
	const overlaysRef = useRef<OverlaySet>({polygons: [], polylines: [], markers: [], clusterer: null});

	useEffect(() => {
		overlaysRef.current.polygons.forEach((polygon) => polygon.setMap(null));
		overlaysRef.current.polylines.forEach((line) => line.setMap(null));
		overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
		overlaysRef.current.polygons = [];
		overlaysRef.current.polylines = [];
		overlaysRef.current.markers = [];

		if (overlaysRef.current.clusterer) {
			overlaysRef.current.clusterer.clearMarkers();
			overlaysRef.current.clusterer = null;
		}

		segments.forEach((segment) => {
			const isSelected = segment.id === selectedSegmentId;
			const fade = selectedSegmentId && !isSelected ? 0.2 : 1;
			const color = hashToColor(getSegmentCode(segment), version);

			if (showBoundaries) {
				const geometry = wedgeGeometries.get(segment.id);
				if (geometry) {
					geometry.paths.forEach((path) => {
						const polygon = new google.maps.Polygon({
							paths: path,
							strokeColor: color,
							strokeOpacity: 0.55 * fade,
							strokeWeight: 1.5,
							fillColor: color,
							fillOpacity: 0.05 * fade,
							clickable: false,
						});
						polygon.setMap(map);
						overlaysRef.current.polygons.push(polygon);

						const dash = new google.maps.Polyline({
							path,
							strokeColor: color,
							strokeOpacity: 0.7 * fade,
							strokeWeight: 1,
							icons: [
								{
									icon: {path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2},
									offset: '0',
									repeat: '8px',
								},
							],
							clickable: false,
						});
						dash.setMap(map);
						overlaysRef.current.polylines.push(dash);
					});
				}
			}

			if (showVoters) {
				const members = getSegmentMembers(segment);
				members.forEach((member) => {
					const position = getMemberLatLng(member);
					if (!position) return;
					const marker = new google.maps.Marker({
						position,
						map,
						opacity: 0.55 * fade,
						icon: {
							path: google.maps.SymbolPath.CIRCLE,
							scale: 3.5,
							fillColor: color,
							fillOpacity: 0.6,
							strokeColor: '#f8fafc',
							strokeWeight: 0.4,
						},
						clickable: false,
					});
					overlaysRef.current.markers.push(marker);
				});
			}
		});

		if (overlaysRef.current.markers.length && debouncedZoom <= CLUSTER_ZOOM_THRESHOLD) {
			overlaysRef.current.clusterer = new MarkerClusterer({map, markers: overlaysRef.current.markers});
		}

		if (infoWindow) infoWindow.close();
	}, [map, segments, wedgeGeometries, selectedSegmentId, showBoundaries, showVoters, version, infoWindow, debouncedZoom]);

	return null;
};

export default ComparisonLayer;
