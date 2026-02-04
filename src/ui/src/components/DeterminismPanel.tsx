import type {DeterminismResult} from '../types/api';
import JsonViewer from './JsonViewer';

type DeterminismPanelProps = {
	result: DeterminismResult | null;
};

const DeterminismPanel = ({result}: DeterminismPanelProps) => {
	if (!result) {
		return <div className='text-sm text-slate-400'>Run the determinism check to populate data.</div>;
	}

	return (
		<div className='space-y-3 text-sm'>
			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title'>Result</div>
				<div className={`mt-2 ${result.deterministic ? 'text-emerald-300' : 'text-rose-300'}`}>{result.deterministic ? 'Deterministic' : 'Mismatch detected'}</div>
				<div className='mono mt-2 break-all'>Run hash 1: {result.hash_run_1}</div>
				<div className='mono mt-2 break-all'>Run hash 2: {result.hash_run_2}</div>
				<div className='mt-2 text-slate-400'>Segments: {result.segments_count}</div>
			</div>
			{result.mismatch ? <JsonViewer title='Mismatch Detail' data={result.mismatch} defaultOpen /> : <div className='text-xs text-slate-500'>No mismatch payload returned.</div>}
		</div>
	);
};

export default DeterminismPanel;
