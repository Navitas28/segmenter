import type {Segment} from '../types/api';
import {getSegmentCode, getSegmentFamilyCount, getSegmentHash, getSegmentVoterCount} from '../services/segmentUtils';

type SegmentsTableProps = {
	segments: Segment[];
	selectedId: string | null;
	showHashes: boolean;
	onSelect: (segmentId: string) => void;
};

const SegmentsTable = ({segments, selectedId, showHashes, onSelect}: SegmentsTableProps) => (
	<div className='overflow-auto rounded-md border border-slate-800'>
		<table className='min-w-full text-xs'>
			<thead className='bg-slate-900 text-slate-400'>
				<tr>
					<th className='px-2 py-2 text-left'>Segment Code</th>
					<th className='px-2 py-2 text-left'>Version</th>
					<th className='px-2 py-2 text-left'>Voter Count</th>
					<th className='px-2 py-2 text-left'>Family Count</th>
					{showHashes ? <th className='px-2 py-2 text-left'>Hash</th> : null}
					<th className='px-2 py-2 text-left'>Status</th>
					<th className='px-2 py-2 text-left'>Created At</th>
				</tr>
			</thead>
			<tbody>
				{segments.map((segment) => (
					<tr key={segment.id} className={`cursor-pointer border-t border-slate-800 ${segment.id === selectedId ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'}`} onClick={() => onSelect(segment.id)}>
						<td className='px-2 py-2 text-slate-100'>{getSegmentCode(segment)}</td>
						<td className='px-2 py-2'>{segment.version ?? segment.metadata?.version ?? 'n/a'}</td>
						<td className='px-2 py-2'>{getSegmentVoterCount(segment)}</td>
						<td className='px-2 py-2'>{getSegmentFamilyCount(segment)}</td>
						{showHashes ? <td className='px-2 py-2 font-mono text-[10px] text-slate-300 break-all'>{getSegmentHash(segment) ?? 'n/a'}</td> : null}
						<td className='px-2 py-2'>{segment.status ?? segment.metadata?.status ?? 'n/a'}</td>
						<td className='px-2 py-2'>{segment.created_at ?? segment.metadata?.created_at ?? 'n/a'}</td>
					</tr>
				))}
			</tbody>
		</table>
	</div>
);

export default SegmentsTable;
