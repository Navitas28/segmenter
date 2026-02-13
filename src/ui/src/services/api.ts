import type {AuditLogRecord, Booth, DeterminismResult, Election, ExceptionRecord, HierarchyNode, JobStatusResponse, Segment, SegmentsResponse} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const apiUrl = (path: string) => {
	if (!API_BASE_URL) {
		return path;
	}
	return `${API_BASE_URL}${path}`;
};

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(apiUrl(path), init);
	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Request failed: ${response.status}`);
	}
	return response.json() as Promise<T>;
};

export const getElections = () => fetchJson<Election[]>('/elections');

export const getAcNodes = (electionId: string) => fetchJson<HierarchyNode[]>(`/hierarchy/ac?election_id=${encodeURIComponent(electionId)}`);

/** Booth-level hierarchy nodes under an assembly (from hierarchy_nodes, not booths table). */
export const getHierarchyBoothNodes = (electionId: string, parentId: string) =>
	fetchJson<HierarchyNode[]>(`/hierarchy/booth-nodes?election_id=${encodeURIComponent(electionId)}&parent_id=${encodeURIComponent(parentId)}`);

export const getBooths = (electionId: string, nodeId?: string) => {
	const params = new URLSearchParams({election_id: electionId});
	if (nodeId) params.set('node_id', nodeId);
	return fetchJson<Booth[]>(`/booths?${params.toString()}`);
};

export const postSegmentationJob = (payload: {
	election_id: string;
	node_id: string;
	version_name?: string;
	version_description?: string;
}) =>
	fetchJson<{job_id: string}>('/jobs/segment', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(payload),
	});

export const getJobStatus = (jobId: string) => fetchJson<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}`);

export const getDeterminismCheck = (electionId: string, nodeId: string) => fetchJson<DeterminismResult>(`/debug/determinism-check?election_id=${encodeURIComponent(electionId)}&node_id=${encodeURIComponent(nodeId)}`);

export const getSegments = (nodeId: string, version?: number | null) => {
	const params = new URLSearchParams({node_id: nodeId});
	if (version !== null && version !== undefined) {
		params.set('version', String(version));
	}
	return fetchJson<SegmentsResponse | Segment[]>(`/segments?${params.toString()}`);
};

/** Available segment versions for a node (from completed jobs). */
export const getSegmentVersions = (nodeId: string) =>
	fetchJson<{versions: number[]}>(`/segments/versions?node_id=${encodeURIComponent(nodeId)}`);

export const getAuditLogs = (nodeId: string) => fetchJson<AuditLogRecord[]>(`/audit?node_id=${encodeURIComponent(nodeId)}`);

export const getExceptions = (nodeId: string) => fetchJson<ExceptionRecord[]>(`/exceptions?node_id=${encodeURIComponent(nodeId)}`);

export const updateJob = (jobId: string, payload: {version_name?: string; version_description?: string}) =>
	fetchJson<unknown>(`/jobs/${encodeURIComponent(jobId)}`, {
		method: 'PATCH',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(payload),
	});

export const updateSegment = (segmentId: string, payload: {display_name?: string; description?: string}) =>
	fetchJson<unknown>(`/segments/${encodeURIComponent(segmentId)}`, {
		method: 'PATCH',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(payload),
	});

export const exportSegmentsPdf = (versionId: string) => {
	const url = apiUrl(`/segments/export/pdf?versionId=${encodeURIComponent(versionId)}`);
	window.open(url, '_blank');
};

export const getSegmentationHistory = (params: {election_id?: string; node_id?: string; page?: number; limit?: number}) => {
	const query = new URLSearchParams();
	if (params.election_id) query.set('election_id', params.election_id);
	if (params.node_id) query.set('node_id', params.node_id);
	if (params.page) query.set('page', String(params.page));
	if (params.limit) query.set('limit', String(params.limit));
	return fetchJson<{jobs: any[]; total: number}>(`/jobs/history?${query.toString()}`);
};
