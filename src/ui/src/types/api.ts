export type Election = {
	id: string;
	name?: string;
	title?: string;
	code?: string;
};

export type HierarchyNode = {
	id: string;
	name?: string;
	code?: string;
	level?: string;
	metadata?: Record<string, unknown>;
};

export type Booth = {
	id: string;
	booth_name?: string | null;
	booth_number?: number | string | null;
	name?: string;
	code?: string;
	node_id?: string;
	latitude?: number | null;
	longitude?: number | null;
	metadata?: Record<string, unknown>;
};

export type SegmentMember = {
	voter_id?: string;
	family_id?: string | null;
	full_name?: string | null;
	relation_type?: string | null;
	relation_name?: string | null;
	age?: number | null;
	epic_number?: string | null;
	is_verified?: boolean;
	serial_number?: string | null;
	gender?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	metadata?: Record<string, unknown>;
};

export type Segment = {
	id: string;
	segment_code?: string | null;
	segment_name?: string | null;
	display_name?: string | null;
	description?: string | null;
	version?: number | null;
	status?: string | null;
	total_voters?: number | null;
	total_families?: number | null;
	segment_hash?: string | null;
	hash?: string | null;
	color?: string | null;
	created_at?: string | null;
	centroid_lat?: number | null;
	centroid_lng?: number | null;
	boundary_geojson?: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null;
	centroid_geojson?: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null;
	geometry?: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null;
	/** Approximate area in square meters (from PostGIS ST_Area on geography). */
	area_sq_m?: number | null;
	/** Bounding box coordinates derived from segment geometry. */
	bbox_min_lat?: number | null;
	bbox_min_lng?: number | null;
	bbox_max_lat?: number | null;
	bbox_max_lng?: number | null;
	metadata?: Record<string, unknown>;
	members?: SegmentMember[];
	voters?: SegmentMember[];
};

export type SegmentStatistics = {
	totalSegments?: number;
	totalVoters?: number;
	totalFamilies?: number;
	minVoters?: number;
	maxVoters?: number;
	avgVoters?: number;
};

export type SegmentsResponse = {
	segments: Segment[];
	version?: number | null;
	job_id?: string | null;
	run_hash?: string | null;
	performance?: Record<string, unknown>;
};

export type JobStatusResponse = {
	job_id: string;
	status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | null;
	version?: number | null;
	segments: Segment[];
	exceptions: ExceptionRecord[];
	statistics: SegmentStatistics;
	result?: {
		run_hash?: string;
		algorithm_ms?: number;
		db_write_ms?: number;
		validation_ms?: number;
		total_ms?: number;
		integrity_checks?: {
			all_families_assigned?: boolean;
			no_overlaps?: boolean;
			geometry_valid?: boolean;
			no_empty_polygons?: boolean;
		};
	};
};

export type ExceptionRecord = {
	id: string;
	exception_type?: string;
	metadata?: Record<string, unknown>;
	created_at?: string | null;
};

export type AuditLogRecord = {
	id: string;
	segment_id?: string | null;
	metadata?: Record<string, unknown>;
	created_at?: string | null;
};

export type DeterminismResult = {
	deterministic: boolean;
	hash_run_1: string;
	hash_run_2: string;
	segments_count: number;
	mismatch?: {
		first_mismatch_index: number | null;
		ordered_segment_hashes_run_1: string[];
		ordered_segment_hashes_run_2: string[];
		segment_counts: {
			run_1: number;
			run_2: number;
		};
	};
};
