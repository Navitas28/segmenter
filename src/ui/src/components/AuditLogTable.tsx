import type {AuditLogRecord} from '../types/api';
import JsonViewer from './JsonViewer';

type AuditLogTableProps = {
	logs: AuditLogRecord[];
};

const AuditLogTable = ({logs}: AuditLogTableProps) => (
	<div className='space-y-3'>
		<div className='overflow-auto rounded-md border border-slate-800'>
			<table className='min-w-full text-xs'>
				<thead className='bg-slate-900 text-slate-400'>
					<tr>
						<th className='px-2 py-2 text-left'>ID</th>
						<th className='px-2 py-2 text-left'>Segment</th>
						<th className='px-2 py-2 text-left'>Created</th>
					</tr>
				</thead>
				<tbody>
					{logs.map((log) => (
						<tr key={log.id} className='border-t border-slate-800'>
							<td className='px-2 py-2'>{log.id}</td>
							<td className='px-2 py-2'>{log.segment_id ?? 'n/a'}</td>
							<td className='px-2 py-2'>{log.created_at ?? 'n/a'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
		<JsonViewer title='Audit Log Metadata' data={logs.map((item) => item.metadata ?? {})} />
	</div>
);

export default AuditLogTable;
