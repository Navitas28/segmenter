import {useQuery} from '@tanstack/react-query';
import {getAcNodes, getAuditLogs, getBooths, getDeterminismCheck, getElections, getExceptions, getJobStatus, getSegments} from '../services/api';
import type {SegmentsResponse, Segment} from '../types/api';

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

export const useSegments = (nodeId: string, version?: number | null) =>
	useQuery({
		queryKey: ['segments', nodeId, version ?? 'latest'],
		queryFn: () => getSegments(nodeId, version),
		enabled: Boolean(nodeId),
	});

export const useVersions = (nodeId: string) =>
	useQuery({
		queryKey: ['versions', nodeId],
		queryFn: async () => {
			const response = await getSegments(nodeId);
			const segments = Array.isArray(response) ? response : (response as SegmentsResponse).segments ?? [];
			const versionCounts = new Map<number, number>();
			segments.forEach((segment) => {
				const version = Number(segment.version ?? segment.metadata?.version ?? segment.metadata?.version_number);
				if (!Number.isNaN(version)) {
					versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
				}
			});
			const versions = Array.from(versionCounts.keys()).sort((a, b) => b - a);
			return {versions, versionCounts};
		},
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
		refetchInterval: 3000,
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
