import {useEffect, useMemo, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {Play, RefreshCcw, ShieldCheck, Download, AlertTriangle} from 'lucide-react';
import Panel from '../components/Panel';
import Toggle from '../components/Toggle';
import Tabs from '../components/Tabs';
import StateBlock from '../components/StateBlock';
import JsonViewer from '../components/JsonViewer';
import SegmentsTable from '../components/SegmentsTable';
import SegmentDetail from '../components/SegmentDetail';
import OverviewPanel from '../components/OverviewPanel';
import ExceptionsTable from '../components/ExceptionsTable';
import AuditLogTable from '../components/AuditLogTable';
import DeterminismPanel from '../components/DeterminismPanel';
import GraphsPanel from '../components/GraphsPanel';
import MapContainer from '../components/map/MapContainer';
import VersionComparisonPanel from '../components/VersionComparisonPanel';
import {normalizeSegments, useAcNodes, useAuditLogs, useBooths, useDeterminismCheck, useElections, useExceptions, useJobStatus, useSegments, useVersions} from '../hooks/useConsoleQueries';
import {postSegmentationJob} from '../services/api';
import {downloadJson} from '../services/exporter';
import {getSegmentMembers} from '../services/segmentUtils';
import {useConsoleStore} from '../store/useConsoleStore';
import type {SegmentsResponse} from '../types/api';

const tabs = ['Overview', 'Segments Table', 'Segment Detail', 'Exceptions', 'Audit Log', 'Determinism', 'Graphs'];

const SegmentationConsole = () => {
	const {
		electionId,
		scopeType,
		nodeId,
		boothId,
		selectedVersion,
		compareVersionA,
		compareVersionB,
		lastJobId,
		selectedSegmentId,
		showRawJson,
		showHashes,
		showAuditLogs,
		showExceptions,
		visualizationMode,
		setElectionId,
		setScopeType,
		setNodeId,
		setBoothId,
		setSelectedVersion,
		setCompareVersionA,
		setCompareVersionB,
		setLastJobId,
		setSelectedSegmentId,
		setVisualizationMode,
		toggle,
	} = useConsoleStore();

	const [activeTab, setActiveTab] = useState('Overview');

	const electionsQuery = useElections();
	const acNodesQuery = useAcNodes(electionId);
	const boothsQuery = useBooths(scopeType === 'BOOTH' ? electionId : '', undefined);
	const segmentsQuery = useSegments(nodeId, selectedVersion);
	const versionsQuery = useVersions(nodeId);
	const auditQuery = useAuditLogs(nodeId);
	const exceptionsQuery = useExceptions(nodeId);
	const jobStatusQuery = useJobStatus(lastJobId);
	const determinismQuery = useDeterminismCheck(electionId, nodeId);

	const compareSegmentsQueryA = useSegments(compareVersionA ? nodeId : '', compareVersionA);
	const compareSegmentsQueryB = useSegments(compareVersionB ? nodeId : '', compareVersionB);

	const runSegmentationMutation = useMutation({
		mutationFn: postSegmentationJob,
		onSuccess: (data) => {
			setLastJobId(data.job_id);
		},
	});

	const segmentsResponse = segmentsQuery.data;
	const segments = normalizeSegments(segmentsResponse);
	const compareSegmentsA = normalizeSegments(compareSegmentsQueryA.data);
	const compareSegmentsB = normalizeSegments(compareSegmentsQueryB.data);
	const versionData = versionsQuery.data?.versions ?? [];
	const hasVersions = versionData.length > 0;

	useEffect(() => {
		if (!selectedVersion && versionData.length > 0) {
			setSelectedVersion(versionData[0]);
		}
	}, [selectedVersion, versionData, setSelectedVersion]);

	const runHash = segmentsResponse && !Array.isArray(segmentsResponse) ? (segmentsResponse as SegmentsResponse).run_hash ?? null : null;
	const performanceMetrics = segmentsResponse && !Array.isArray(segmentsResponse) ? (segmentsResponse as SegmentsResponse).performance ?? null : null;

	const versionSeries = useMemo(() => {
		if (!versionsQuery.data) return [];
		return versionsQuery.data.versions.map((version) => ({
			version,
			segments: versionsQuery.data?.versionCounts.get(version) ?? 0,
		}));
	}, [versionsQuery.data]);

	const compareEnabled = visualizationMode === 'comparison' && compareVersionA && compareVersionB;
	const selectedSegment = (compareEnabled ? compareSegmentsA : segments).find((segment) => segment.id === selectedSegmentId) ?? null;

	const handleRunSegmentation = () => {
		if (!electionId || !nodeId) return;
		runSegmentationMutation.mutate({election_id: electionId, node_id: nodeId});
	};

	const handleDeterminism = async () => {
		if (!electionId || !nodeId) return;
		await determinismQuery.refetch();
		setActiveTab('Determinism');
	};

	const handleRefresh = async () => {
		await Promise.all([segmentsQuery.refetch(), versionsQuery.refetch(), auditQuery.refetch(), exceptionsQuery.refetch()]);
	};

	const handleExport = () => {
		const payload = {
			segmentation_job: jobStatusQuery.data ?? null,
			segments,
			segment_members: segments.flatMap((segment) => getSegmentMembers(segment).map((member) => ({segment_id: segment.id, ...member}))),
			exceptions: exceptionsQuery.data ?? [],
			audit_logs: auditQuery.data ?? [],
			run_hash: runHash,
			performance_metrics: performanceMetrics,
			determinism: determinismQuery.data ?? null,
		};
		downloadJson(`segmentation-debug-${nodeId || 'node'}.json`, payload);
	};

	return (
		<div className='h-screen w-screen bg-slate-950 p-4 text-slate-100'>
			<div className='mb-4 text-lg font-semibold'>Segmentation Testing Console</div>
			<div className='grid h-[calc(100%-3rem)] grid-cols-[320px,1fr,420px] gap-4'>
				<div className='flex flex-col gap-4 overflow-auto pr-2'>
					<Panel title='Election Selector'>
						{electionsQuery.isLoading ? (
							<StateBlock title='Loading' message='Fetching elections...' />
						) : electionsQuery.error ? (
							<StateBlock title='Error' message='Failed to load elections.' actionLabel='Retry' onAction={() => electionsQuery.refetch()} />
						) : (
							<select className='select' value={electionId} onChange={(event) => setElectionId(event.target.value)}>
								<option value=''>Select election</option>
								{electionsQuery.data?.map((election) => (
									<option key={election.id} value={election.id}>
										{election.name ?? election.title ?? election.code ?? election.id}
									</option>
								))}
							</select>
						)}
					</Panel>

					<Panel title='Scope Selector'>
						<div className='flex items-center gap-3 text-sm'>
							<label className='flex items-center gap-2'>
								<input type='radio' checked={scopeType === 'AC'} onChange={() => setScopeType('AC')} />
								AC
							</label>
							<label className='flex items-center gap-2'>
								<input type='radio' checked={scopeType === 'BOOTH'} onChange={() => setScopeType('BOOTH')} />
								Booth
							</label>
						</div>
						{scopeType === 'AC' ? (
							<div className='space-y-2'>
								<div className='text-xs text-slate-400'>AC node</div>
								<select className='select' value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
									<option value=''>Select AC node</option>
									{acNodesQuery.data?.map((node) => (
										<option key={node.id} value={node.id}>
											{node.name ?? node.code ?? node.id}
										</option>
									))}
								</select>
							</div>
						) : (
							<div className='space-y-2'>
								<div className='text-xs text-slate-400'>Booth</div>
								<select
									className='select'
									value={boothId}
									onChange={(event) => {
										const nextBoothId = event.target.value;
										setBoothId(nextBoothId);
										const boothNodeId = boothsQuery.data?.find((booth) => booth.id === nextBoothId)?.node_id ?? '';
										setNodeId(boothNodeId);
									}}
								>
									<option value=''>Select booth</option>
									{boothsQuery.data?.map((booth) => (
										<option key={booth.id} value={booth.id}>
											{booth.booth_name ?? booth.name ?? booth.code ?? (booth.booth_number ? `Booth ${booth.booth_number}` : booth.id)}
										</option>
									))}
								</select>
							</div>
						)}
					</Panel>

					<Panel title='Version Section'>
						<div className='text-xs text-slate-400'>
							Latest version: {versionData[0] ?? 'n/a'}
							{!hasVersions ? ' (run segmentation to create v1)' : ''}
						</div>
						<select className='select' value={selectedVersion ?? ''} onChange={(event) => setSelectedVersion(event.target.value ? Number(event.target.value) : null)}>
							<option value=''>Latest (auto)</option>
							{versionData.map((version) => (
								<option key={version} value={version}>
									Version {version}
								</option>
							))}
						</select>
						<div className='grid grid-cols-2 gap-2'>
							<select className='select' value={compareVersionA ?? ''} onChange={(event) => setCompareVersionA(event.target.value ? Number(event.target.value) : null)}>
								<option value=''>Base version</option>
								{versionData.map((version) => (
									<option key={version} value={version}>
										Version {version}
									</option>
								))}
							</select>
							<select className='select' value={compareVersionB ?? ''} onChange={(event) => setCompareVersionB(event.target.value ? Number(event.target.value) : null)}>
								<option value=''>Compare version</option>
								{versionData.map((version) => (
									<option key={version} value={version}>
										Version {version}
									</option>
								))}
							</select>
						</div>
						<button
							type='button'
							className='button button-secondary'
							onClick={() => {
								if (compareVersionA) {
									setSelectedVersion(compareVersionA);
								}
								setVisualizationMode('comparison');
							}}
						>
							Compare version
						</button>
					</Panel>

					<Panel title='Run Controls'>
						<button type='button' className='button button-primary' onClick={handleRunSegmentation} disabled={!electionId || !nodeId || runSegmentationMutation.isLoading}>
							<Play size={16} /> Run Segmentation
						</button>
						<button type='button' className='button' onClick={handleDeterminism} disabled={!electionId || !nodeId}>
							<ShieldCheck size={16} /> Run Determinism Check
						</button>
						<button type='button' className='button' onClick={handleRefresh}>
							<RefreshCcw size={16} /> Refresh Results
						</button>
						<button type='button' className='button' onClick={handleExport}>
							<Download size={16} /> Export Full Debug Report
						</button>
						{runSegmentationMutation.isError ? (
							<div className='flex items-center gap-2 text-xs text-rose-300'>
								<AlertTriangle size={14} />
								Failed to start segmentation job.
							</div>
						) : null}
						<div className='text-xs text-slate-400'>Last job: {lastJobId || 'n/a'}</div>
						{jobStatusQuery.data ? <div className='text-xs text-slate-400'>Segments loaded: {jobStatusQuery.data.segments?.length ?? 0}</div> : null}
					</Panel>

					<Panel title='Debug Controls'>
						<Toggle label='Show Raw JSON' checked={showRawJson} onChange={() => toggle('showRawJson')} />
						<Toggle label='Show Hashes' checked={showHashes} onChange={() => toggle('showHashes')} />
						<Toggle label='Show Audit Logs' checked={showAuditLogs} onChange={() => toggle('showAuditLogs')} />
						<Toggle label='Show Exceptions' checked={showExceptions} onChange={() => toggle('showExceptions')} />
					</Panel>
				</div>

				<div className='flex flex-col gap-4 overflow-hidden'>
					<MapContainer
						segments={segments}
						baseSegments={compareEnabled ? compareSegmentsA : segments}
						compareSegments={compareEnabled ? compareSegmentsB : []}
						booths={boothsQuery.data ?? []}
						scopeType={scopeType}
						selectedVersion={selectedVersion}
						baseVersion={compareEnabled ? compareVersionA : null}
						compareVersion={compareEnabled ? compareVersionB : null}
						versionOptions={versionData}
						performanceMetrics={performanceMetrics}
					/>
				</div>

				<div className='flex flex-col gap-4 overflow-auto'>
					<Panel title='Segment Analytics'>
						<Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
					</Panel>

					{activeTab === 'Overview' ? (
						<Panel title='Overview'>
							<OverviewPanel segments={segments} stats={jobStatusQuery.data?.statistics ?? null} version={selectedVersion} runHash={runHash} performance={performanceMetrics} />
							<VersionComparisonPanel baseVersion={compareEnabled ? compareVersionA : null} compareVersion={compareEnabled ? compareVersionB : null} baseSegments={compareSegmentsA} compareSegments={compareSegmentsB} />
						</Panel>
					) : null}

					{activeTab === 'Segments Table' ? (
						<Panel title='Segments Table'>
							{segmentsQuery.isLoading ? (
								<StateBlock title='Loading' message='Fetching segments...' />
							) : segmentsQuery.error ? (
								<StateBlock title='Error' message='Failed to load segments.' actionLabel='Retry' onAction={() => segmentsQuery.refetch()} />
							) : segments.length === 0 ? (
								<StateBlock title='Empty' message='No segments available.' />
							) : (
								<SegmentsTable segments={segments} selectedId={selectedSegmentId} showHashes={showHashes} onSelect={setSelectedSegmentId} />
							)}
						</Panel>
					) : null}

					{activeTab === 'Segment Detail' ? (
						<Panel title='Segment Detail'>
							<SegmentDetail segment={selectedSegment} />
						</Panel>
					) : null}

					{activeTab === 'Exceptions' ? (
						<Panel title='Exceptions'>
							{!showExceptions ? (
								<StateBlock title='Disabled' message='Enable Show Exceptions to view data.' />
							) : exceptionsQuery.isLoading ? (
								<StateBlock title='Loading' message='Fetching exceptions...' />
							) : exceptionsQuery.error ? (
								<StateBlock title='Error' message='Failed to load exceptions.' actionLabel='Retry' onAction={() => exceptionsQuery.refetch()} />
							) : (
								<ExceptionsTable exceptions={exceptionsQuery.data ?? []} />
							)}
						</Panel>
					) : null}

					{activeTab === 'Audit Log' ? (
						<Panel title='Audit Log'>
							{!showAuditLogs ? (
								<StateBlock title='Disabled' message='Enable Show Audit Logs to view data.' />
							) : auditQuery.isLoading ? (
								<StateBlock title='Loading' message='Fetching audit logs...' />
							) : auditQuery.error ? (
								<StateBlock title='Error' message='Failed to load audit logs.' actionLabel='Retry' onAction={() => auditQuery.refetch()} />
							) : (
								<AuditLogTable logs={auditQuery.data ?? []} />
							)}
						</Panel>
					) : null}

					{activeTab === 'Determinism' ? (
						<Panel title='Determinism'>
							<DeterminismPanel result={determinismQuery.data ?? null} />
						</Panel>
					) : null}

					{activeTab === 'Graphs' ? (
						<Panel title='Graphs'>
							<GraphsPanel segments={segments} versionSeries={versionSeries} compareSegmentsA={compareSegmentsA} compareSegmentsB={compareSegmentsB} compareEnabled={compareEnabled} />
						</Panel>
					) : null}

					{showRawJson ? (
						<Panel title='Raw Payloads'>
							<JsonViewer title='Segments Raw' data={segmentsResponse ?? {}} />
							<JsonViewer title='Job Status Raw' data={jobStatusQuery.data ?? {}} />
							<JsonViewer title='Audit Logs Raw' data={auditQuery.data ?? {}} />
							<JsonViewer title='Exceptions Raw' data={exceptionsQuery.data ?? {}} />
							<JsonViewer title='Determinism Raw' data={determinismQuery.data ?? {}} />
						</Panel>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default SegmentationConsole;
