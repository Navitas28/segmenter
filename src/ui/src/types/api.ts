import type * as GeoJSON from 'geojson';
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

export type DebugFeatureProperties = Record<string, unknown>;

export type DebugFeature = GeoJSON.Feature<GeoJSON.Geometry, DebugFeatureProperties>;

export type DebugFeatureCollection = {
	type: 'FeatureCollection';
	features: DebugFeature[];
};

export type BoothGridDebugGrowthStep = {
	step: number;
	action: 'seed' | 'add_neighbor' | 'skip_exceeds_max';
	cell_id: string;
	from_cell_id: string | null;
	cell_voter_count: number;
	running_voter_count: number;
	projected_voter_count: number;
};

export type BoothGridDebugTimelineStep = {
	step: number;
	stage:
		| 'scope'
		| 'atomic_units'
		| 'boundary'
		| 'grid'
		| 'assignments'
		| 'region_growth'
		| 'region_merge'
		| 'region_rebalance'
		| 'region_compression'
		| 'empty_fill'
		| 'segments';
	title: string;
	description: string;
	focus_region_id: string | null;
	focus_segment_code: string | null;
	focus_cell_id: string | null;
	from_cell_id: string | null;
	growth_action: 'seed' | 'add_neighbor' | 'skip_exceeds_max' | null;
	show_booths: boolean;
	show_voters: boolean;
	show_boundary: boolean;
	show_grid: boolean;
	show_family_points: boolean;
	show_regions: boolean;
	show_segments: boolean;
	visible_cell_ids: string[];
	highlighted_cell_ids: string[];
	visible_region_ids: string[];
	highlighted_region_ids: string[];
	visible_segment_codes: string[];
	highlighted_segment_codes: string[];
	highlighted_unit_ids: string[];
};

export type BoothGridDebugRegion = {
	region_id: string;
	segment_code: string | null;
	seed_cell_id: string;
	voter_count: number;
	cell_ids: string[];
	unit_ids: string[];
	growth_steps: BoothGridDebugGrowthStep[];
	merged_from_region_ids: string[];
	rebalanced_transfers: Array<{
		order: number;
		cell_id: string;
		from_cell_id: string | null;
		donor_region_id: string;
		cell_voter_count: number;
		running_voter_count: number;
		donor_voter_count: number;
	}>;
	compression_transfers: Array<{
		order: number;
		cell_id: string;
		from_cell_id: string | null;
		source_region_id: string;
		cell_voter_count: number;
		target_voter_count: number;
		source_voter_count: number;
		source_eliminated: boolean;
	}>;
	empty_fill_assignments: Array<{
		pass: number;
		cell_id: string;
	}>;
};

export type BoothGridDebugSegment = {
	segment_id: string;
	segment_code: string;
	source_region_id: string;
	seed_cell_id: string;
	total_voters: number;
	total_families: number;
	cell_ids: string[];
	unit_ids: string[];
};

export type BoothGridDebugSnapshot = {
	type: 'booth_grid_debug_snapshot';
	election_id: string;
	node_id: string;
	version: number;
	scope: 'BOOTH';
	booth_ids: string[];
	created_for_single_booth: boolean;
	booths: Array<{
		id: string;
		node_id: string;
		booth_number: string | null;
		booth_name: string | null;
		latitude: number | null;
		longitude: number | null;
	}>;
	boundary: GeoJSON.Geometry;
	grid_cells: DebugFeatureCollection;
	family_points: DebugFeatureCollection;
	voter_points: DebugFeatureCollection;
	regions: BoothGridDebugRegion[];
	segments: BoothGridDebugSegment[];
	timeline: BoothGridDebugTimelineStep[];
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
	debug_snapshot?: BoothGridDebugSnapshot | null;
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
		error?: string;
		details?: any;
		debug_snapshot?: BoothGridDebugSnapshot | null;
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
