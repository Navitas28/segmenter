export type DebugGeoJsonGeometry = {
	type: string;
	coordinates?: unknown;
	geometries?: unknown[];
};

export type DebugGeoJsonFeature = {
	type: 'Feature';
	geometry: DebugGeoJsonGeometry;
	properties: Record<string, unknown>;
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
	boundary: DebugGeoJsonGeometry;
	grid_cells: {
		type: 'FeatureCollection';
		features: DebugGeoJsonFeature[];
	};
	family_points: {
		type: 'FeatureCollection';
		features: DebugGeoJsonFeature[];
	};
	voter_points: {
		type: 'FeatureCollection';
		features: DebugGeoJsonFeature[];
	};
	regions: Array<{
		region_id: string;
		segment_code: string | null;
		seed_cell_id: string;
		voter_count: number;
		cell_ids: string[];
		unit_ids: string[];
		growth_steps: Array<Record<string, unknown>>;
		merged_from_region_ids: string[];
		rebalanced_transfers: Array<Record<string, unknown>>;
		compression_transfers: Array<Record<string, unknown>>;
		empty_fill_assignments: Array<Record<string, unknown>>;
	}>;
	segments: Array<{
		segment_id: string;
		segment_code: string;
		source_region_id: string;
		seed_cell_id: string;
		total_voters: number;
		total_families: number;
		cell_ids: string[];
		unit_ids: string[];
	}>;
	timeline: BoothGridDebugTimelineStep[];
};

/**
 * Result of a segmentation run — returned by both geo-hash and grid-based strategies.
 */
export type SegmentationResult = {
	/** Number of segments created */
	segment_count: number;
	/** Total voters segmented */
	voter_count: number;
	/** Total atomic units (families) */
	family_count: number;
	/** Algorithm execution time in milliseconds */
	algorithm_ms: number;
	/** Database write time in milliseconds */
	db_write_ms: number;
	/** Total execution time in milliseconds */
	total_ms: number;
	/** Deterministic hash of the run */
	run_hash: string;
	/** Optional booth-level grid debug artifact, emitted only when explicitly enabled. */
	debug_snapshot?: BoothGridDebugSnapshot;
};

export type SegmentationStrategy = 'geo-hash' | 'grid-based';
