import {useEffect, useRef, useState} from 'react';
import {ChevronDown, ChevronUp} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import TopBar from '../components/customer/TopBar';
import LeftSidebar from '../components/customer/LeftSidebar';
import CustomerMapView from '../components/customer/CustomerMapView';
import RightPanel from '../components/customer/RightPanel';
import BottomAuditPanel from '../components/customer/BottomAuditPanel';
import {useCustomerStore} from '../store/useCustomerStore';
import {useSegments, useJobStatus, useVersions} from '../hooks/useConsoleQueries';

const CustomerConsole = () => {
	const queryClient = useQueryClient();
	const {electionId, scopeType, assemblyId, boothId, selectedVersion, selectedSegmentId, jobId, setSelectedVersion, setPdfJobId, filters} = useCustomerStore();
	const [auditPanelOpen, setAuditPanelOpen] = useState(false);
	const lastCompletedJobRef = useRef<string | null>(null);

	const nodeId = scopeType === 'ac' ? assemblyId : boothId;
	const segmentsQuery = useSegments(nodeId, selectedVersion);
	const versionsQuery = useVersions(nodeId ?? '');
	const jobStatusQuery = useJobStatus(jobId ?? '');

	const jobStatus = jobStatusQuery.data?.status;
	const jobVersion = jobStatusQuery.data?.version;
	const versions = versionsQuery.data?.versions ?? [];
	const isJobRunning = jobId && (jobStatus === 'queued' || jobStatus === 'running');

	// When job completes: refetch versions/segments and select the new version so results show
	useEffect(() => {
		if (jobId && jobStatus === 'completed' && jobVersion != null && lastCompletedJobRef.current !== jobId) {
			lastCompletedJobRef.current = jobId;
			queryClient.invalidateQueries({ queryKey: ['versions', nodeId] });
			queryClient.invalidateQueries({ queryKey: ['segments', nodeId] });
			setSelectedVersion(jobVersion);
		}
		if (jobStatus !== 'completed') lastCompletedJobRef.current = null;
	}, [jobId, jobStatus, jobVersion, nodeId, queryClient, setSelectedVersion]);

	const segmentsData = segmentsQuery.data;
	const rawSegments = Array.isArray(segmentsData) ? segmentsData : segmentsData?.segments ?? [];
	useEffect(() => {
		const id = segmentsData && typeof segmentsData === 'object' && 'job_id' in segmentsData
			? (segmentsData as { job_id?: string | null }).job_id ?? null
			: null;
		setPdfJobId(id);
	}, [segmentsData, setPdfJobId]);

	// Apply filters: Oversized (>165), Undersized (<90), >150, <100, and search
	const segments = rawSegments.filter((s) => {
		const v = s.total_voters ?? 0;
		const anyFilter = filters.oversized || filters.undersized || filters.over150 || filters.under100;
		if (anyFilter) {
			if (filters.oversized && v > 165) return true;
			if (filters.undersized && v < 90) return true;
			if (filters.over150 && v > 150) return true;
			if (filters.under100 && v < 100) return true;
			return false;
		}
		const term = (filters.searchTerm ?? '').trim().toLowerCase();
		if (term) {
			const name = (s.display_name ?? s.segment_name ?? '').toString().toLowerCase();
			return name.includes(term);
		}
		return true;
	});

	const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null;

	return (
		<div className="h-screen w-screen bg-gray-50 flex flex-col">
			<TopBar />
			{isJobRunning && (
				<div className="flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium shrink-0">
					<div className="h-2 flex-1 max-w-md bg-blue-500 rounded-full overflow-hidden">
						<div className="h-full w-1/3 bg-white/40 rounded-full animate-pulse" />
					</div>
					<span>Segmentation running…</span>
				</div>
			)}
			<div className="flex flex-1 overflow-hidden">
				<LeftSidebar />
				<div className="flex-1 relative bg-gray-100">
					<CustomerMapView segments={segments} selectedSegment={selectedSegment} />
				</div>
				<RightPanel segments={segments} selectedSegment={selectedSegment} nodeId={nodeId ?? null} />
			</div>
			<div className={`border-t border-gray-200 bg-white transition-all duration-300 ease-out ${auditPanelOpen ? 'h-52' : 'h-0'}`}>
				<button
					type="button"
					onClick={() => setAuditPanelOpen(!auditPanelOpen)}
					className="w-full h-10 flex items-center justify-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors border-b border-gray-100"
				>
					<span>Audit & Integrity</span>
					{auditPanelOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
				</button>
				{auditPanelOpen && <BottomAuditPanel jobResult={jobStatusQuery.data?.result} />}
			</div>
		</div>
	);
};

export default CustomerConsole;
