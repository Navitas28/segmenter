import {useEffect, useMemo, useRef} from 'react';
import {MarkerClusterer} from '@googlemaps/markerclusterer';
import type {Booth, Segment} from '../../types/api';
import {getSegmentCode, getSegmentMembers} from '../../services/segmentUtils';
import {getMemberLatLng, hashToColor} from './utils';

type VoterLayerProps = {
	map: google.maps.Map;
	segments: Segment[];
	booths: Booth[];
	scopeType: 'AC' | 'BOOTH';
	selectedSegmentId: string | null;
	hoveredSegmentId: string | null;
	showVoters: boolean;
	showHeatmap: boolean;
	highlightFamilies: boolean;
	visualizationMode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	version: number | null;
	debouncedZoom: number;
};

type MarkerSet = {
	markers: google.maps.Marker[];
	boothMarkers: google.maps.Marker[];
	clusterer: MarkerClusterer | null;
	heatmap: google.maps.visualization.HeatmapLayer | null;
};

const CLUSTER_ZOOM_THRESHOLD = 11;

const VoterLayer = ({map, segments, booths, scopeType, selectedSegmentId, hoveredSegmentId, showVoters, showHeatmap, highlightFamilies, visualizationMode, version, debouncedZoom}: VoterLayerProps) => {
	const overlaysRef = useRef<MarkerSet>({markers: [], boothMarkers: [], clusterer: null, heatmap: null});
	const familyColors = useMemo(() => new Map<string, string>(), []);

	useEffect(() => {
		overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
		overlaysRef.current.boothMarkers.forEach((marker) => marker.setMap(null));
		if (overlaysRef.current.clusterer) {
			overlaysRef.current.clusterer.clearMarkers();
			overlaysRef.current.clusterer = null;
		}
		if (overlaysRef.current.heatmap) {
			overlaysRef.current.heatmap.setMap(null);
			overlaysRef.current.heatmap = null;
		}
		overlaysRef.current.markers = [];
		overlaysRef.current.boothMarkers = [];

		if (!showVoters) return;
		if (visualizationMode === 'responsibility') return;

		// Only show voters when a segment is selected
		if (!selectedSegmentId) return;

		const heatmapData: google.maps.visualization.WeightedLocation[] = [];

		const targetSegments = segments.filter((segment) => segment.id === selectedSegmentId);

		targetSegments.forEach((segment) => {
			const members = getSegmentMembers(segment);
			if (!members.length) return;

			const isSelected = segment.id === selectedSegmentId;
			const isHovered = segment.id === hoveredSegmentId;
			const fade = selectedSegmentId && !isSelected ? 0.2 : 1;
			const baseColor = hashToColor(getSegmentCode(segment), version);

			if (highlightFamilies) {
				members.forEach((member) => {
					const familyId = member.family_id ?? (member.metadata?.family_id as string | undefined);
					if (!familyId) return;
					if (!familyColors.has(familyId)) {
						familyColors.set(familyId, hashToColor(familyId, version));
					}
				});
			}

			members.forEach((member) => {
				const position = getMemberLatLng(member);
				if (!position) return;
				if (showHeatmap) {
					heatmapData.push({location: new google.maps.LatLng(position.lat, position.lng), weight: 1});
					return;
				}

				const familyId = member.family_id ?? (member.metadata?.family_id as string | undefined);
				const defaultColor = highlightFamilies && familyId ? familyColors.get(familyId) ?? baseColor : baseColor;
				const isFar = Boolean(member.is_far_from_booth);
				const isBoothMissing = member.booth_location_status === 'missing';
				const isMemberMissing = member.booth_location_status === 'member_location_missing';
				const color = isFar ? '#dc2626' : isBoothMissing ? '#d97706' : isMemberMissing ? '#64748b' : defaultColor;
				const scale = isFar ? 6 : isBoothMissing ? 5 : isMemberMissing ? 4.5 : isHovered || isSelected ? 5 : 4;
				const boothLabel = member.booth_name ?? (member.booth_number != null ? `Booth ${member.booth_number}` : 'Booth');
				const distanceLabel =
					member.distance_from_booth_m != null ? `${(Number(member.distance_from_booth_m) / 1000).toFixed(2)} km` : null;

				const marker = new google.maps.Marker({
					position,
					map: map ?? undefined,
					opacity: fade,
					title: isFar
						? `${member.full_name ?? 'Voter'} • ${boothLabel} • ${distanceLabel ?? '2 km away'}`
						: isBoothMissing
							? `${member.full_name ?? 'Voter'} • ${boothLabel} • Booth location unavailable`
							: isMemberMissing
								? `${member.full_name ?? 'Voter'} • ${boothLabel} • Member location unavailable`
								: `${member.full_name ?? 'Voter'} • ${boothLabel}`,
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale,
						fillColor: color,
						fillOpacity: 0.8,
						strokeColor: '#f8fafc',
						strokeWeight: isFar ? 1 : 0.5,
					},
					clickable: false,
				});
				overlaysRef.current.markers.push(marker);
			});
		});

		if (showHeatmap && heatmapData.length) {
			const heatmap = new google.maps.visualization.HeatmapLayer({
				data: heatmapData,
				opacity: visualizationMode === 'comparison' ? 0.45 : 0.6,
				radius: 18,
			});
			heatmap.setMap(map);
			overlaysRef.current.heatmap = heatmap;
		} else if (overlaysRef.current.markers.length && debouncedZoom <= CLUSTER_ZOOM_THRESHOLD) {
			overlaysRef.current.clusterer = new MarkerClusterer({map, markers: overlaysRef.current.markers});
		}

		if (scopeType === 'BOOTH') {
			booths.forEach((booth) => {
				if (booth.latitude == null || booth.longitude == null) return;
				const marker = new google.maps.Marker({
					position: {lat: Number(booth.latitude), lng: Number(booth.longitude)},
					map,
					icon: {
						path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
						scale: 10,
						fillColor: '#facc15',
						fillOpacity: 0.9,
						strokeColor: '#0f172a',
						strokeWeight: 1,
					},
					title: booth.name ?? booth.code ?? booth.id,
				});
				overlaysRef.current.boothMarkers.push(marker);
			});
		}
	}, [map, segments, booths, scopeType, selectedSegmentId, hoveredSegmentId, showVoters, showHeatmap, highlightFamilies, visualizationMode, version, debouncedZoom, familyColors]);

	return null;
};

export default VoterLayer;
