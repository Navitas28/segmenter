import {DbClient} from '../db/transaction.js';
import {logger} from '../config/logger.js';
import {CellAssignment} from './cellAssigner.js';

/**
 * Represents a grown region (future segment).
 */
export type Region = {
	/** Unique region identifier */
	id: string;
	/** Cell IDs that belong to this region */
	cell_ids: string[];
	/** Total voter count in this region */
	voter_count: number;
	/** Seed cell from which this region started */
	seed_cell_id: string;
};

// Segmentation constraints
const TARGET_MIN = 100;
const TARGET_MAX = 150;
const ABSOLUTE_MIN = 90;
const ABSOLUTE_MAX = 165;

/**
 * STEP 5 & 6: Deterministic region growing via BFS flood-fill.
 *
 * Algorithm:
 * 1. Process cells in deterministic order (north to south, west to east)
 * 2. For each unassigned cell, start a new region
 * 3. Use BFS to grow region by adding adjacent cells
 * 4. Stop when voter_count >= TARGET_MIN (100)
 * 5. Never exceed ABSOLUTE_MAX (165)
 * 6. Mark undersized regions (< ABSOLUTE_MIN) for merging
 * 7. Merge tail regions into adjacent segment with minimal overflow
 *
 * Adjacency rules:
 * - Cells must share an edge (ST_Touches)
 * - No diagonal-only adjacency
 *
 * Determinism guarantees:
 * - Cells are always processed in same order
 * - BFS queue is sorted to ensure consistent neighbor selection
 * - Same input always produces same output
 *
 * @param client - Database client for neighbor queries
 * @param assignments - Map of cell assignments
 * @returns Array of grown regions
 */
export async function growRegions(client: DbClient, assignments: Map<string, CellAssignment>): Promise<Region[]> {
	if (assignments.size === 0) {
		return [];
	}

	logger.info({cellCount: assignments.size}, 'Starting region growing');

	// Build neighbor map using spatial query
	const neighborMap = await buildNeighborMap(client);

	// Sort cells deterministically (already sorted in assignments)
	const sortedCells = Array.from(assignments.values()).sort((a, b) => {
		// North to south (descending lat)
		if (a.centroid.lat !== b.centroid.lat) {
			return b.centroid.lat - a.centroid.lat;
		}
		// West to east (ascending lng)
		return a.centroid.lng - b.centroid.lng;
	});

	const assignedCells = new Set<string>();
	const regions: Region[] = [];
	let regionCounter = 1;

	// Separate oversized cells (>ABSOLUTE_MAX) from normal cells
	// Oversized cells will be handled specially after normal region growing
	const oversizedCells: CellAssignment[] = [];
	const normalCells: CellAssignment[] = [];

	for (const cell of sortedCells) {
		if (cell.voter_count > ABSOLUTE_MAX) {
			oversizedCells.push(cell);
		} else {
			normalCells.push(cell);
		}
	}


	// Grow regions from normal cells only
	for (const seedCell of normalCells) {
		if (assignedCells.has(seedCell.cell_id)) {
			continue;
		}

		const region = growRegionFromSeed(seedCell, assignments, neighborMap, assignedCells);

		region.id = `region_${String(regionCounter).padStart(4, '0')}`;
		regions.push(region);
		regionCounter++;
	}

	// Handle oversized cells: create single-cell regions for now
	// These will be flagged for manual intervention or special handling
	for (const oversizedCell of oversizedCells) {
		if (assignedCells.has(oversizedCell.cell_id)) {
			continue;
		}

		const region: Region = {
			id: `region_${String(regionCounter).padStart(4, '0')}`,
			cell_ids: [oversizedCell.cell_id],
			voter_count: oversizedCell.voter_count,
			seed_cell_id: oversizedCell.cell_id,
		};

		assignedCells.add(oversizedCell.cell_id);
		regions.push(region);
		regionCounter++;

		logger.warn(
			{
				region_id: region.id,
				voter_count: region.voter_count,
				cell_id: oversizedCell.cell_id,
				unit_count: oversizedCell.unit_ids.length,
			},
			'Created oversized region from dense cell - requires manual review',
		);
	}

	// Identify undersized regions that need merging
	const undersizedRegions = regions.filter((r) => r.voter_count < ABSOLUTE_MIN);

	if (undersizedRegions.length > 0) {
		logger.info({count: undersizedRegions.length}, 'Merging undersized regions');
		mergeUndersizedRegions(regions, neighborMap, assignments);
	}

	logger.info(
		{
			regionCount: regions.length,
			avgSize: Math.round(regions.reduce((sum, r) => sum + r.voter_count, 0) / regions.length),
		},
		'Region growing completed',
	);

	return regions;
}

/**
 * Build adjacency map of cells using ST_Touches.
 */
async function buildNeighborMap(client: DbClient): Promise<Map<string, string[]>> {
	const result = await client.query<{
		cell_id: string;
		neighbor_id: string;
	}>(
		`
		SELECT DISTINCT
			a.cell_id,
			b.cell_id as neighbor_id
		FROM temp_grid_cells a
		JOIN temp_grid_cells b ON ST_Touches(a.geom, b.geom)
		WHERE a.cell_id != b.cell_id
		ORDER BY a.cell_id, b.cell_id
		`,
	);

	const neighborMap = new Map<string, string[]>();

	for (const row of result.rows) {
		const neighbors = neighborMap.get(row.cell_id) || [];
		neighbors.push(row.neighbor_id);
		neighborMap.set(row.cell_id, neighbors);
	}

	return neighborMap;
}

/**
 * Grow a single region from a seed cell using BFS.
 */
function growRegionFromSeed(seedCell: CellAssignment, assignments: Map<string, CellAssignment>, neighborMap: Map<string, string[]>, assignedCells: Set<string>): Region {
	const region: Region = {
		id: '',
		cell_ids: [seedCell.cell_id],
		voter_count: seedCell.voter_count,
		seed_cell_id: seedCell.cell_id,
	};

	assignedCells.add(seedCell.cell_id);

	// BFS queue - maintain deterministic order
	const queue: string[] = [seedCell.cell_id];

	while (queue.length > 0) {
		// Stop growing if we've reached target minimum
		if (region.voter_count >= TARGET_MIN) {
			break;
		}

		const currentCellId = queue.shift()!;
		const neighbors = neighborMap.get(currentCellId) || [];

		// Sort neighbors deterministically by their cell assignments
		const sortedNeighbors = neighbors
			.filter((nId) => !assignedCells.has(nId))
			.map((nId) => ({id: nId, assignment: assignments.get(nId)!}))
			.filter((n) => n.assignment !== undefined)
			.sort((a, b) => {
				// North to south, west to east
				if (a.assignment.centroid.lat !== b.assignment.centroid.lat) {
					return b.assignment.centroid.lat - a.assignment.centroid.lat;
				}
				return a.assignment.centroid.lng - b.assignment.centroid.lng;
			});

		for (const neighbor of sortedNeighbors) {
			const assignment = neighbor.assignment;

			// Check if adding this cell would exceed absolute maximum
			if (region.voter_count + assignment.voter_count > ABSOLUTE_MAX) {
				continue;
			}

			// Add cell to region
			region.cell_ids.push(assignment.cell_id);
			region.voter_count += assignment.voter_count;
			assignedCells.add(assignment.cell_id);
			queue.push(assignment.cell_id);

			// Stop if we've reached target range
			if (region.voter_count >= TARGET_MIN) {
				break;
			}
		}
	}

	return region;
}

/**
 * Merge undersized regions into adjacent regions.
 *
 * Strategy:
 * - Find adjacent region with minimal overflow
 * - Prefer merging into regions below TARGET_MAX
 * - Update neighbor region's cells and voter count
 */
function mergeUndersizedRegions(regions: Region[], neighborMap: Map<string, string[]>, assignments: Map<string, CellAssignment>): void {
	// Build region lookup by cell
	const cellToRegion = new Map<string, Region>();
	for (const region of regions) {
		for (const cellId of region.cell_ids) {
			cellToRegion.set(cellId, region);
		}
	}

	// Sort undersized regions by voter count (smallest first)
	const undersized = regions.filter((r) => r.voter_count < ABSOLUTE_MIN).sort((a, b) => a.voter_count - b.voter_count);

	for (const smallRegion of undersized) {
		// Find all adjacent regions
		const adjacentRegions = new Set<Region>();

		for (const cellId of smallRegion.cell_ids) {
			const neighbors = neighborMap.get(cellId) || [];
			for (const neighborId of neighbors) {
				const neighborRegion = cellToRegion.get(neighborId);
				if (neighborRegion && neighborRegion.id !== smallRegion.id) {
					adjacentRegions.add(neighborRegion);
				}
			}
		}

		if (adjacentRegions.size === 0) {
			// Isolated region - keep as is
			continue;
		}

		// Find best merge target (minimal overflow)
		let bestTarget: Region | null = null;
		let bestOverflow = Infinity;

		for (const candidate of adjacentRegions) {
			const newCount = candidate.voter_count + smallRegion.voter_count;
			const overflow = Math.max(0, newCount - TARGET_MAX);

			if (overflow < bestOverflow) {
				bestOverflow = overflow;
				bestTarget = candidate;
			}
		}

		if (bestTarget) {
			// Merge small region into target
			bestTarget.cell_ids.push(...smallRegion.cell_ids);
			bestTarget.voter_count += smallRegion.voter_count;

			// Update cell-to-region mapping
			for (const cellId of smallRegion.cell_ids) {
				cellToRegion.set(cellId, bestTarget);
			}

			// Mark small region as merged (will be filtered out later)
			smallRegion.voter_count = 0;
			smallRegion.cell_ids = [];
		}
	}

	// Remove merged regions
	const mergedCount = regions.filter((r) => r.voter_count === 0).length;
	regions.splice(0, regions.length, ...regions.filter((r) => r.voter_count > 0));

	if (mergedCount > 0) {
		logger.info({mergedCount}, 'Undersized regions merged');
	}
}
