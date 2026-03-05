import {AlertCircle} from 'lucide-react';

interface JobErrorBannerProps {
	error?: string;
	details?: any;
	forceExpanded?: boolean;
}

export default function JobErrorBanner({error, details, forceExpanded}: JobErrorBannerProps) {

	if (!error) return null;

	const isExpanded = forceExpanded;
	const errorsList = details?.type === 'multiple_errors' && Array.isArray(details.errors) 
		? details.errors 
		: (details && details.type ? [details] : []);

	return (
		<div className='mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm'>
			<div className='flex w-full items-center justify-between text-left'>
				<div>
					<div className='mb-1 flex items-center gap-2 text-lg font-semibold text-red-700'>
						<AlertCircle size={20} />
						Segmentation Job Failed
					</div>
					<p className='text-sm text-red-600'>{error}</p>
				</div>
			</div>

			{isExpanded && errorsList.length > 0 && (
				<div className='mt-4 pt-4 border-t border-red-200 space-y-6'>
					{errorsList.map((err: any, idx: number) => {
						const isGeometryError = ['overlapping_geometry', 'invalid_geometry', 'empty_geometry'].includes(err.type);
						return (
							<div key={idx} className={idx > 0 ? 'pt-6 border-t border-red-200 border-dashed' : ''}>
								{err.type === 'unlocated_voters' && Array.isArray(err.voters) && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Voters Missing Geographic Coordinates</h4>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<table className='w-full text-left text-xs'>
												<thead className='sticky top-0 bg-red-50/80 backdrop-blur-sm border-b border-red-100'>
													<tr>
														<th className='p-3 font-medium text-red-700'>Voter ID</th>
														<th className='p-3 font-medium text-red-700'>Name</th>
														<th className='p-3 font-medium text-red-700'>EPIC Number</th>
													</tr>
												</thead>
												<tbody className='divide-y divide-red-100'>
													{err.voters.map((v: any) => (
														<tr key={v.id} className='hover:bg-red-50/50 transition-colors'>
															<td className='p-3 font-mono text-[10px] text-red-600'>{v.id}</td>
															<td className='p-3 text-red-900'>{v.full_name || 'N/A'}</td>
															<td className='p-3 text-red-900'>{v.epic_number || 'N/A'}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										{err.voters.length === 100 && (
											<p className='mt-2 text-[10px] italic text-red-500'>Showing maximum 100 offending records.</p>
										)}
									</div>
								)}

								{err.type === 'unassigned_voters' && Array.isArray(err.voters) && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Voters Not Assigned to Any Family</h4>
										<p className='mb-2 text-xs text-red-600'>These voters do not have a family_id assigned to them in the database.</p>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<table className='w-full text-left text-xs'>
												<thead className='sticky top-0 bg-red-50/80 backdrop-blur-sm border-b border-red-100'>
													<tr>
														<th className='p-3 font-medium text-red-700'>Voter ID</th>
														<th className='p-3 font-medium text-red-700'>Name</th>
														<th className='p-3 font-medium text-red-700'>EPIC Number</th>
													</tr>
												</thead>
												<tbody className='divide-y divide-red-100'>
													{err.voters.map((v: any) => (
														<tr key={v.id} className='hover:bg-red-50/50 transition-colors'>
															<td className='p-3 font-mono text-[10px] text-red-600'>{v.id}</td>
															<td className='p-3 text-red-900'>{v.full_name || 'N/A'}</td>
															<td className='p-3 text-red-900'>{v.epic_number || 'N/A'}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										{err.voters.length === 100 && (
											<p className='mt-2 text-[10px] italic text-red-500'>Showing maximum 100 offending records.</p>
										)}
									</div>
								)}

								{err.type === 'unsynced_families' && Array.isArray(err.families) && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Families Table Sync Issues</h4>
										<p className='mb-2 text-xs text-red-600'>The `member_count` in the families table does not match the actual voters found for these families.</p>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<table className='w-full text-left text-xs'>
												<thead className='sticky top-0 bg-red-50/80 backdrop-blur-sm border-b border-red-100'>
													<tr>
														<th className='p-3 font-medium text-red-700'>Family ID</th>
														<th className='p-3 font-medium text-red-700'>Expected Count</th>
														<th className='p-3 font-medium text-red-700'>Actual Count</th>
													</tr>
												</thead>
												<tbody className='divide-y divide-red-100'>
													{err.families.map((f: any) => (
														<tr key={f.id} className='hover:bg-red-50/50 transition-colors'>
															<td className='p-3 font-mono text-[10px] text-red-600'>{f.id}</td>
															<td className='p-3 text-red-900'>{f.expected_count}</td>
															<td className='p-3 text-red-900'>{f.actual_count}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										{err.families.length === 100 && (
											<p className='mt-2 text-[10px] italic text-red-500'>Showing maximum 100 offending records.</p>
										)}
									</div>
								)}

								{err.type === 'phantom_families' && Array.isArray(err.families) && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Phantom Families Detected</h4>
										<p className='mb-2 text-xs text-red-600'>These families exist in the families table but have no associated voters in the voters table.</p>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<table className='w-full text-left text-xs'>
												<thead className='sticky top-0 bg-red-50/80 backdrop-blur-sm border-b border-red-100'>
													<tr>
														<th className='p-3 font-medium text-red-700'>Family ID</th>
													</tr>
												</thead>
												<tbody className='divide-y divide-red-100'>
													{err.families.map((f: any, i: number) => (
														<tr key={f.id || i} className='hover:bg-red-50/50 transition-colors'>
															<td className='p-3 font-mono text-[10px] text-red-600'>{f.id}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										{err.families.length === 100 && (
											<p className='mt-2 text-[10px] italic text-red-500'>Showing maximum 100 offending records.</p>
										)}
									</div>
								)}

								{err.type === 'unassigned_families' && Array.isArray(err.families) && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Families Not Assigned to Any Segment</h4>
										<p className='mb-2 text-xs text-red-600'>These families have members but were not placed into any grid cell/segment.</p>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<table className='w-full text-left text-xs'>
												<thead className='sticky top-0 bg-red-50/80 backdrop-blur-sm border-b border-red-100'>
													<tr>
														<th className='p-3 font-medium text-red-700'>Family ID</th>
													</tr>
												</thead>
												<tbody className='divide-y divide-red-100'>
													{err.families.map((f: any, i: number) => (
														<tr key={f.id || i} className='hover:bg-red-50/50 transition-colors'>
															<td className='p-3 font-mono text-[10px] text-red-600'>{f.id}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										{err.families.length === 100 && (
											<p className='mt-2 text-[10px] italic text-red-500'>Showing maximum 100 offending records.</p>
										)}
									</div>
								)}

								{isGeometryError && (
									<div>
										<h4 className='mb-2 text-sm font-semibold text-red-800'>Segment Geometry Validation Failed</h4>
										<p className='mb-2 text-xs text-red-600'>Error type: {err.type}</p>
										<div className='max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-white shadow-sm'>
											<ul className='list-inside list-disc p-4 text-xs text-red-900 space-y-1.5'>
												{err.type === 'overlapping_geometry' && err.segment_pairs?.map((p: any, i: number) => (
													<li key={i} className="font-mono text-[10px] text-red-700">Overlaps: {p.a_id} and {p.b_id}</li>
												))}
												{['invalid_geometry', 'empty_geometry'].includes(err.type) && err.segments?.map((s: any, i: number) => (
													<li key={i} className="font-mono text-[10px] text-red-700">Segment ID: {s.id}</li>
												))}
											</ul>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
