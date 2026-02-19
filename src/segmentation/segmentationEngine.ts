import {logger} from '../config/logger.js';
import {env} from '../config/env.js';
import {SegmentationResult} from './types.js';
import {runGeoHashSegmentation} from './geo-hash/geoHashEngine.js';
import {runGridSegmentation} from './grid-based/gridEngine.js';

export type {SegmentationResult} from './types.js';

/**
 * Main segmentation engine entrypoint — strategy dispatcher.
 *
 * Reads SEGMENTATION_STRATEGY from env and delegates to the appropriate engine:
 *   - "geo-hash"    → GeoHash fixed-precision segmentation (precision 7)
 *   - "grid-based"  → Adaptive grid with BFS region growing
 *
 * Both strategies write to the same tables (segments, segment_members) and
 * return the same SegmentationResult shape, so downstream consumers
 * (API routes, job processor, UI) are unaffected by the choice of strategy.
 */
export async function runSegmentation(electionId: string, nodeId: string, version: number): Promise<SegmentationResult> {
	const strategy = env.segmentationStrategy;

	logger.info({strategy, electionId, nodeId, version}, 'Segmentation dispatching to strategy');

	switch (strategy) {
		case 'geo-hash':
			return runGeoHashSegmentation(electionId, nodeId, version);

		case 'grid-based':
			return runGridSegmentation(electionId, nodeId, version);

		default: {
			const exhaustive: never = strategy;
			throw new Error(`Unknown segmentation strategy: ${exhaustive}`);
		}
	}
}
