import type {Segment} from '../types/api';
import {getSegmentCode} from '../services/segmentUtils';

type ColorLegendProps = {
	segments: Segment[];
};

const ColorLegend = ({segments}: ColorLegendProps) => (
	<div className='flex flex-col gap-2 text-xs'>
		<div className='panel-title'>Color Legend</div>
		<div className='grid grid-cols-2 gap-2'>
			{segments.map((segment) => (
				<div key={segment.id} className='flex items-center gap-2'>
					<span className='h-3 w-3 rounded-sm border border-slate-700' style={{backgroundColor: segment.color ?? '#64748b'}} />
					<span className='text-slate-200'>{getSegmentCode(segment)}</span>
				</div>
			))}
		</div>
	</div>
);

export default ColorLegend;
