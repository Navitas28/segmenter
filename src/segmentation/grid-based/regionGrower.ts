import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {CellAssignment} from './cellAssigner.js';

export type RegionGrowthStep = {
	step: number;
	action: 'seed' | 'add_neighbor' | 'skip_exceeds_max';
	cell_id: string;
	from_cell_id: string | null;
	cell_voter_count: number;
	running_voter_count: number;
	projected_voter_count: number;
};

export type RegionEmptyFillAssignment = {
	pass: number;
	cell_id: string;
};

export type RegionRebalanceTransfer = {
	order: number;
	cell_id: string;
	from_cell_id: string | null;
	donor_region_id: string;
	cell_voter_count: number;
	running_voter_count: number;
	donor_voter_count: number;
};

export type RegionCompressionTransfer = {
	order: number;
	cell_id: string;
	from_cell_id: string | null;
	source_region_id: string;
	cell_voter_count: number;
	target_voter_count: number;
	source_voter_count: number;
	source_eliminated: boolean;
};

export type RegionDebugInfo = {
	growth_steps: RegionGrowthStep[];
	merged_from_region_ids: string[];
	rebalanced_transfers: RegionRebalanceTransfer[];
	compression_transfers: RegionCompressionTransfer[];
	empty_fill_assignments: RegionEmptyFillAssignment[];
};

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
	/** Optional trace that explains how the region took shape. */
	debug?: RegionDebugInfo;
};

type GeoPoint = {
	lat: number;
	lng: number;
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
 * 5. Rebalance and compress neighboring regions to reduce undersized tails and total segment count
 * 6. Fill ALL empty grid cells into nearest region for wall-to-wall coverage
 *
 * @param client - Database client for neighbor queries
 * @param assignments - Map of cell assignments (only populated cells)
 * @returns Array of grown regions with complete spatial coverage
 */
export async function growRegions(client: DbClient, assignments: Map<string, CellAssignment>): Promise<Region[]> {
	return growRegionsWithOptions(client, assignments, {captureDebug: false});
}

export async function growRegionsWithOptions(
	client: DbClient,
	assignments: Map<string, CellAssignment>,
	options: {captureDebug?: boolean} = {},
): Promise<Region[]> {
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

		const region = growRegionFromSeed(seedCell, assignments, neighborMap, assignedCells, options.captureDebug === true);
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
			debug: options.captureDebug
				? {
						growth_steps: [
							{
								step: 1,
								action: 'seed',
								cell_id: oversizedCell.cell_id,
								from_cell_id: null,
								cell_voter_count: oversizedCell.voter_count,
								running_voter_count: oversizedCell.voter_count,
								projected_voter_count: oversizedCell.voter_count,
							},
						],
						merged_from_region_ids: [],
						rebalanced_transfers: [],
						compression_transfers: [],
						empty_fill_assignments: [],
				  }
				: undefined,
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

	const remainingUndersizedBeforeFill = regions.filter((r) => r.voter_count > 0 && r.voter_count < ABSOLUTE_MIN).length;
	if (remainingUndersizedBeforeFill > 0) {
		logger.info({count: remainingUndersizedBeforeFill}, 'Rebalancing undersized regions by transferring boundary cells');
		rebalanceUndersizedRegions(regions, neighborMap, assignments);
		mergeUndersizedRegions(regions, neighborMap, assignments);
	}

	const compressedCount = compressRegions(regions, neighborMap, assignments);
	if (compressedCount > 0) {
		logger.info({count: compressedCount}, 'Compressed neighboring regions to minimize total segment count');
		mergeUndersizedRegions(regions, neighborMap, assignments);
	}

	await fillEmptyCells(client, regions, assignments, neighborMap);

	const remainingUndersizedAfterFill = regions.filter((r) => r.voter_count > 0 && r.voter_count < ABSOLUTE_MIN).length;
	if (remainingUndersizedAfterFill > 0) {
		logger.info({count: remainingUndersizedAfterFill}, 'Merging undersized regions after empty-cell fill');
		mergeUndersizedRegions(regions, neighborMap, assignments);
	}

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
	captureDebug: boolean,
): Region {
	const growthSteps: RegionGrowthStep[] = captureDebug
		? [
				{
					step: 1,
					action: 'seed',
					cell_id: seedCell.cell_id,
					from_cell_id: null,
					cell_voter_count: seedCell.voter_count,
					running_voter_count: seedCell.voter_count,
					projected_voter_count: seedCell.voter_count,
				},
		  ]
		: [];
	let stepCounter = growthSteps.length;

	const region: Region = {
		id: '',
		cell_ids: [seedCell.cell_id],
		voter_count: seedCell.voter_count,
		seed_cell_id: seedCell.cell_id,
			debug: captureDebug
				? {
						growth_steps: growthSteps,
						merged_from_region_ids: [],
						rebalanced_transfers: [],
						compression_transfers: [],
						empty_fill_assignments: [],
				  }
			: undefined,
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
			const projectedVoterCount = region.voter_count + assignment.voter_count;

			if (projectedVoterCount > ABSOLUTE_MAX) {
				if (captureDebug) {
					growthSteps.push({
						step: ++stepCounter,
						action: 'skip_exceeds_max',
						cell_id: assignment.cell_id,
						from_cell_id: currentCellId,
						cell_voter_count: assignment.voter_count,
						running_voter_count: region.voter_count,
						projected_voter_count: projectedVoterCount,
					});
				}
				continue;
			}

			region.cell_ids.push(assignment.cell_id);
			region.voter_count += assignment.voter_count;
			assignedCells.add(assignment.cell_id);
			queue.push(assignment.cell_id);
			if (captureDebug) {
				growthSteps.push({
					step: ++stepCounter,
					action: 'add_neighbor',
					cell_id: assignment.cell_id,
					from_cell_id: currentCellId,
					cell_voter_count: assignment.voter_count,
					running_voter_count: region.voter_count,
					projected_voter_count: region.voter_count,
				});
			}

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
): number {
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

		const smallRegionCentroid = getRegionCentroid(smallRegion, assignments);
		for (const candidate of adjacentRegions.values()) {
			const newCount = candidate.voter_count + smallRegion.voter_count;
			if (newCount > ABSOLUTE_MAX) {
				continue;
			}
			const overflow = Math.max(0, newCount - TARGET_MAX);
			const candidateCentroid = getRegionCentroid(candidate, assignments);
			const distanceScore =
				smallRegionCentroid && candidateCentroid ? getDistance(smallRegionCentroid, candidateCentroid) : Infinity;
			const score = overflow * 1_000_000 + distanceScore;

			if (score < bestScore || (score === bestScore && bestTarget && candidate.id < bestTarget.id)) {
				bestScore = score;
				bestTarget = candidate;
			}
		}

		if (bestTarget) {
			bestTarget.cell_ids.push(...smallRegion.cell_ids);
			bestTarget.voter_count += smallRegion.voter_count;
			bestTarget.debug?.merged_from_region_ids.push(smallRegion.id);

			for (const cellId of smallRegion.cell_ids) {
				cellToRegion.set(cellId, bestTarget);
			}

			smallRegion.voter_count = 0;
			smallRegion.cell_ids = [];
		} else {
			logger.warn(
				{
					regionId: smallRegion.id,
					voterCount: smallRegion.voter_count,
					adjacentRegionIds: Array.from(adjacentRegions.keys()),
					absoluteMax: ABSOLUTE_MAX,
				},
				'Undersized region could not be merged without exceeding the absolute max',
			);
		}
	}

	const mergedCount = regions.filter((r) => r.voter_count === 0).length;
	regions.splice(0, regions.length, ...regions.filter((r) => r.voter_count > 0));

	if (mergedCount > 0) {
		logger.info({mergedCount}, 'Undersized regions merged');
	}

	return mergedCount;
}

function rebalanceUndersizedRegions(
	regions: Region[],
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
): number {
	let transferCount = 0;
	let transferOrder = 1;
	const cellToRegion = buildCellToRegion(regions);
	const sortedUndersized = () =>
		regions
			.filter((region) => region.voter_count > 0 && region.voter_count < ABSOLUTE_MIN)
			.sort((a, b) => a.voter_count - b.voter_count || a.id.localeCompare(b.id));

	for (const undersizedRegion of sortedUndersized()) {
		while (undersizedRegion.voter_count > 0 && undersizedRegion.voter_count < ABSOLUTE_MIN) {
			const transfer = findBestBoundaryTransfer(undersizedRegion, cellToRegion, neighborMap, assignments);
			if (!transfer) break;

			const {donorRegion, cellId, targetCellId, cellAssignment} = transfer;
			const donorIndex = donorRegion.cell_ids.indexOf(cellId);
			if (donorIndex === -1) break;

			donorRegion.cell_ids.splice(donorIndex, 1);
			donorRegion.voter_count -= cellAssignment.voter_count;
			undersizedRegion.cell_ids.push(cellId);
			undersizedRegion.voter_count += cellAssignment.voter_count;
			cellToRegion.set(cellId, undersizedRegion);

			if (donorRegion.seed_cell_id === cellId) {
				donorRegion.seed_cell_id = selectDeterministicSeedCell(donorRegion, assignments);
			}

			undersizedRegion.debug?.rebalanced_transfers.push({
				order: transferOrder++,
				cell_id: cellId,
				from_cell_id: targetCellId,
				donor_region_id: donorRegion.id,
				cell_voter_count: cellAssignment.voter_count,
				running_voter_count: undersizedRegion.voter_count,
				donor_voter_count: donorRegion.voter_count,
			});

			transferCount++;
		}
	}

	if (transferCount > 0) {
		logger.info({transferCount}, 'Transferred populated boundary cells to rebalance regions');
	}

	return transferCount;
}

function findBestBoundaryTransfer(
	targetRegion: Region,
	cellToRegion: Map<string, Region>,
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
):
	| {
			donorRegion: Region;
			cellId: string;
			targetCellId: string;
			cellAssignment: CellAssignment;
	  }
	| null {
	const candidates: Array<{
		donorRegion: Region;
		cellId: string;
		targetCellId: string;
		cellAssignment: CellAssignment;
		newTargetCount: number;
		newDonorCount: number;
		distanceToTarget: number;
		distanceToDonor: number;
	}> = [];
	const targetCentroid = getRegionCentroid(targetRegion, assignments);

	for (const targetCellId of targetRegion.cell_ids) {
		const neighbors = neighborMap.get(targetCellId) || [];
		for (const neighborId of neighbors) {
			const donorRegion = cellToRegion.get(neighborId);
			if (!donorRegion || donorRegion.id === targetRegion.id) continue;

			const cellAssignment = assignments.get(neighborId);
			if (!cellAssignment) continue;

			const newTargetCount = targetRegion.voter_count + cellAssignment.voter_count;
			const newDonorCount = donorRegion.voter_count - cellAssignment.voter_count;

			if (newTargetCount > ABSOLUTE_MAX) continue;
			if (newDonorCount < ABSOLUTE_MIN) continue;
			if (!isSafeCellTransfer(donorRegion, neighborId, neighborMap)) continue;

			const donorCentroid = getRegionCentroid(donorRegion, assignments);

			candidates.push({
				donorRegion,
				cellId: neighborId,
				targetCellId,
				cellAssignment,
				newTargetCount,
				newDonorCount,
				distanceToTarget: targetCentroid ? getDistance(cellAssignment.centroid, targetCentroid) : Infinity,
				distanceToDonor: donorCentroid ? getDistance(cellAssignment.centroid, donorCentroid) : Infinity,
			});
		}
	}

	if (candidates.length === 0) {
		return null;
	}

	candidates.sort((a, b) => {
		const aTargetInRange = a.newTargetCount >= ABSOLUTE_MIN ? 0 : 1;
		const bTargetInRange = b.newTargetCount >= ABSOLUTE_MIN ? 0 : 1;
		if (aTargetInRange !== bTargetInRange) return aTargetInRange - bTargetInRange;

		const aTargetScore = a.newTargetCount >= ABSOLUTE_MIN ? TARGET_MAX - a.newTargetCount : -(a.newTargetCount);
		const bTargetScore = b.newTargetCount >= ABSOLUTE_MIN ? TARGET_MAX - b.newTargetCount : -(b.newTargetCount);
		if (aTargetScore !== bTargetScore) return aTargetScore - bTargetScore;

		const relativeDistanceA = a.distanceToTarget - a.distanceToDonor;
		const relativeDistanceB = b.distanceToTarget - b.distanceToDonor;
		if (Math.abs(relativeDistanceA - relativeDistanceB) > 1e-10) return relativeDistanceA - relativeDistanceB;

		const aDonorScore = Math.abs(TARGET_IDEAL - a.newDonorCount);
		const bDonorScore = Math.abs(TARGET_IDEAL - b.newDonorCount);
		if (aDonorScore !== bDonorScore) return aDonorScore - bDonorScore;

		return a.cellId.localeCompare(b.cellId) || a.donorRegion.id.localeCompare(b.donorRegion.id);
	});

	return {
		donorRegion: candidates[0]!.donorRegion,
		cellId: candidates[0]!.cellId,
		targetCellId: candidates[0]!.targetCellId,
		cellAssignment: candidates[0]!.cellAssignment,
	};
}

function isSafeCellTransfer(region: Region, removeCellId: string, neighborMap: Map<string, string[]>): boolean {
	if (!region.cell_ids.includes(removeCellId)) return false;

	const remaining = region.cell_ids.filter((cellId) => cellId !== removeCellId);
	if (remaining.length === 0) return false;
	if (remaining.length === 1) return true;

	const remainingSet = new Set(remaining);
	const visited = new Set<string>();
	const queue: string[] = [remaining[0]!];
	visited.add(remaining[0]!);

	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighborId of neighborMap.get(current) || []) {
			if (!remainingSet.has(neighborId) || visited.has(neighborId)) continue;
			visited.add(neighborId);
			queue.push(neighborId);
		}
	}

	return visited.size === remaining.length;
}

function selectDeterministicSeedCell(region: Region, assignments: Map<string, CellAssignment>): string {
	const sortedCellIds = [...region.cell_ids].sort((a, b) => {
		const assignmentA = assignments.get(a);
		const assignmentB = assignments.get(b);

		if (!assignmentA && !assignmentB) return a.localeCompare(b);
		if (!assignmentA) return 1;
		if (!assignmentB) return -1;

		const latDiff = assignmentB.centroid.lat - assignmentA.centroid.lat;
		if (Math.abs(latDiff) > 1e-10) return latDiff;

		const lngDiff = assignmentA.centroid.lng - assignmentB.centroid.lng;
		if (Math.abs(lngDiff) > 1e-10) return lngDiff;

		return a.localeCompare(b);
	});

	return sortedCellIds[0] ?? region.seed_cell_id;
}

function buildCellToRegion(regions: Region[]): Map<string, Region> {
	const cellToRegion = new Map<string, Region>();
	for (const region of regions) {
		for (const cellId of region.cell_ids) {
			cellToRegion.set(cellId, region);
		}
	}

	return cellToRegion;
}

function compressRegions(
	regions: Region[],
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
): number {
	let compressedCount = 0;
	const orderState = {current: 1};

	while (true) {
		const candidates = regions
			.filter((region) => region.voter_count > 0 && region.voter_count < ABSOLUTE_MAX)
			.sort(
				(a, b) =>
					a.voter_count - b.voter_count || a.cell_ids.length - b.cell_ids.length || a.id.localeCompare(b.id),
			);

		let compressedThisPass = false;
		for (const sourceRegion of candidates) {
			if (!tryEliminateRegion(sourceRegion, regions, neighborMap, assignments, orderState)) {
				continue;
			}

			compressedCount++;
			compressedThisPass = true;
			break;
		}

		if (!compressedThisPass) {
			break;
		}

		regions.splice(0, regions.length, ...regions.filter((region) => region.voter_count > 0));
	}

	return compressedCount;
}

function tryEliminateRegion(
	sourceRegion: Region,
	regions: Region[],
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
	orderState: {current: number},
): boolean {
	if (sourceRegion.voter_count === 0) return false;

	const cellToRegion = buildCellToRegion(regions);
	const transferHistory: Array<{
		targetRegion: Region;
		cellId: string;
		targetCellId: string;
		cellAssignment: CellAssignment;
		previousSourceSeed: string;
	}> = [];
	const compressionDebugEvents = new Map<string, RegionCompressionTransfer[]>();

	while (sourceRegion.cell_ids.length > 0) {
		const transfer = findBestCompressionTransfer(sourceRegion, cellToRegion, neighborMap, assignments);
		if (!transfer) {
			for (let index = transferHistory.length - 1; index >= 0; index--) {
				const step = transferHistory[index]!;
				const targetIndex = step.targetRegion.cell_ids.indexOf(step.cellId);
				if (targetIndex !== -1) {
					step.targetRegion.cell_ids.splice(targetIndex, 1);
				}
				step.targetRegion.voter_count -= step.cellAssignment.voter_count;
				sourceRegion.cell_ids.push(step.cellId);
				sourceRegion.voter_count += step.cellAssignment.voter_count;
				sourceRegion.seed_cell_id = step.previousSourceSeed;
				cellToRegion.set(step.cellId, sourceRegion);
			}

			return false;
		}

		const previousSourceSeed = sourceRegion.seed_cell_id;
		const sourceIndex = sourceRegion.cell_ids.indexOf(transfer.cellId);
		if (sourceIndex === -1) {
			return false;
		}

		sourceRegion.cell_ids.splice(sourceIndex, 1);
		sourceRegion.voter_count -= transfer.cellAssignment.voter_count;
		transfer.targetRegion.cell_ids.push(transfer.cellId);
		transfer.targetRegion.voter_count += transfer.cellAssignment.voter_count;
		cellToRegion.set(transfer.cellId, transfer.targetRegion);

		if (sourceRegion.cell_ids.length > 0 && sourceRegion.seed_cell_id === transfer.cellId) {
			sourceRegion.seed_cell_id = selectDeterministicSeedCell(sourceRegion, assignments);
		}

		transferHistory.push({
			targetRegion: transfer.targetRegion,
			cellId: transfer.cellId,
			targetCellId: transfer.targetCellId,
			cellAssignment: transfer.cellAssignment,
			previousSourceSeed,
		});

		const events = compressionDebugEvents.get(transfer.targetRegion.id) ?? [];
		events.push({
			order: orderState.current++,
			cell_id: transfer.cellId,
			from_cell_id: transfer.targetCellId,
			source_region_id: sourceRegion.id,
			cell_voter_count: transfer.cellAssignment.voter_count,
			target_voter_count: transfer.targetRegion.voter_count,
			source_voter_count: sourceRegion.voter_count,
			source_eliminated: sourceRegion.cell_ids.length === 0,
		});
		compressionDebugEvents.set(transfer.targetRegion.id, events);
	}

	for (const step of transferHistory) {
		if (!step.targetRegion.debug) continue;
		if (!step.targetRegion.debug.merged_from_region_ids.includes(sourceRegion.id)) {
			step.targetRegion.debug.merged_from_region_ids.push(sourceRegion.id);
		}
	}

	for (const [targetRegionId, events] of compressionDebugEvents) {
		const targetRegion = regions.find((region) => region.id === targetRegionId);
		targetRegion?.debug?.compression_transfers.push(...events);
	}

	sourceRegion.voter_count = 0;
	sourceRegion.cell_ids = [];

	return transferHistory.length > 0;
}

function findBestCompressionTransfer(
	sourceRegion: Region,
	cellToRegion: Map<string, Region>,
	neighborMap: Map<string, string[]>,
	assignments: Map<string, CellAssignment>,
):
	| {
			targetRegion: Region;
			cellId: string;
			targetCellId: string;
			cellAssignment: CellAssignment;
	  }
	| null {
	const sourceCentroid = getRegionCentroid(sourceRegion, assignments);
	const candidates: Array<{
		targetRegion: Region;
		cellId: string;
		targetCellId: string;
		cellAssignment: CellAssignment;
		targetOptionCount: number;
		targetOverflow: number;
		distanceToTarget: number;
		distanceToSource: number;
		targetSlack: number;
	}> = [];

	for (const cellId of sourceRegion.cell_ids) {
		const cellAssignment = assignments.get(cellId);
		if (!cellAssignment) continue;
		if (!canRemoveCellForCompression(sourceRegion, cellId, neighborMap)) continue;

		const eligibleTargets = new Map<string, Region>();
		for (const neighborId of neighborMap.get(cellId) || []) {
			const targetRegion = cellToRegion.get(neighborId);
			if (!targetRegion || targetRegion.id === sourceRegion.id || targetRegion.voter_count === 0) continue;
			if (targetRegion.voter_count + cellAssignment.voter_count > ABSOLUTE_MAX) continue;
			if (!eligibleTargets.has(targetRegion.id)) {
				eligibleTargets.set(targetRegion.id, targetRegion);
			}
		}

		if (eligibleTargets.size === 0) continue;

		for (const targetRegion of eligibleTargets.values()) {
			const targetCentroid = getRegionCentroid(targetRegion, assignments);
			const newTargetCount = targetRegion.voter_count + cellAssignment.voter_count;

			candidates.push({
				targetRegion,
				cellId,
				targetCellId:
					(neighborMap.get(cellId) || []).find((neighborId) => cellToRegion.get(neighborId)?.id === targetRegion.id) ?? cellId,
				cellAssignment,
				targetOptionCount: eligibleTargets.size,
				targetOverflow: Math.max(0, newTargetCount - TARGET_MAX),
				distanceToTarget: targetCentroid ? getDistance(cellAssignment.centroid, targetCentroid) : Infinity,
				distanceToSource: sourceCentroid ? getDistance(cellAssignment.centroid, sourceCentroid) : 0,
				targetSlack: ABSOLUTE_MAX - newTargetCount,
			});
		}
	}

	if (candidates.length === 0) {
		return null;
	}

	candidates.sort((a, b) => {
		if (a.targetOptionCount !== b.targetOptionCount) return a.targetOptionCount - b.targetOptionCount;
		if (a.targetOverflow !== b.targetOverflow) return a.targetOverflow - b.targetOverflow;
		if (Math.abs(a.distanceToTarget - b.distanceToTarget) > 1e-10) {
			return a.distanceToTarget - b.distanceToTarget;
		}
		if (a.targetSlack !== b.targetSlack) return a.targetSlack - b.targetSlack;
		if (Math.abs(a.distanceToSource - b.distanceToSource) > 1e-10) {
			return b.distanceToSource - a.distanceToSource;
		}

		return a.cellId.localeCompare(b.cellId) || a.targetRegion.id.localeCompare(b.targetRegion.id);
	});

	return {
		targetRegion: candidates[0]!.targetRegion,
		cellId: candidates[0]!.cellId,
		targetCellId: candidates[0]!.targetCellId,
		cellAssignment: candidates[0]!.cellAssignment,
	};
}

function canRemoveCellForCompression(region: Region, removeCellId: string, neighborMap: Map<string, string[]>): boolean {
	if (!region.cell_ids.includes(removeCellId)) return false;

	const remaining = region.cell_ids.filter((cellId) => cellId !== removeCellId);
	if (remaining.length === 0) return true;
	if (remaining.length === 1) return true;

	const remainingSet = new Set(remaining);
	const visited = new Set<string>();
	const queue: string[] = [remaining[0]!];
	visited.add(remaining[0]!);

	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighborId of neighborMap.get(current) || []) {
			if (!remainingSet.has(neighborId) || visited.has(neighborId)) continue;
			visited.add(neighborId);
			queue.push(neighborId);
		}
	}

	return visited.size === remaining.length;
}

function getRegionCentroid(region: Region, assignments: Map<string, CellAssignment>): GeoPoint | null {
	let weightedLat = 0;
	let weightedLng = 0;
	let totalWeight = 0;

	for (const cellId of region.cell_ids) {
		const assignment = assignments.get(cellId);
		if (!assignment) continue;
		const weight = Math.max(assignment.voter_count, 1);
		weightedLat += assignment.centroid.lat * weight;
		weightedLng += assignment.centroid.lng * weight;
		totalWeight += weight;
	}

	if (totalWeight === 0) {
		const seedAssignment = assignments.get(region.seed_cell_id);
		return seedAssignment ? seedAssignment.centroid : null;
	}

	return {
		lat: weightedLat / totalWeight,
		lng: weightedLng / totalWeight,
	};
}

function getDistance(from: GeoPoint, to: GeoPoint): number {
	return Math.hypot(from.lat - to.lat, from.lng - to.lng);
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
							const regionCentroid = getRegionCentroid(region, assignments);
							const dist = regionCentroid
								? getDistance(cellData, regionCentroid)
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
			targetRegion.debug?.empty_fill_assignments.push({pass: passNumber, cell_id: cellId});
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
