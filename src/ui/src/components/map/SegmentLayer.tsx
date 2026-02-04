import type {Booth, Segment} from '../../types/api';
import type {WedgeGeometry} from './WedgeGenerator';
import BoundaryLayer from './BoundaryLayer';
import VoterLayer from './VoterLayer';
import CentroidLayer from './CentroidLayer';

type DebugOptions = {
	showRawGeometry: boolean;
	showCentroidCoords: boolean;
	showBoundingBoxes: boolean;
	showClusteringIndex: boolean;
};

type SegmentLayerProps = {
	map: google.maps.Map;
	segments: Segment[];
	booths: Booth[];
	wedgeGeometries: Map<string, WedgeGeometry>;
	scopeType: 'AC' | 'BOOTH';
	selectedSegmentId: string | null;
	hoveredSegmentId: string | null;
	onSelectSegment: (segmentId: string) => void;
	onHoverSegment: (segmentId: string | null) => void;
	showBoundaries: boolean;
	showAllBoundaries: boolean;
	boundaryStyle: 'wedge' | 'bbox' | 'convexhull';
	showVoters: boolean;
	showCentroids: boolean;
	showGeometryBounds: boolean;
	showHeatmap: boolean;
	highlightFamilies: boolean;
	visualizationMode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	version: number | null;
	infoWindow: google.maps.InfoWindow | null;
	debouncedZoom: number;
	debugOptions: DebugOptions;
};

const SegmentLayer = ({
	map,
	segments,
	booths,
	wedgeGeometries,
	scopeType,
	selectedSegmentId,
	hoveredSegmentId,
	onSelectSegment,
	onHoverSegment,
	showBoundaries,
	showAllBoundaries,
	boundaryStyle,
	showVoters,
	showCentroids,
	showGeometryBounds,
	showHeatmap,
	highlightFamilies,
	visualizationMode,
	version,
	infoWindow,
	debouncedZoom,
	debugOptions,
}: SegmentLayerProps) => (
	<>
		<BoundaryLayer
			map={map}
			segments={segments}
			wedgeGeometries={wedgeGeometries}
			selectedSegmentId={selectedSegmentId}
			hoveredSegmentId={hoveredSegmentId}
			onSelectSegment={onSelectSegment}
			onHoverSegment={onHoverSegment}
			showBoundaries={showBoundaries}
			showAllBoundaries={showAllBoundaries}
			boundaryStyle={boundaryStyle}
			showGeometryBounds={showGeometryBounds}
			visualizationMode={visualizationMode}
			version={version}
			infoWindow={infoWindow}
			debugOptions={debugOptions}
		/>
		<VoterLayer
			map={map}
			segments={segments}
			booths={booths}
			scopeType={scopeType}
			selectedSegmentId={selectedSegmentId}
			hoveredSegmentId={hoveredSegmentId}
			showVoters={showVoters}
			showHeatmap={showHeatmap}
			highlightFamilies={highlightFamilies}
			visualizationMode={visualizationMode}
			version={version}
			debouncedZoom={debouncedZoom}
		/>
		<CentroidLayer
			map={map}
			segments={segments}
			wedgeGeometries={wedgeGeometries}
			selectedSegmentId={selectedSegmentId}
			hoveredSegmentId={hoveredSegmentId}
			onSelectSegment={onSelectSegment}
			onHoverSegment={onHoverSegment}
			showCentroids={showCentroids}
			visualizationMode={visualizationMode}
			version={version}
			infoWindow={infoWindow}
			debugOptions={debugOptions}
		/>
	</>
);

export default SegmentLayer;
