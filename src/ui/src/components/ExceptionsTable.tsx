import type {ExceptionRecord} from '../types/api';
import JsonViewer from './JsonViewer';

type ExceptionsTableProps = {
	exceptions: ExceptionRecord[];
};

const ExceptionsTable = ({exceptions}: ExceptionsTableProps) => (
	<div className='space-y-3'>
		<div className='overflow-auto rounded-md border border-slate-800'>
			<table className='min-w-full text-xs'>
				<thead className='bg-slate-900 text-slate-400'>
					<tr>
						<th className='px-2 py-2 text-left'>ID</th>
						<th className='px-2 py-2 text-left'>Type</th>
						<th className='px-2 py-2 text-left'>Created</th>
					</tr>
				</thead>
				<tbody>
					{exceptions.map((exception) => (
						<tr key={exception.id} className='border-t border-slate-800'>
							<td className='px-2 py-2'>{exception.id}</td>
							<td className='px-2 py-2'>{exception.exception_type ?? 'n/a'}</td>
							<td className='px-2 py-2'>{exception.created_at ?? 'n/a'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
		<JsonViewer title='Exception Metadata' data={exceptions.map((item) => item.metadata ?? {})} />
	</div>
);

export default ExceptionsTable;
