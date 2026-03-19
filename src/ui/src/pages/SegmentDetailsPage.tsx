import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ChevronDown, ChevronRight, ArrowLeft, CheckCircle, XCircle} from 'lucide-react';
import {useCustomerStore} from '../store/useCustomerStore';
import {useSegments} from '../hooks/useConsoleQueries';
import type {Segment, SegmentMember} from '../types/api';
import {getSegmentFarVoterCount, getSegmentMissingBoothLocationCount} from '../services/segmentUtils';

const BOOTH_LOCATION_UNAVAILABLE_MESSAGE = 'Booth location not available. Add booth location to get the details.';

type MemberFilter = 'all' | 'far' | 'missing';

const SegmentDetailsPage = () => {
	const navigate = useNavigate();
	const {scopeType, assemblyId, boothId, selectedVersion} = useCustomerStore();
	const nodeId = scopeType === 'ac' ? assemblyId : boothId;
	const segmentsQuery = useSegments(nodeId ?? '', selectedVersion);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');

	const segments: Segment[] = Array.isArray(segmentsQuery.data)
		? segmentsQuery.data
		: segmentsQuery.data?.segments ?? [];

	const formatDate = (s: string | null | undefined) =>
		s ? new Date(s).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) : '—';

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4">
				<button
					type="button"
					onClick={() => navigate('/customer')}
					className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
				>
					<ArrowLeft size={18} />
					Back to map
				</button>
				<h1 className="text-lg font-semibold text-gray-900">All segment details</h1>
			</div>

			<div className="p-4 max-w-6xl mx-auto">
				{segments.length === 0 && !segmentsQuery.isLoading && (
					<div className="py-12 text-center text-gray-500">
						No segments. Select election, assembly/booth, and version on the map, then return here.
					</div>
				)}
				{segmentsQuery.isLoading && (
					<div className="py-12 text-center text-gray-500">Loading segments…</div>
				)}
				{segments.length > 0 && (
					<div className="space-y-2">
						{segments.map((segment) => {
							const members = (segment.members ?? segment.voters ?? []) as SegmentMember[];
							const farVoterCount = getSegmentFarVoterCount(segment);
							const missingBoothLocationCount = getSegmentMissingBoothLocationCount(segment);
							const filteredMembers = members.filter((member) => {
								if (memberFilter === 'far') return Boolean(member.is_far_from_booth);
								if (memberFilter === 'missing') return member.booth_location_status === 'missing';
								return true;
							});
							const isExpanded = expandedId === segment.id;
							return (
								<div
									key={segment.id}
									className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
								>
									<button
										type="button"
										onClick={() => setExpandedId(isExpanded ? null : segment.id)}
										className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
									>
										{isExpanded ? (
											<ChevronDown size={18} className="text-gray-500 shrink-0" />
										) : (
											<ChevronRight size={18} className="text-gray-500 shrink-0" />
										)}
										<div className="flex-1 min-w-0">
											<div className="font-medium text-gray-900 truncate">
												{segment.display_name ?? segment.segment_name ?? 'Segment'}
											</div>
											<div className="text-xs text-gray-500 mt-0.5">
												Created: {formatDate(segment.created_at)} · {segment.total_voters ?? 0} voters ·{' '}
												{segment.total_families ?? 0} families
											</div>
										</div>
										<div className="shrink-0 text-sm text-gray-600">
											{segment.total_voters ?? 0} voters
										</div>
									</button>
									{isExpanded && (
										<div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3">
											<div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
												Segment info
											</div>
											<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
												<div>
													<span className="text-gray-500">Segment name</span>
													<div className="font-medium text-gray-900">{segment.segment_name ?? '—'}</div>
												</div>
												<div>
													<span className="text-gray-500">Created</span>
													<div className="font-medium text-gray-900">{formatDate(segment.created_at)}</div>
												</div>
												<div>
													<span className="text-gray-500">Total voters</span>
													<div className="font-medium text-gray-900">{segment.total_voters ?? 0}</div>
												</div>
												<div>
													<span className="text-gray-500">Total families</span>
													<div className="font-medium text-gray-900">{segment.total_families ?? 0}</div>
												</div>
												{segment.centroid_lat != null && segment.centroid_lng != null && (
													<div className="col-span-2">
														<span className="text-gray-500">Centroid (lat, lng)</span>
														<div className="font-mono text-gray-900">
															{Number(segment.centroid_lat).toFixed(5)}, {Number(segment.centroid_lng).toFixed(5)}
														</div>
													</div>
												)}
												<div>
													<span className="text-gray-500">2 km away</span>
													<div className="font-medium text-rose-700">{farVoterCount}</div>
												</div>
												<div>
													<span className="text-gray-500">Booth location unavailable</span>
													<div className="font-medium text-amber-700">{missingBoothLocationCount}</div>
												</div>
											</div>
											<div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
												<div>
													<div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
														Voters in this segment ({members.length})
													</div>
													{memberFilter === 'missing' && missingBoothLocationCount > 0 ? (
														<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
															{BOOTH_LOCATION_UNAVAILABLE_MESSAGE}
														</div>
													) : null}
												</div>
												<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
													<span>Filter voters</span>
													<select
														value={memberFilter}
														onChange={(event) => setMemberFilter(event.target.value as MemberFilter)}
														className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium normal-case text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
													>
														<option value="all">All voters</option>
														<option value="far">2 km away</option>
														<option value="missing">Booth location unavailable</option>
													</select>
												</label>
											</div>
											{members.length === 0 ? (
												<div className="text-sm text-gray-500 py-2">No voter list loaded.</div>
											) : (
												<div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-inner">
													<table className="w-full text-sm">
														<thead className="bg-gradient-to-r from-slate-50 to-slate-100 sticky top-0 z-10">
															<tr>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">EPIC No.</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Age</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Verified</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Relation</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Booth</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Distance</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Lat</th>
																<th className="text-left px-4 py-3 font-semibold text-gray-700">Lng</th>
															</tr>
														</thead>
														<tbody>
															{filteredMembers.map((m, i) => (
																<tr
																	key={m.voter_id ?? i}
																	className={`border-t border-gray-100 transition-colors ${
																		m.is_far_from_booth
																			? 'bg-rose-50/70 hover:bg-rose-100'
																			: m.booth_location_status === 'missing'
																				? 'bg-amber-50/70 hover:bg-amber-100'
																				: 'hover:bg-blue-50/50'
																	}`}
																>
																	<td className="px-4 py-2.5">
																		<div className="font-medium text-gray-900">{m.full_name ?? '—'}</div>
																		{m.serial_number && (
																			<div className="text-xs text-gray-500 font-mono mt-0.5">Serial: {m.serial_number}</div>
																		)}
																	</td>
																	<td className="px-4 py-2.5">
																		<span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
																			{m.epic_number ?? '—'}
																		</span>
																	</td>
																	<td className="px-4 py-2.5 text-gray-700">{m.age != null ? m.age : '—'}</td>
																	<td className="px-4 py-2.5">
																		{m.latitude ? (
																			<span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
																				<CheckCircle size={12} /> Verified
																			</span>
																		) : (
																			<span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium">
																				<XCircle size={12} /> Unverified
																			</span>
																		)}
																	</td>
																	<td className="px-4 py-2.5 text-gray-600">
																		{m.relation_name ? (
																			<div>
																				<div className="text-gray-900">{m.relation_name}</div>
																				{m.relation_type && <div className="text-xs text-gray-500 mt-0.5">{m.relation_type}</div>}
																			</div>
																		) : (
																			'—'
																		)}
																	</td>
																	<td className="px-4 py-2.5 text-gray-600">
																		{m.booth_name ?? (m.booth_number != null ? `Booth ${m.booth_number}` : '—')}
																	</td>
																	<td className="px-4 py-2.5">
																		{m.is_far_from_booth ? (
																			<span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
																				2 km away
																			</span>
																		) : m.booth_location_status === 'missing' ? (
																			<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
																				Booth location unavailable
																			</span>
																		) : m.booth_location_status === 'member_location_missing' ? (
																			<span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
																				Member location unavailable
																			</span>
																		) : (
																			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
																				Normal
																			</span>
																		)}
																	</td>
																	<td className="px-4 py-2.5 font-mono text-gray-600 text-xs">
																		{m.distance_from_booth_m != null ? `${(Number(m.distance_from_booth_m) / 1000).toFixed(2)} km` : '—'}
																	</td>
																	<td className="px-4 py-2.5 font-mono text-gray-600 text-xs">
																		{m.latitude != null ? Number(m.latitude).toFixed(5) : '—'}
																	</td>
																	<td className="px-4 py-2.5 font-mono text-gray-600 text-xs">
																		{m.longitude != null ? Number(m.longitude).toFixed(5) : '—'}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											)}
											{members.length > 0 && filteredMembers.length === 0 ? (
												<div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
													No voters match the selected filter in this segment.
												</div>
											) : null}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

export default SegmentDetailsPage;
