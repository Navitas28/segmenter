import Toggle from '../Toggle';
import {useConsoleStore} from '../../store/useConsoleStore';

type MapControlsProps = {
	map: google.maps.Map | null;
	versionOptions: number[];
	selectedVersion: number | null;
	baseVersion: number | null;
	compareVersion: number | null;
	onFitToSegments: () => void;
};

const modes: {key: 'operational' | 'responsibility' | 'comparison'; label: string}[] = [
	{key: 'operational', label: 'Operational'},
	{key: 'responsibility', label: 'Responsibility'},
	{key: 'comparison', label: 'Comparison'},
];

const MapControls = ({map, versionOptions, selectedVersion, baseVersion, compareVersion, onFitToSegments}: MapControlsProps) => {
	const {
		visualizationMode,
		setVisualizationMode,
		showBoundaries,
		showAllBoundaries,
		boundaryStyle,
		showVoters,
		showCentroids,
		showHeatmap,
		showGeometryBounds,
		showRawGeometry,
		showCentroidCoords,
		showBoundingBoxes,
		showClusteringIndex,
		selectedSegmentId,
		setShowBoundaries,
		setShowAllBoundaries,
		setBoundaryStyle,
		setShowVoters,
		setShowCentroids,
		setShowHeatmap,
		setShowGeometryBounds,
		setShowRawGeometry,
		setShowCentroidCoords,
		setShowBoundingBoxes,
		setShowClusteringIndex,
		setCompareVersionA,
		setCompareVersionB,
	} = useConsoleStore();

	const isDebugMode = visualizationMode === 'debug';

	return (
		<div className='flex flex-col gap-3'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div className='flex flex-wrap gap-2'>
					{modes.map((mode) => (
						<button
							key={mode.key}
							type='button'
							onClick={() => setVisualizationMode(mode.key)}
							className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
								visualizationMode === mode.key ? 'bg-cyan-600 text-slate-950 border-cyan-500' : 'bg-slate-800 text-slate-200 border-slate-700'
							}`}
						>
							{mode.label}
						</button>
					))}
					<button
						type='button'
						onClick={() => setVisualizationMode(isDebugMode ? 'operational' : 'debug')}
						className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${isDebugMode ? 'bg-rose-400 text-slate-950 border-rose-300' : 'bg-slate-800 text-slate-200 border-slate-700'}`}
					>
						Enable Debug Mode
					</button>
				</div>
				<button type='button' className='button button-secondary' onClick={onFitToSegments} disabled={!map}>
					Fit to Segments
				</button>
			</div>

			{visualizationMode === 'comparison' ? (
				<div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
					<select className='select' value={baseVersion ?? ''} onChange={(event) => setCompareVersionA(event.target.value ? Number(event.target.value) : null)}>
						<option value=''>Version A (Base)</option>
						{versionOptions.map((version) => (
							<option key={version} value={version}>
								Version {version}
							</option>
						))}
					</select>
					<select className='select' value={compareVersion ?? ''} onChange={(event) => setCompareVersionB(event.target.value ? Number(event.target.value) : null)}>
						<option value=''>Version B (Compare)</option>
						{versionOptions.map((version) => (
							<option key={version} value={version}>
								Version {version}
							</option>
						))}
					</select>
				</div>
			) : null}

			<div className='flex flex-col gap-3'>
				<div className='grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3'>
					<Toggle label='Show boundaries' checked={showBoundaries} onChange={() => setShowBoundaries(!showBoundaries)} />
					<Toggle label='Show all boundaries' checked={showAllBoundaries} onChange={() => setShowAllBoundaries(!showAllBoundaries)} />
					{selectedSegmentId && <Toggle label='Show voters (selected segment)' checked={showVoters} onChange={() => setShowVoters(!showVoters)} />}
					<Toggle label='Show centroids' checked={showCentroids} onChange={() => setShowCentroids(!showCentroids)} />
					<Toggle label='Heatmap' checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
					<Toggle label='Geometry bounds' checked={showGeometryBounds} onChange={() => setShowGeometryBounds(!showGeometryBounds)} />
				</div>

				<div className='flex items-center gap-3'>
					<span className='text-xs font-semibold text-slate-400'>Boundary Style:</span>
					<div className='flex gap-2'>
						<button
							type='button'
							onClick={() => setBoundaryStyle('wedge')}
							className={`rounded-md border px-3 py-1 text-xs ${boundaryStyle === 'wedge' ? 'bg-cyan-600 text-slate-950 border-cyan-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
						>
							Wedge/Pie
						</button>
						<button
							type='button'
							onClick={() => setBoundaryStyle('bbox')}
							className={`rounded-md border px-3 py-1 text-xs ${boundaryStyle === 'bbox' ? 'bg-cyan-600 text-slate-950 border-cyan-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
						>
							Bounding Box
						</button>
						<button
							type='button'
							onClick={() => setBoundaryStyle('convexhull')}
							className={`rounded-md border px-3 py-1 text-xs ${boundaryStyle === 'convexhull' ? 'bg-cyan-600 text-slate-950 border-cyan-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
						>
							Convex Hull
						</button>
					</div>
				</div>
			</div>

			{isDebugMode ? (
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Debug Overlays</div>
					<div className='mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2'>
						<Toggle label='Show raw geometry JSON' checked={showRawGeometry} onChange={() => setShowRawGeometry(!showRawGeometry)} />
						<Toggle label='Show centroid coordinates' checked={showCentroidCoords} onChange={() => setShowCentroidCoords(!showCentroidCoords)} />
						<Toggle label='Show bounding boxes' checked={showBoundingBoxes} onChange={() => setShowBoundingBoxes(!showBoundingBoxes)} />
						<Toggle label='Show clustering index' checked={showClusteringIndex} onChange={() => setShowClusteringIndex(!showClusteringIndex)} />
					</div>
				</div>
			) : null}

			<div className='text-xs text-slate-500'>Active version: {selectedVersion ?? 'n/a'}</div>
		</div>
	);
};

export default MapControls;
