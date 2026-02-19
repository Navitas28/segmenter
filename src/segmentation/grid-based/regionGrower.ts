import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {CellAssignment} from './cellAssigner.js';

/**
 * Represents a grown region (future segment).
 */
export type Region = {
	/** Unique region identifier */
	id: string;
	/** Cell IDs that belong to this region (includes empty fill cells) */
	cell_ids: string[];
	/** Total voter count in this region */
	voter_count: number;
	/** Seed cell from which this region started */
	seed_cell_id: string;
};

const TARGET_MIN = 100;
const TARGET_IDEAL = 115;
const TARGET_MAX = 130;
const ABSOLUTE_MIN = 90;
const ABSOLUTE_MAX = 135;

/**
 * STEP 5 & 6: Deterministic region growing via BFS flood-fill.
 *
 * Algorithm:
 * 1. Build adjacency graph using ST_DWithin (includes diagonal neighbors)
 * 2. Process populated cells in deterministic order (north→south, west→east)
 * 3. BFS flood-fill: grow region until voter_count >= TARGET_IDEAL (115)
 * 4. Never exceed ABSOLUTE_MAX (135)
 * 5. Merge undersized tail regions into adjacent segments
 * 6. Fill ALL empty grid cells into nearest region for wall-to-wall coverage
 *
 * @param client - Database client for neighbor queries
 * @param assignments - Map of cell assignments (only populated cells)
 * @returns Array of grown regions with complete spatial coverage
 */
export async function growRegions(client: DbClient, assignments: Map<string, CellAssignment>): Promise<Region[]> {
	if (assignments.size === 0) {
		return [];
	}

	logger.info({cellCount: assignments.size}, 'Starting region growing');

	const neighborMap = await buildNeighborMap(client);

	const sortedCells = Array.from(assignments.values()).sort((a, b) => {
		const latDiff = b.centroid.lat - a.centroid.lat;
		if (Math.abs(latDiff) > 1e-10) return latDiff;
		return a.centroid.lng - b.centroid.lng;
	});

	const assignedCells = new Set<string>();
	const regions: Region[] = [];
	let regionCounter = 1;

	const oversizedCells: CellAssignment[] = [];
	const normalCells: CellAssignment[] = [];

	for (const cell of sortedCells) {
		if (cell.voter_count > ABSOLUTE_MAX) {
			oversizedCells.push(cell);
		} else {
			normalCells.push(cell);
		}
	}

	for (const seedCell of normalCells) {
		if (assignedCells.has(seedCell.cell_id)) continue;

		const region = growRegionFromSeed(seedCell, assignments, neighborMap, assignedCells);
		region.id = `region_${String(regionCounter).padStart(4, '0')}`;
		regions.push(region);
		regionCounter++;
	}

	for (const oversizedCell of oversizedCells) {
		if (assignedCells.has(oversizedCell.cell_id)) continue;

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
			'Created oversized region from dense cell — requires manual review',
		);
	}

	const undersizedCount = regions.filter((r) => r.voter_count < ABSOLUTE_MIN).length;
	if (undersizedCount > 0) {
		logger.info({count: undersizedCount}, 'Merging undersized regions');
		mergeUndersizedRegions(regions, neighborMap, assignments);
	}

	await fillEmptyCells(client, regions, assignments, neighborMap);

	logger.info(
		{
			regionCount: regions.length,
			avgVoters: Math.round(regions.reduce((sum, r) => sum + r.voter_count, 0) / regions.length),
			totalCells: regions.reduce((sum, r) => sum + r.cell_ids.length, 0),
		},
		'Region growing completed with full spatial coverage',
	);

	return regions;
}

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
		JOIN temp_grid_cells b ON ST_DWithin(a.geom, b.geom, 0.00001)
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

	logger.info(
		{
			totalCells: neighborMap.size,
			avgNeighbors:
				neighborMap.size > 0
					? Math.round(
							Array.from(neighborMap.values()).reduce((s, n) => s + n.length, 0) / neighborMap.size,
						)
					: 0,
		},
		'Neighbor map built with diagonal adjacency',
	);

	return neighborMap;
}

function growRegionFromSeed(
	seedCell: CellAssignment,
	assignments: Map<string, CellAssignment>,
	neighborMap: Map<string, string[]>,
	assignedCells: Set<string>,
): Region {
	const region: Region = {
		id: '',
		cell_ids: [seedCell.cell_id],
		voter_count: seedCell.voter_count,
		seed_cell_id: seedCell.cell_id,
	};

	assignedCells.add(seedCell.cell_id);

	const queue: string[] = [seedCell.cell_id];

	while (queue.length > 0) {
		if (region.voter_count >= TARGET_IDEAL) {
			break;
		}

		const currentCellId = queue.shift()!;
		const neighbors = neighborMap.get(currentCellId) || [];

		const candidates = neighbors
			.filter((nId) => !assignedCells.has(nId) && assignments.has(nId))
			.map((nId) => ({id: nId, assignment: assignments.get(nId)!}))
			.sort((a, b) => {
				const latDiff = b.assignment.centroid.lat - a.assignment.centroid.lat;
				if (Math.abs(latDiff) > 1e-10) return latDiff;
				const lngDiff = a.assignment.centroid.lng - b.assignment.centroid.lng;
				if (Math.abs(lngDiff) > 1e-10) return lngDiff;
				return a.id.localeCompare(b.id);
			});

		for (const candidate of candidates) {
			const {assignment} = candidate;

			if (region.voter_count + assignment.voter_count > ABSOLUTE_MAX) {
				continue;
			}

			region.cell_ids.push(assignment.cell_id);
			region.voter_count += assignment.voter_count;
			assignedCells.add(assignment.cell_id);
			queue.push(assignment.cell_id);

			if (region.voter_count >= TARGET_IDEAL) {
				break;
			}
		}
	}

	return region;
}

function mergeUndersizedRegions(
	regions: Region[],
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
): void {
	const cellToRegion = new Map<string, Region>();
	for (const region of regions) {
		for (const cellId of region.cell_ids) {
			cellToRegion.set(cellId, region);
		}
	}

	const undersized = regions
		.filter((r) => r.voter_count < ABSOLUTE_MIN && r.voter_count > 0)
		.sort((a, b) => a.voter_count - b.voter_count);

	for (const smallRegion of undersized) {
		if (smallRegion.voter_count === 0) continue;

		const adjacentRegions = new Map<string, Region>();
		for (const cellId of smallRegion.cell_ids) {
			const neighbors = neighborMap.get(cellId) || [];
			for (const neighborId of neighbors) {
				const neighborRegion = cellToRegion.get(neighborId);
				if (neighborRegion && neighborRegion.id !== smallRegion.id && neighborRegion.voter_count > 0) {
					adjacentRegions.set(neighborRegion.id, neighborRegion);
				}
			}
		}

		if (adjacentRegions.size === 0) continue;

		let bestTarget: Region | null = null;
		let bestScore = Infinity;

		for (const candidate of adjacentRegions.values()) {
			const newCount = candidate.voter_count + smallRegion.voter_count;
			const overflow = Math.max(0, newCount - TARGET_MAX);
			if (overflow < bestScore || (overflow === bestScore && bestTarget && candidate.id < bestTarget.id)) {
				bestScore = overflow;
				bestTarget = candidate;
			}
		}

		if (bestTarget) {
			bestTarget.cell_ids.push(...smallRegion.cell_ids);
			bestTarget.voter_count += smallRegion.voter_count;

			for (const cellId of smallRegion.cell_ids) {
				cellToRegion.set(cellId, bestTarget);
			}

			smallRegion.voter_count = 0;
			smallRegion.cell_ids = [];
		}
	}

	const mergedCount = regions.filter((r) => r.voter_count === 0).length;
	regions.splice(0, regions.length, ...regions.filter((r) => r.voter_count > 0));

	if (mergedCount > 0) {
		logger.info({mergedCount}, 'Undersized regions merged');
	}
}

async function fillEmptyCells(
	client: DbClient,
	regions: Region[],
	assignments: Map<string, CellAssignment>,
	neighborMap: Map<string, string[]>,
): Promise<void> {
	const allCellsResult = await client.query<{
		cell_id: string;
		centroid_lat: number;
		centroid_lng: number;
	}>(`SELECT cell_id, centroid_lat, centroid_lng FROM temp_grid_cells`);

	const cellToRegion = new Map<string, Region>();
	for (const region of regions) {
		for (const cellId of region.cell_ids) {
			cellToRegion.set(cellId, region);
		}
	}

	const emptyCellData = new Map<string, {lat: number; lng: number}>();
	for (const row of allCellsResult.rows) {
		if (!cellToRegion.has(row.cell_id)) {
			emptyCellData.set(row.cell_id, {
				lat: Number(row.centroid_lat),
				lng: Number(row.centroid_lng),
			});
		}
	}

	if (emptyCellData.size === 0) {
		logger.info('No empty cells to fill — full coverage already');
		return;
	}

	logger.info({emptyCells: emptyCellData.size}, 'Filling empty cells for wall-to-wall coverage');

	let totalFilled = 0;
	let passNumber = 0;

	while (true) {
		passNumber++;
		let filledThisPass = 0;

		const fillCandidates: Array<{
			cellId: string;
			targetRegion: Region;
			distance: number;
		}> = [];

		for (const [cellId, cellData] of emptyCellData) {
			const neighbors = neighborMap.get(cellId) || [];

			const adjacentRegions = new Map<string, {region: Region; dist: number}>();

			for (const nId of neighbors) {
				const region = cellToRegion.get(nId);
				if (region) {
					if (!adjacentRegions.has(region.id)) {
						const seedAssignment = assignments.get(region.seed_cell_id);
						const dist = seedAssignment
							? Math.hypot(
									cellData.lat - seedAssignment.centroid.lat,
									cellData.lng - seedAssignment.centroid.lng,
								)
							: Infinity;
						adjacentRegions.set(region.id, {region, dist});
					}
				}
			}

			if (adjacentRegions.size > 0) {
				const sorted = Array.from(adjacentRegions.values()).sort(
					(a, b) => a.dist - b.dist || a.region.id.localeCompare(b.region.id),
				);

				fillCandidates.push({
					cellId,
					targetRegion: sorted[0].region,
					distance: sorted[0].dist,
				});
			}
		}

		if (fillCandidates.length === 0) break;

		fillCandidates.sort((a, b) => a.distance - b.distance || a.cellId.localeCompare(b.cellId));

		for (const {cellId, targetRegion} of fillCandidates) {
			targetRegion.cell_ids.push(cellId);
			cellToRegion.set(cellId, targetRegion);
			emptyCellData.delete(cellId);
			filledThisPass++;
		}

		totalFilled += filledThisPass;

		if (filledThisPass === 0) break;
	}

	logger.info(
		{
			totalFilled,
			passes: passNumber,
			remainingEmpty: emptyCellData.size,
		},
		'Empty cell fill completed',
	);

	if (emptyCellData.size > 0) {
		logger.warn(
			{count: emptyCellData.size},
			'Some cells could not be filled (isolated from all regions)',
		);
	}
}
