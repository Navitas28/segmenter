import type {AuditLogRecord, ExceptionRecord, Segment} from '../types/api';

export type DebugReportPayload = {
	segmentation_job: Record<string, unknown> | null;
	segments: Segment[];
	segment_members: unknown[];
	exceptions: ExceptionRecord[];
	audit_logs: AuditLogRecord[];
	run_hash: string | null;
	performance_metrics: Record<string, unknown> | null;
	determinism?: Record<string, unknown> | null;
};

export const downloadJson = (filename: string, payload: unknown) => {
	const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
};
