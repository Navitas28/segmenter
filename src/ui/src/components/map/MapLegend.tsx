import type {Segment} from '../../types/api';
import {getSegmentCode, getSegmentVoterCount} from '../../services/segmentUtils';
import {hashToColor} from './utils';
import type {WedgeGeometry} from './WedgeGenerator';
import {useConsoleStore} from '../../store/useConsoleStore';

type MapLegendProps = {
	segments: Segment[];
	wedgeGeometries: Map<string, WedgeGeometry>;
	mode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	baseVersion: number | null;
	compareVersion: number | null;
};

const MapLegend = ({segments, wedgeGeometries, mode, baseVersion, compareVersion}: MapLegendProps) => {
	const {selectedSegmentId, setSelectedSegmentId, resetSelection} = useConsoleStore();

	return (
		<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-200'>
			<div className='flex items-center justify-between'>
				<div className='panel-title'>Legend</div>
				{selectedSegmentId && (
					<button type='button' onClick={() => resetSelection()} className='rounded-md bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-600'>
						Show All Segments
					</button>
				)}
			</div>
			{mode === 'comparison' ? (
				<div className='mt-2 flex flex-wrap gap-3 text-[11px] text-slate-300'>
					<div className='flex items-center gap-2'>
						<span className='h-3 w-6 rounded-sm border border-slate-500 bg-slate-300/20' />
						<span>Version A (solid)</span>
					</div>
					<div className='flex items-center gap-2'>
						<span className='h-3 w-6 rounded-sm border border-dashed border-slate-400 bg-slate-300/10' />
						<span>Version B (dashed)</span>
					</div>
					<div>
						Base: {baseVersion ?? 'n/a'} • Compare: {compareVersion ?? 'n/a'}
					</div>
				</div>
			) : null}
			<div className='mt-3 max-h-28 overflow-auto'>
				<div className='grid grid-cols-2 gap-2'>
					{segments.map((segment) => {
						const geometry = wedgeGeometries.get(segment.id);
						const angleSpan = geometry ? ((geometry.angleSpan * 180) / Math.PI).toFixed(1) : 'n/a';
						const angleRange = geometry ? `${((geometry.minAngle * 180) / Math.PI).toFixed(0)}° - ${((geometry.maxAngle * 180) / Math.PI).toFixed(0)}°` : 'n/a';
						const voters = getSegmentVoterCount(segment);
						const color = hashToColor(getSegmentCode(segment), mode === 'comparison' ? baseVersion ?? segment.version ?? null : segment.version ?? null);
						const isSelected = selectedSegmentId === segment.id;
						return (
							<button
								key={segment.id}
								type='button'
								onClick={() => setSelectedSegmentId(segment.id)}
								className={`flex items-center gap-2 rounded-md p-1 text-left transition-colors ${isSelected ? 'bg-slate-700/70 ring-1 ring-cyan-500' : 'hover:bg-slate-800/50'}`}
							>
								<span className='h-3 w-3 flex-shrink-0 rounded-sm border border-slate-700' style={{backgroundColor: color}} />
								<div className='flex flex-col min-w-0'>
									<span className='text-slate-200 font-medium'>{getSegmentCode(segment)}</span>
									<span className='text-[10px] text-slate-400'>{voters} voters</span>
									<span className='text-[9px] text-slate-500'>
										{angleRange} • Span: {angleSpan}°
									</span>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default MapLegend;
