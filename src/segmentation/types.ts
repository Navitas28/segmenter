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
};

export type SegmentationStrategy = 'geo-hash' | 'grid-based';
