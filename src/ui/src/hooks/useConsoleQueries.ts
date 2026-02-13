import {useQuery} from '@tanstack/react-query';
import {getAcNodes, getAuditLogs, getBooths, getDeterminismCheck, getElections, getExceptions, getHierarchyBoothNodes, getJobStatus, getSegments, getSegmentVersions} from '../services/api';

export const useElections = () =>
	useQuery({
		queryKey: ['elections'],
		queryFn: getElections,
	});

export const useAcNodes = (electionId: string) =>
	useQuery({
		queryKey: ['acNodes', electionId],
		queryFn: () => getAcNodes(electionId),
		enabled: Boolean(electionId),
	});

export const useBooths = (electionId: string, nodeId?: string) =>
	useQuery({
		queryKey: ['booths', electionId, nodeId],
		queryFn: () => getBooths(electionId, nodeId),
		enabled: Boolean(electionId),
	});

/** Booth-level hierarchy nodes under an assembly (from hierarchy_nodes). */
export const useHierarchyBoothNodes = (electionId: string, parentId: string) =>
	useQuery({
		queryKey: ['hierarchyBoothNodes', electionId, parentId],
		queryFn: () => getHierarchyBoothNodes(electionId, parentId),
		enabled: Boolean(electionId) && Boolean(parentId),
	});

export const useSegments = (nodeId: string, version?: number | null) =>
	useQuery({
		queryKey: ['segments', nodeId, version ?? 'latest'],
		queryFn: () => getSegments(nodeId, version),
		enabled: Boolean(nodeId),
	});

/** Fetches available segment versions for a node from completed jobs (for version dropdown). */
export const useVersions = (nodeId: string) =>
	useQuery({
		queryKey: ['versions', nodeId],
		queryFn: () => getSegmentVersions(nodeId),
		enabled: Boolean(nodeId),
	});

export const useAuditLogs = (nodeId: string) =>
	useQuery({
		queryKey: ['audit', nodeId],
		queryFn: () => getAuditLogs(nodeId),
		enabled: Boolean(nodeId),
	});

export const useExceptions = (nodeId: string) =>
	useQuery({
		queryKey: ['exceptions', nodeId],
		queryFn: () => getExceptions(nodeId),
		enabled: Boolean(nodeId),
	});

export const useJobStatus = (jobId: string) =>
	useQuery({
		queryKey: ['jobStatus', jobId],
		queryFn: () => getJobStatus(jobId),
		enabled: Boolean(jobId),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			if (status === 'completed' || status === 'failed' || status === 'cancelled') return false;
			return 2000;
		},
	});

export const useDeterminismCheck = (electionId: string, nodeId: string) =>
	useQuery({
		queryKey: ['determinism', electionId, nodeId],
		queryFn: () => getDeterminismCheck(electionId, nodeId),
		enabled: false,
	});

export const normalizeSegments = (response: SegmentsResponse | Segment[] | undefined) => {
	if (!response) return [];
	if (Array.isArray(response)) return response;
	return response.segments ?? [];
};
