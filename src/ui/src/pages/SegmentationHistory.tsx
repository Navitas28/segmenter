import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft, Eye, Calendar, User, MapPin, ChevronLeft, ChevronRight, Layers} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useElections, useAcNodes, useHierarchyBoothNodes} from '../hooks/useConsoleQueries';
import {getSegmentationHistory} from '../services/api';
import {useCustomerStore} from '../store/useCustomerStore';

const ITEMS_PER_PAGE = 5;

const SegmentationHistory = () => {
	const navigate = useNavigate();
	const {setElectionId, setNodeId, setJobId, setSelectedVersion} = useCustomerStore();
	const [page, setPage] = useState(1);
	const [scopeType, setScopeType] = useState<'ac' | 'booth'>('ac');
	const [filterElectionId, setFilterElectionId] = useState('');
	const [filterAssemblyId, setFilterAssemblyId] = useState('');
	const [filterBoothId, setFilterBoothId] = useState('');

	const electionsQuery = useElections();
	const acNodesQuery = useAcNodes(filterElectionId);
	// Booths are fetched from hierarchy_nodes (children of assembly), not booths table
	const boothNodesQuery = useHierarchyBoothNodes(filterElectionId, filterAssemblyId);
	// Jobs filtered by node_id: when booth selected use booth node id, else assembly node id (segmentation_jobs.node_id can be either)
	const filterNodeId = filterBoothId || filterAssemblyId;

	const historyQuery = useQuery({
		queryKey: ['segmentationHistory', filterElectionId, filterNodeId, page],
		queryFn: () => getSegmentationHistory({
			election_id: filterElectionId || undefined,
			node_id: filterNodeId || undefined,
			page,
			limit: ITEMS_PER_PAGE,
		}),
		enabled: true,
	});

	const handleViewSegmentation = (job: any) => {
		setElectionId(job.election_id);
		setNodeId(job.node_id);
		setJobId(job.id);
		setSelectedVersion(job.version);
		navigate('/customer');
	};

	const jobs = historyQuery.data?.jobs ?? [];
	const totalPages = Math.ceil((historyQuery.data?.total ?? 0) / ITEMS_PER_PAGE);

	return (
		<div className="h-screen w-screen bg-gray-50 flex flex-col">
			{/* Header */}
			<div className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
				<button
					type="button"
					onClick={() => navigate('/customer')}
					className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
				>
					<ArrowLeft size={18} />
				</button>
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
						<Layers size={18} className="text-white" />
					</div>
					<span className="text-base font-semibold text-gray-900">History</span>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto">
				<div className="max-w-6xl mx-auto p-6 space-y-6">
					{/* Filters */}
					<div className="bg-white rounded-xl border border-gray-200 p-4">
						<div className="flex flex-wrap items-center gap-3">
							{/* Scope: Assembly | Booth (same as customer header) */}
							<div className="flex rounded-lg border border-gray-300 overflow-hidden">
								<button
									type="button"
									onClick={() => {
										setScopeType('ac');
										setFilterAssemblyId('');
										setFilterBoothId('');
										setPage(1);
									}}
									className={`h-9 px-3 text-sm font-medium transition-colors ${scopeType === 'ac' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
								>
									Assembly
								</button>
								<button
									type="button"
									onClick={() => {
										setScopeType('booth');
										setFilterAssemblyId('');
										setFilterBoothId('');
										setPage(1);
									}}
									className={`h-9 px-3 text-sm font-medium transition-colors ${scopeType === 'booth' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
								>
									Booth
								</button>
							</div>

							<select
								className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								value={filterElectionId}
								onChange={(e) => {
									setFilterElectionId(e.target.value);
									setFilterAssemblyId('');
									setFilterBoothId('');
									setPage(1);
								}}
							>
								<option value="">All Elections</option>
								{electionsQuery.data?.map((election) => (
									<option key={election.id} value={election.id}>
										{election.name ?? election.code ?? election.id}
									</option>
								))}
							</select>

							<select
								className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								value={filterAssemblyId}
								onChange={(e) => {
									setFilterAssemblyId(e.target.value);
									setFilterBoothId('');
									setPage(1);
								}}
								disabled={!filterElectionId}
							>
								<option value="">{scopeType === 'booth' ? 'Select Assembly first' : 'All Assemblies'}</option>
								{acNodesQuery.data?.map((node) => (
									<option key={node.id} value={node.id}>
										{node.name ?? node.code ?? node.id}
									</option>
								))}
							</select>

							{scopeType === 'booth' && (
								<select
									className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
									value={filterBoothId}
									onChange={(e) => {
										setFilterBoothId(e.target.value);
										setPage(1);
									}}
									disabled={!filterAssemblyId}
								>
									<option value="">
										{!filterAssemblyId
											? 'Select Assembly first'
											: boothNodesQuery.isLoading
												? 'Loading booths...'
												: boothNodesQuery.isError
													? 'Error loading booths'
													: !boothNodesQuery.data?.length
														? 'No booths in this assembly'
														: 'All Booths'}
									</option>
									{(boothNodesQuery.data ?? []).map((node) => (
										<option key={node.id} value={node.id}>
											{node.name ?? node.code ?? node.id}
										</option>
									))}
								</select>
							)}

							{(filterElectionId || filterAssemblyId || filterBoothId) && (
								<button
									type="button"
									onClick={() => {
										setFilterElectionId('');
										setFilterAssemblyId('');
										setFilterBoothId('');
										setPage(1);
									}}
									className="h-9 px-4 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
								>
									Clear
								</button>
							)}
						</div>
					</div>

					{/* Results */}
					<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
						{historyQuery.isLoading ? (
							<div className="p-12 text-center">
								<div className="inline-block w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
								<p className="mt-4 text-sm text-gray-500">Loading history...</p>
							</div>
						) : historyQuery.error ? (
							<div className="p-12 text-center">
								<p className="text-sm font-medium text-red-600">Error loading history</p>
								<p className="mt-2 text-xs text-gray-500 max-w-md mx-auto break-all">
									{historyQuery.error instanceof Error ? historyQuery.error.message : String(historyQuery.error)}
								</p>
							</div>
						) : jobs.length === 0 ? (
							<div className="p-12 text-center">
								<p className="text-sm text-gray-500">No segmentation jobs found</p>
							</div>
						) : (
							<>
								<div className="divide-y divide-gray-100">
									{jobs.map((job: any) => (
										<div key={job.id} className="p-5 hover:bg-gray-50 transition-colors">
											<div className="flex items-start justify-between gap-4">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-3 mb-2">
														<h3 className="text-base font-semibold text-gray-900 truncate">
															{job.version_name ?? `Version ${job.version}`}
														</h3>
														<span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
															job.status === 'completed' ? 'bg-green-100 text-green-700' :
															job.status === 'running' ? 'bg-blue-100 text-blue-700' :
															job.status === 'failed' ? 'bg-red-100 text-red-700' :
															'bg-gray-100 text-gray-700'
														}`}>
															{job.status}
														</span>
													</div>

													{job.version_description && (
														<p className="text-sm text-gray-600 mb-3 line-clamp-2">{job.version_description}</p>
													)}

													<div className="flex items-center gap-4 text-xs text-gray-500">
														<div className="flex items-center gap-1.5">
															<Calendar size={14} />
															<span>{new Date(job.created_at).toLocaleDateString()}</span>
														</div>
														<div className="flex items-center gap-1.5">
															<MapPin size={14} />
															<span className="truncate max-w-[150px]">{job.node_name ?? job.node_code ?? 'Unknown'}</span>
														</div>
														{job.created_by_email && (
															<div className="flex items-center gap-1.5">
																<User size={14} />
																<span className="truncate max-w-[150px]">{job.created_by_email}</span>
															</div>
														)}
													</div>

													{job.result?.run_hash && (
														<div className="mt-2 text-xs text-gray-400 font-mono">
															{job.result.run_hash.substring(0, 16)}...
														</div>
													)}
												</div>

												<button
													type="button"
													onClick={() => handleViewSegmentation(job)}
													disabled={job.status !== 'completed'}
													className="h-9 px-4 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-2 flex-shrink-0"
												>
													<Eye size={14} />
													<span>View</span>
												</button>
											</div>
										</div>
									))}
								</div>

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
										<div className="text-sm text-gray-600">
											{(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, historyQuery.data?.total ?? 0)} of {historyQuery.data?.total ?? 0}
										</div>
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => setPage(p => Math.max(1, p - 1))}
												disabled={page === 1}
												className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
											>
												<ChevronLeft size={16} />
											</button>
											<span className="px-3 text-sm text-gray-700">
												{page} / {totalPages}
											</span>
											<button
												type="button"
												onClick={() => setPage(p => Math.min(totalPages, p + 1))}
												disabled={page === totalPages}
												className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
											>
												<ChevronRight size={16} />
											</button>
										</div>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default SegmentationHistory;
