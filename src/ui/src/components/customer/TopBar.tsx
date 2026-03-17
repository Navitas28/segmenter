import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {Play, Download, X, History, Layers} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useCustomerStore} from '../../store/useCustomerStore';
import {useElections, useAcNodes, useHierarchyBoothNodes, useVersions} from '../../hooks/useConsoleQueries';
import {postSegmentationJob, exportSegmentsPdf} from '../../services/api';

const TopBar = () => {
	const navigate = useNavigate();
	const {electionId, assemblyId, boothId, scopeType, selectedVersion, jobId, pdfJobId, setElectionId, setAssemblyId, setBoothId, setScopeType, setNodeId, setSelectedVersion, setJobId} = useCustomerStore();
	const [showRunModal, setShowRunModal] = useState(false);
	const [versionName, setVersionName] = useState('');
	const [versionDescription, setVersionDescription] = useState('');
	const [createdOnDisplay, setCreatedOnDisplay] = useState('');
	const [showBoothMarker, setShowBoothMarker] = useState(true);
	const [showExportMenu, setShowExportMenu] = useState(false);

	const electionsQuery = useElections();
	const acNodesQuery = useAcNodes(electionId);
	// Booths from hierarchy_nodes (children of assembly), not booths table
	const boothNodesQuery = useHierarchyBoothNodes(electionId, assemblyId);
	const versionsQuery = useVersions(scopeType === 'ac' ? assemblyId : boothId);

	const runSegmentationMutation = useMutation({
		mutationFn: postSegmentationJob,
		onSuccess: (data) => {
			setJobId(data.job_id);
			setShowRunModal(false);
			setVersionName('');
			setVersionDescription('');
		},
	});

	const handleRunSegmentation = () => {
		const nodeId = scopeType === 'ac' ? assemblyId : boothId;
		if (!electionId || !nodeId || !versionName.trim()) return;
		runSegmentationMutation.reset();
		runSegmentationMutation.mutate({
			election_id: electionId,
			node_id: nodeId,
			version_name: versionName.trim(),
			version_description: versionDescription?.trim() || undefined,
		});
	};


	const handleScopeChange = (newScope: 'ac' | 'booth') => {
		setScopeType(newScope);
		setAssemblyId('');
		setBoothId('');
		setNodeId('');
		setSelectedVersion(null);
	};

	const handleAssemblyChange = (acId: string) => {
		setAssemblyId(acId);
		setSelectedVersion(null);
		if (scopeType === 'ac') {
			setNodeId(acId);
		} else {
			setBoothId('');
		}
	};

	const handleBoothChange = (nodeIdVal: string) => {
		setBoothId(nodeIdVal);
		setNodeId(nodeIdVal);
		setSelectedVersion(null);
	};

	const versions = versionsQuery.data?.versions ?? [];
	const nodeId = scopeType === 'ac' ? assemblyId : boothId;

	return (
		<>
			<div className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-6">
				{/* Logo/Title */}
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
						<Layers size={18} className="text-white" />
					</div>
					<span className="text-base font-semibold text-gray-900">Segmentation</span>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-gray-200" />

				{/* Selectors */}
				<div className="flex items-center gap-3 flex-1">
					<select 
						className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer shadow-sm"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
							backgroundPosition: 'right 0.5rem center',
							backgroundRepeat: 'no-repeat',
							backgroundSize: '1.25em 1.25em',
							paddingRight: '2.5rem',
							appearance: 'none',
							WebkitAppearance: 'none',
							MozAppearance: 'none',
						}}
						value={electionId}
						onChange={(e) => {
							setElectionId(e.target.value);
							setSelectedVersion(null);
						}}
					>
						<option value="">Election</option>
						{electionsQuery.data?.map((election) => (
							<option key={election.id} value={election.id}>
								{election.name ?? election.code ?? election.id}
							</option>
						))}
					</select>

					<div className="flex items-center bg-gray-100 rounded-lg p-0.5">
						<button
							type="button"
							onClick={() => handleScopeChange('ac')}
							className={`h-8 px-4 text-xs font-medium rounded-md transition-all ${
								scopeType === 'ac'
									? 'bg-white text-gray-900 shadow-sm'
									: 'text-gray-600 hover:text-gray-900'
							}`}
						>
							Assembly
						</button>
						<button
							type="button"
							onClick={() => handleScopeChange('booth')}
							className={`h-8 px-4 text-xs font-medium rounded-md transition-all ${
								scopeType === 'booth'
									? 'bg-white text-gray-900 shadow-sm'
									: 'text-gray-600 hover:text-gray-900'
							}`}
							disabled={!electionId}
						>
							Booth
						</button>
					</div>

					<select
						className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
							backgroundPosition: 'right 0.5rem center',
							backgroundRepeat: 'no-repeat',
							backgroundSize: '1.25em 1.25em',
							paddingRight: '2.5rem',
							appearance: 'none',
							WebkitAppearance: 'none',
							MozAppearance: 'none',
						}}
						value={assemblyId}
						onChange={(e) => handleAssemblyChange(e.target.value)}
						disabled={!electionId}
					>
						<option value="">
							{!electionId ? 'Select Election first' : 'Assembly'}
						</option>
						{acNodesQuery.data?.map((node) => (
							<option key={node.id} value={node.id}>
								{node.name ?? node.code ?? node.id}
							</option>
						))}
					</select>

					{scopeType === 'booth' && (
						<select
							className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
							style={{
								backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
								backgroundPosition: 'right 0.5rem center',
								backgroundRepeat: 'no-repeat',
								backgroundSize: '1.25em 1.25em',
								paddingRight: '2.5rem',
								appearance: 'none',
								WebkitAppearance: 'none',
								MozAppearance: 'none',
							}}
							value={boothId}
							onChange={(e) => handleBoothChange(e.target.value)}
							disabled={!assemblyId}
						>
							<option value="">
								{!assemblyId ? 'Select Assembly first' : 'Booth'}
							</option>
							{(boothNodesQuery.data ?? []).map((node) => (
								<option key={node.id} value={node.id}>
									{node.name ?? node.code ?? node.id}
								</option>
							))}
						</select>
					)}

					<select
						className="h-9 px-3 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
							backgroundPosition: 'right 0.5rem center',
							backgroundRepeat: 'no-repeat',
							backgroundSize: '1.25em 1.25em',
							paddingRight: '2.5rem',
							appearance: 'none',
							WebkitAppearance: 'none',
							MozAppearance: 'none',
						}}
						value={selectedVersion ?? ''}
						onChange={(e) => setSelectedVersion(e.target.value === '' ? null : Number(e.target.value))}
						disabled={!nodeId}
					>
						<option value="">Run new</option>
						{versions.map((version) => (
							<option key={version} value={version}>
								v{version}
							</option>
						))}
					</select>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-gray-200" />

				{/* Actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => navigate('/customer/history')}
						className="h-9 px-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-2"
					>
						<History size={16} />
						<span>History</span>
					</button>

					<button
						type="button"
						onClick={() => {
								runSegmentationMutation.reset();
								setCreatedOnDisplay(new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
								setShowRunModal(true);
							}}
						disabled={!electionId || !nodeId || selectedVersion != null}
						className="h-9 px-4 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-2"
					>
						<Play size={14} />
						<span>Run</span>
					</button>

					{/* Export button with booth marker toggle */}
					<div className="relative flex items-center">
						<button
							type="button"
							id="export-pdf-btn"
							onClick={() => {
								const id = jobId ?? pdfJobId;
								if (id) exportSegmentsPdf(id, showBoothMarker);
							}}
							disabled={!(jobId ?? pdfJobId)}
							title="Export PDF"
							className="h-9 px-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed rounded-l-lg transition-all flex items-center gap-2 border-r border-gray-200"
						>
							<Download size={16} />
						</button>
						<button
							type="button"
							id="export-options-btn"
							onClick={() => setShowExportMenu((v) => !v)}
							disabled={!(jobId ?? pdfJobId)}
							title="Export options"
							className="h-9 px-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed rounded-r-lg transition-all"
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
							</svg>
						</button>
						{showExportMenu && (
							<div className="absolute right-0 top-10 z-50 w-52 bg-white border border-gray-200 rounded-xl shadow-xl p-3">
								<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Export Options</p>
								<label className="flex items-center gap-2.5 cursor-pointer group">
									<div
										className={`relative w-9 h-5 rounded-full transition-colors ${showBoothMarker ? 'bg-blue-500' : 'bg-gray-300'}`}
										onClick={() => setShowBoothMarker((v) => !v)}
									>
										<span
											className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showBoothMarker ? 'translate-x-4' : 'translate-x-0'}`}
										/>
									</div>
									<span className="text-xs text-gray-700 group-hover:text-gray-900 select-none">
										Mark Booth Location
									</span>
								</label>
								<p className="text-[10px] text-gray-400 mt-1.5 ml-11 leading-tight">
									Show booth pin on the map in PDF
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Run Modal */}
			{showRunModal && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
						<div className="flex items-center justify-between p-6 border-b border-gray-100">
							<h3 className="text-lg font-semibold text-gray-900">New Segmentation</h3>
							<button 
								type="button" 
								onClick={() => setShowRunModal(false)} 
								className="text-gray-400 hover:text-gray-600 transition-colors"
							>
								<X size={20} />
							</button>
						</div>
						<div className="p-6 space-y-5">
							<div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
								<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Running segmentation for</p>
								<p className="text-sm text-gray-900">
									<span className="font-medium">Election:</span>{' '}
									{electionsQuery.data?.find((e) => e.id === electionId)?.name ?? electionsQuery.data?.find((e) => e.id === electionId)?.code ?? electionId ?? '—'}
								</p>
								<p className="text-sm text-gray-900">
									<span className="font-medium">Assembly (AC):</span>{' '}
									{acNodesQuery.data?.find((n) => n.id === assemblyId)?.name ?? acNodesQuery.data?.find((n) => n.id === assemblyId)?.code ?? assemblyId ?? '—'}
								</p>
								{scopeType === 'booth' && (
									<p className="text-sm text-gray-900">
										<span className="font-medium">Booth:</span>{' '}
										{boothNodesQuery.data?.find((n) => n.id === boothId)?.name ?? boothNodesQuery.data?.find((n) => n.id === boothId)?.code ?? boothId ?? '—'}
									</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Created On
								</label>
								<div className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 flex items-center text-gray-700">
									{createdOnDisplay || new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Version Name <span className="text-red-500">*</span>
								</label>
								<input
									type="text"
									value={versionName}
									onChange={(e) => setVersionName(e.target.value)}
									placeholder="e.g., Final Review v2"
									className="w-full h-10 px-3 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
								<textarea
									value={versionDescription}
									onChange={(e) => setVersionDescription(e.target.value)}
									placeholder="Optional description..."
									rows={3}
									className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
								/>
							</div>
						</div>
						{runSegmentationMutation.isError && (
							<div className="mx-6 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
								{runSegmentationMutation.error instanceof Error ? runSegmentationMutation.error.message : 'Failed to start segmentation'}
							</div>
						)}
						<div className="flex items-center justify-end gap-3 p-6 bg-gray-50 rounded-b-2xl">
							<button 
								type="button" 
								onClick={() => setShowRunModal(false)} 
								className="h-10 px-4 text-sm font-medium text-gray-700 hover:bg-white rounded-lg transition-all"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => handleRunSegmentation()}
								disabled={!versionName.trim() || runSegmentationMutation.isPending}
								className="h-10 px-6 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 rounded-lg transition-all"
							>
								{runSegmentationMutation.isPending ? 'Starting...' : 'Start'}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default TopBar;
