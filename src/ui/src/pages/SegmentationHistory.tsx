import {useState} from 'react';
import {useQuery, useMutation} from '@tanstack/react-query';
import {
	ArrowRight,
	Eye,
	Calendar,
	MapPin,
	ChevronLeft,
	ChevronRight,
	Layers,
	Plus,
	X,
	Play,
	Clock,
	CheckCircle2,
	XCircle,
	AlertCircle,
	Loader2,
	History,
} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useElections, useAcNodes, useHierarchyBoothNodes} from '../hooks/useConsoleQueries';
import {getSegmentationHistory, postSegmentationJob} from '../services/api';
import {useCustomerStore} from '../store/useCustomerStore';

const ITEMS_PER_PAGE = 8;

const selectStyle: React.CSSProperties = {
	backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
	backgroundPosition: 'right 0.5rem center',
	backgroundRepeat: 'no-repeat',
	backgroundSize: '1.25em 1.25em',
	paddingRight: '2.5rem',
	appearance: 'none',
	WebkitAppearance: 'none',
	MozAppearance: 'none',
};

type StatusKey = 'completed' | 'running' | 'queued' | 'failed' | string;

const statusConfig: Record<StatusKey, {label: string; icon: React.ReactNode; cls: string}> = {
	completed: {
		label: 'Completed',
		icon: <CheckCircle2 size={12} />,
		cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
	},
	running: {
		label: 'Running',
		icon: <Loader2 size={12} className="animate-spin" />,
		cls: 'bg-blue-50 text-blue-700 border border-blue-200',
	},
	queued: {
		label: 'Queued',
		icon: <Clock size={12} />,
		cls: 'bg-amber-50 text-amber-700 border border-amber-200',
	},
	failed: {
		label: 'Failed',
		icon: <XCircle size={12} />,
		cls: 'bg-red-50 text-red-700 border border-red-200',
	},
};

const getStatusCfg = (status: string) =>
	statusConfig[status] ?? {
		label: status,
		icon: <AlertCircle size={12} />,
		cls: 'bg-gray-100 text-gray-600 border border-gray-200',
	};

const SegmentationHistory = () => {
	const navigate = useNavigate();
	const {setElectionId, setNodeId, setJobId, setSelectedVersion, setScopeType, setAssemblyId, setBoothId} =
		useCustomerStore();

	/* ── filter state ── */
	const [page, setPage] = useState(1);
	const [scopeType, setScopeTypeLocal] = useState<'ac' | 'booth'>('ac');
	const [filterElectionId, setFilterElectionId] = useState('');
	const [filterAssemblyId, setFilterAssemblyId] = useState('');
	const [filterBoothId, setFilterBoothId] = useState('');

	/* ── modal state ── */
	const [showModal, setShowModal] = useState(false);
	const [modalElectionId, setModalElectionId] = useState('');
	const [modalScopeType, setModalScopeType] = useState<'ac' | 'booth'>('ac');
	const [modalAssemblyId, setModalAssemblyId] = useState('');
	const [modalBoothId, setModalBoothId] = useState('');
	const [versionName, setVersionName] = useState('');
	const [versionDescription, setVersionDescription] = useState('');

	/* ── queries ── */
	const electionsQuery = useElections();
	const acNodesQuery = useAcNodes(filterElectionId);
	const boothNodesQuery = useHierarchyBoothNodes(filterElectionId, filterAssemblyId);
	const filterNodeId = filterBoothId || filterAssemblyId;

	const modalAcNodesQuery = useAcNodes(modalElectionId);
	const modalBoothNodesQuery = useHierarchyBoothNodes(modalElectionId, modalAssemblyId);

	const historyQuery = useQuery({
		queryKey: ['segmentationHistory', filterElectionId, filterNodeId, page],
		queryFn: () =>
			getSegmentationHistory({
				election_id: filterElectionId || undefined,
				node_id: filterNodeId || undefined,
				page,
				limit: ITEMS_PER_PAGE,
			}),
		enabled: true,
	});

	/* ── run segmentation ── */
	const runMutation = useMutation({
		mutationFn: postSegmentationJob,
		onSuccess: (data) => {
			const nodeId = modalScopeType === 'ac' ? modalAssemblyId : modalBoothId;
			setElectionId(modalElectionId);
			setScopeType(modalScopeType);
			setAssemblyId(modalScopeType === 'ac' ? modalAssemblyId : modalAssemblyId);
			setBoothId(modalScopeType === 'booth' ? modalBoothId : '');
			setNodeId(nodeId);
			setJobId(data.job_id);
			setSelectedVersion(null);
			closeModal();
			navigate('/customer');
		},
	});

	const openModal = () => {
		runMutation.reset();
		setModalElectionId('');
		setModalScopeType('ac');
		setModalAssemblyId('');
		setModalBoothId('');
		setVersionName('');
		setVersionDescription('');
		setShowModal(true);
	};

	const closeModal = () => setShowModal(false);

	const handleRun = () => {
		const nodeId = modalScopeType === 'ac' ? modalAssemblyId : modalBoothId;
		if (!modalElectionId || !nodeId || !versionName.trim()) return;
		runMutation.reset();
		runMutation.mutate({
			election_id: modalElectionId,
			node_id: nodeId,
			version_name: versionName.trim(),
			version_description: versionDescription.trim() || undefined,
		});
	};

	const handleViewSegmentation = (job: any) => {
		setElectionId(job.election_id);
		setNodeId(job.node_id);
		setJobId(job.id);
		setSelectedVersion(job.version);
		navigate('/customer');
	};

	const handleClearFilters = () => {
		setFilterElectionId('');
		setFilterAssemblyId('');
		setFilterBoothId('');
		setPage(1);
	};

	const jobs = historyQuery.data?.jobs ?? [];
	const total = historyQuery.data?.total ?? 0;
	const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
	const hasFilters = filterElectionId || filterAssemblyId || filterBoothId;

	const modalNodeId = modalScopeType === 'ac' ? modalAssemblyId : modalBoothId;
	const canRunModal = !!modalElectionId && !!modalNodeId && versionName.trim().length > 0;

	return (
		<div className="h-screen w-screen bg-gray-50 flex flex-col">
			{/* ── Header ── */}
			<div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-3">
					<div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
						<Layers size={18} className="text-white" />
					</div>
					<div>
						<h1 className="text-base font-semibold text-gray-900 leading-tight">Segmentation History</h1>
						<p className="text-xs text-gray-500 leading-tight">View and manage all segmentation runs</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => navigate('/customer')}
						className="h-9 px-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
					>
						<History size={15} />
						<span>Map View</span>
						<ArrowRight size={14} />
					</button>

					<button
						type="button"
						onClick={openModal}
						className="h-9 px-4 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-all flex items-center gap-2 shadow-sm"
					>
						<Plus size={16} />
						<span>New Segmentation</span>
					</button>
				</div>
			</div>

			{/* ── Body ── */}
			<div className="flex-1 overflow-auto">
				<div className="max-w-5xl mx-auto p-6 space-y-5">
					{/* ── Filters ── */}
					<div className="bg-white rounded-xl border border-gray-200 shadow-sm">
						<div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
							<span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</span>
							{hasFilters && (
								<button
									type="button"
									onClick={handleClearFilters}
									className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
								>
									Clear all
								</button>
							)}
						</div>
						<div className="p-4 flex flex-wrap items-center gap-3">
							{/* Scope toggle */}
							<div className="flex items-center bg-gray-100 rounded-lg p-0.5">
								{(['ac', 'booth'] as const).map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => {
											setScopeTypeLocal(s);
											setFilterAssemblyId('');
											setFilterBoothId('');
											setPage(1);
										}}
										className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
											scopeType === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
										}`}
									>
										{s === 'ac' ? 'Assembly' : 'Booth'}
									</button>
								))}
							</div>

							{/* Election */}
							<select
								className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer shadow-sm"
								style={selectStyle}
								value={filterElectionId}
								onChange={(e) => {
									setFilterElectionId(e.target.value);
									setFilterAssemblyId('');
									setFilterBoothId('');
									setPage(1);
								}}
							>
								<option value="">All Elections</option>
								{electionsQuery.data?.map((el) => (
									<option key={el.id} value={el.id}>
										{el.name ?? el.code ?? el.id}
									</option>
								))}
							</select>

							{/* Assembly */}
							<select
								className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
								style={selectStyle}
								value={filterAssemblyId}
								disabled={!filterElectionId}
								onChange={(e) => {
									setFilterAssemblyId(e.target.value);
									setFilterBoothId('');
									setPage(1);
								}}
							>
								<option value="">{filterElectionId ? 'All Assemblies' : 'Select Election first'}</option>
								{acNodesQuery.data?.map((node) => (
									<option key={node.id} value={node.id}>
										{node.name ?? node.code ?? node.id}
									</option>
								))}
							</select>

							{/* Booth (only in booth scope) */}
							{scopeType === 'booth' && (
								<select
									className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
									style={selectStyle}
									value={filterBoothId}
									disabled={!filterAssemblyId}
									onChange={(e) => {
										setFilterBoothId(e.target.value);
										setPage(1);
									}}
								>
									<option value="">
										{!filterAssemblyId
											? 'Select Assembly first'
											: boothNodesQuery.isLoading
												? 'Loading booths…'
												: 'All Booths'}
									</option>
									{boothNodesQuery.data?.map((node) => (
										<option key={node.id} value={node.id}>
											{node.name ?? node.code ?? node.id}
										</option>
									))}
								</select>
							)}

							{/* Result count */}
							{!historyQuery.isLoading && (
								<span className="ml-auto text-xs text-gray-400 font-medium">
									{total} {total === 1 ? 'run' : 'runs'}
								</span>
							)}
						</div>
					</div>

					{/* ── Results ── */}
					<div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
						{historyQuery.isLoading ? (
							<div className="py-20 flex flex-col items-center gap-3 text-gray-400">
								<Loader2 size={32} className="animate-spin text-blue-500" />
								<p className="text-sm">Loading history…</p>
							</div>
						) : historyQuery.isError ? (
							<div className="py-20 flex flex-col items-center gap-2 text-gray-400">
								<XCircle size={32} className="text-red-400" />
								<p className="text-sm font-medium text-red-600">Failed to load history</p>
								<p className="text-xs text-gray-400 max-w-sm text-center break-all">
									{historyQuery.error instanceof Error ? historyQuery.error.message : String(historyQuery.error)}
								</p>
							</div>
						) : jobs.length === 0 ? (
							<div className="py-20 flex flex-col items-center gap-4 text-gray-400">
								<div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
									<Layers size={28} className="text-gray-300" />
								</div>
								<div className="text-center">
									<p className="text-sm font-medium text-gray-600">No segmentation runs yet</p>
									<p className="text-xs text-gray-400 mt-1">Click <strong>New Segmentation</strong> to get started</p>
								</div>
								<button
									type="button"
									onClick={openModal}
									className="mt-1 h-9 px-5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-all flex items-center gap-2 shadow-sm"
								>
									<Plus size={15} />
									New Segmentation
								</button>
							</div>
						) : (
							<>
								<div className="divide-y divide-gray-100">
									{jobs.map((job: any) => {
										const cfg = getStatusCfg(job.status);
										const date = new Date(job.created_at);
										const dateFormatted = date.toLocaleDateString(undefined, {
											day: '2-digit',
											month: 'short',
											year: 'numeric',
										});
										const timeFormatted = date.toLocaleTimeString(undefined, {
											hour: '2-digit',
											minute: '2-digit',
										});
										return (
											<div
												key={job.id}
												className="px-5 py-4 hover:bg-blue-50/40 transition-colors group"
											>
												<div className="flex items-center gap-4">
													{/* Status icon circle */}
													<div
														className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
															job.status === 'completed'
																? 'bg-emerald-100 text-emerald-600'
																: job.status === 'running' || job.status === 'queued'
																	? 'bg-blue-100 text-blue-600'
																	: 'bg-red-100 text-red-500'
														}`}
													>
														{job.status === 'completed' ? (
															<CheckCircle2 size={17} />
														) : job.status === 'running' ? (
															<Loader2 size={17} className="animate-spin" />
														) : job.status === 'queued' ? (
															<Clock size={17} />
														) : (
															<XCircle size={17} />
														)}
													</div>

													{/* Main content */}
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2 flex-wrap">
															<h3 className="text-sm font-semibold text-gray-900 truncate">
																{job.version_name ?? `Version ${job.version}`}
															</h3>
															<span
																className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${cfg.cls}`}
															>
																{cfg.icon}
																{cfg.label}
															</span>
															{job.election_name && (
																<span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-violet-50 text-violet-700 border border-violet-200">
																	{job.election_name}
																</span>
															)}
														</div>

														{job.version_description && (
															<p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{job.version_description}</p>
														)}

														<div className="flex items-center gap-4 mt-1.5 text-[11px] text-gray-400">
															<span className="flex items-center gap-1">
																<MapPin size={11} />
																{job.node_name ?? job.node_code ?? 'Unknown node'}
															</span>
															<span className="flex items-center gap-1">
																<Calendar size={11} />
																{dateFormatted} · {timeFormatted}
															</span>
															{job.result?.run_hash && (
																<span className="font-mono text-gray-300">
																	{job.result.run_hash.substring(0, 12)}…
																</span>
															)}
														</div>
													</div>

													{/* View button */}
													<button
														type="button"
														onClick={() => handleViewSegmentation(job)}
														disabled={job.status !== 'completed'}
														className="h-8 px-4 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 rounded-lg transition-all flex items-center gap-1.5 shrink-0"
													>
														<Eye size={13} />
														View
													</button>
												</div>
											</div>
										);
									})}
								</div>

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
										<span className="text-xs text-gray-500">
											{(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, total)} of {total}
										</span>
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => setPage((p) => Math.max(1, p - 1))}
												disabled={page === 1}
												className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
											>
												<ChevronLeft size={16} />
											</button>
											<span className="px-2 text-xs text-gray-600 font-medium">
												{page} / {totalPages}
											</span>
											<button
												type="button"
												onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
												disabled={page === totalPages}
												className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
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

			{/* ── New Segmentation Modal ── */}
			{showModal && (
				<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
						{/* Modal header */}
						<div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
									<Play size={14} className="text-white ml-0.5" />
								</div>
								<h2 className="text-base font-semibold text-gray-900">New Segmentation</h2>
							</div>
							<button
								type="button"
								onClick={closeModal}
								className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
							>
								<X size={18} />
							</button>
						</div>

						<div className="px-6 py-5 space-y-4">
							{/* Step 1: Election */}
							<div>
								<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
									Election
								</label>
								<select
									className="w-full h-10 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer shadow-sm disabled:opacity-50"
									style={selectStyle}
									value={modalElectionId}
									onChange={(e) => {
										setModalElectionId(e.target.value);
										setModalAssemblyId('');
										setModalBoothId('');
									}}
								>
									<option value="">Select election…</option>
									{electionsQuery.data?.map((el) => (
										<option key={el.id} value={el.id}>
											{el.name ?? el.code ?? el.id}
										</option>
									))}
								</select>
							</div>

							{/* Step 2: Scope */}
							<div>
								<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
									Scope
								</label>
								<div className="flex items-center bg-gray-100 rounded-lg p-0.5 w-fit">
									{(['ac', 'booth'] as const).map((s) => (
										<button
											key={s}
											type="button"
											onClick={() => {
												setModalScopeType(s);
												setModalBoothId('');
											}}
											className={`h-8 px-5 text-xs font-medium rounded-md transition-all ${
												modalScopeType === s
													? 'bg-white text-gray-900 shadow-sm'
													: 'text-gray-500 hover:text-gray-800'
											}`}
										>
											{s === 'ac' ? 'Assembly' : 'Booth'}
										</button>
									))}
								</div>
							</div>

							{/* Step 3: Assembly */}
							<div>
								<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
									Assembly (AC)
								</label>
								<select
									className="w-full h-10 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
									style={selectStyle}
									value={modalAssemblyId}
									disabled={!modalElectionId}
									onChange={(e) => {
										setModalAssemblyId(e.target.value);
										setModalBoothId('');
									}}
								>
									<option value="">{!modalElectionId ? 'Select election first' : 'Select assembly…'}</option>
									{modalAcNodesQuery.data?.map((node) => (
										<option key={node.id} value={node.id}>
											{node.name ?? node.code ?? node.id}
										</option>
									))}
								</select>
							</div>

							{/* Step 4: Booth (only if scope = booth) */}
							{modalScopeType === 'booth' && (
								<div>
									<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
										Booth
									</label>
									<select
										className="w-full h-10 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
										style={selectStyle}
										value={modalBoothId}
										disabled={!modalAssemblyId}
										onChange={(e) => setModalBoothId(e.target.value)}
									>
										<option value="">
											{!modalAssemblyId
												? 'Select assembly first'
												: modalBoothNodesQuery.isLoading
													? 'Loading booths…'
													: 'Select booth…'}
										</option>
										{modalBoothNodesQuery.data?.map((node) => (
											<option key={node.id} value={node.id}>
												{node.name ?? node.code ?? node.id}
											</option>
										))}
									</select>
								</div>
							)}

							{/* Divider */}
							<div className="border-t border-dashed border-gray-200 pt-1" />

							{/* Version name */}
							<div>
								<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
									Version Name <span className="text-red-500 normal-case font-medium">*</span>
								</label>
								<input
									type="text"
									value={versionName}
									onChange={(e) => setVersionName(e.target.value)}
									placeholder="e.g., Final Review v2"
									className="w-full h-10 px-3 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all"
								/>
							</div>

							{/* Description */}
							<div>
								<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
									Description <span className="text-gray-300 normal-case font-normal">(optional)</span>
								</label>
								<textarea
									value={versionDescription}
									onChange={(e) => setVersionDescription(e.target.value)}
									placeholder="Optional notes about this run…"
									rows={2}
									className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white transition-all"
								/>
							</div>

							{/* Error */}
							{runMutation.isError && (
								<div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
									<XCircle size={16} className="mt-0.5 shrink-0" />
									<span>
										{runMutation.error instanceof Error
											? runMutation.error.message
											: 'Failed to start segmentation'}
									</span>
								</div>
							)}
						</div>

						{/* Modal footer */}
						<div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100">
							<button
								type="button"
								onClick={closeModal}
								className="h-9 px-4 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-all"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleRun}
								disabled={!canRunModal || runMutation.isPending}
								className="h-9 px-5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-2 shadow-sm"
							>
								{runMutation.isPending ? (
									<>
										<Loader2 size={14} className="animate-spin" />
										Starting…
									</>
								) : (
									<>
										<Play size={14} />
										Start Segmentation
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default SegmentationHistory;
