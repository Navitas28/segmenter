import type {Segment, SegmentStatistics} from '../types/api';
import {buildIntegrityReport, getSegmentFamilyCount, getSegmentVoterCount} from '../services/segmentUtils';

type OverviewPanelProps = {
	segments: Segment[];
	stats?: SegmentStatistics | null;
	version?: number | null;
	runHash?: string | null;
	performance?: Record<string, unknown> | null;
};

const formatNumber = (value: number | null | undefined) => (value === null || value === undefined || Number.isNaN(value) ? 'n/a' : value.toLocaleString());

const OverviewPanel = ({segments, stats, version, runHash, performance}: OverviewPanelProps) => {
	const computedStats = stats ?? {
		totalSegments: segments.length,
		totalVoters: segments.reduce((sum, segment) => sum + getSegmentVoterCount(segment), 0),
		totalFamilies: segments.reduce((sum, segment) => sum + getSegmentFamilyCount(segment), 0),
		minVoters: Math.min(...segments.map((segment) => getSegmentVoterCount(segment))),
		maxVoters: Math.max(...segments.map((segment) => getSegmentVoterCount(segment))),
		avgVoters: segments.length > 0 ? Math.round(segments.reduce((sum, segment) => sum + getSegmentVoterCount(segment), 0) / segments.length) : 0,
	};

	const integrity = buildIntegrityReport(segments);

	return (
		<div className='space-y-4 text-sm'>
			<div className='grid grid-cols-2 gap-3'>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Totals</div>
					<div className='mt-2 space-y-1'>
						<div>Total voters: {formatNumber(computedStats.totalVoters)}</div>
						<div>Total segments: {formatNumber(computedStats.totalSegments)}</div>
						<div>Total families: {formatNumber(computedStats.totalFamilies)}</div>
					</div>
				</div>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Distribution</div>
					<div className='mt-2 space-y-1'>
						<div>Avg segment size: {formatNumber(computedStats.avgVoters)}</div>
						<div>Min size: {formatNumber(computedStats.minVoters)}</div>
						<div>Max size: {formatNumber(computedStats.maxVoters)}</div>
					</div>
				</div>
			</div>
			<div className='grid grid-cols-2 gap-3'>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Run Metadata</div>
					<div className='mt-2 space-y-1'>
						<div>Version: {version ?? 'n/a'}</div>
						<div className='mono break-all'>Run hash: {runHash ?? 'n/a'}</div>
					</div>
				</div>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Performance</div>
					<div className='mt-2 space-y-1'>
						<div>Algorithm time: {String(performance?.algorithm_time ?? 'n/a')}</div>
						<div>DB write time: {String(performance?.db_write_time ?? 'n/a')}</div>
						<div>Total time: {String(performance?.total_time ?? 'n/a')}</div>
					</div>
				</div>
			</div>
			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title'>Integrity Checks</div>
				<div className='mt-2 space-y-1'>
					<div className={integrity.tooLarge.length ? 'text-rose-300' : 'text-emerald-300'}>Segments &gt; 150 voters: {integrity.tooLarge.length || 0}</div>
					<div className={integrity.tooSmall.length ? 'text-rose-300' : 'text-emerald-300'}>Segments &lt; 80 voters: {integrity.tooSmall.length || 0}</div>
					<div className={integrity.duplicateVoters.length ? 'text-rose-300' : 'text-emerald-300'}>Duplicate voters: {integrity.duplicateVoters.length || 0}</div>
					<div className={integrity.missingMembers ? 'text-amber-300' : 'text-emerald-300'}>Member list available: {integrity.missingMembers ? 'Missing' : 'Yes'}</div>
				</div>
			</div>
		</div>
	);
};

export default OverviewPanel;
