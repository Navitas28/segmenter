import {jest} from '@jest/globals';
import type {DbClient} from '../../src/db/transaction.js';
import type {CellAssignment} from '../../src/segmentation/grid-based/cellAssigner.js';
import {growRegionsWithOptions} from '../../src/segmentation/grid-based/regionGrower.js';

const makeAssignment = (cellId: string, voterCount: number, lat: number, lng: number): CellAssignment => ({
	cell_id: cellId,
	unit_ids: [`unit-${cellId}`],
	voter_count: voterCount,
	centroid: {lat, lng},
});

describe('growRegionsWithOptions', () => {
	it('does not merge an undersized region when the merge would exceed the absolute max', async () => {
		const assignments = new Map<string, CellAssignment>([
			['cell-a', makeAssignment('cell-a', 120, 18.0, 78.0)],
			['cell-b', makeAssignment('cell-b', 20, 17.9, 78.1)],
		]);

		const query = jest.fn(async (sql: string) => {
			if (sql.includes('SELECT DISTINCT') && sql.includes('neighbor_id')) {
				return {
					rows: [
						{cell_id: 'cell-a', neighbor_id: 'cell-b'},
						{cell_id: 'cell-b', neighbor_id: 'cell-a'},
					],
				};
			}

			if (sql.includes('SELECT cell_id, centroid_lat, centroid_lng FROM temp_grid_cells')) {
				return {
					rows: [
						{cell_id: 'cell-a', centroid_lat: 18.0, centroid_lng: 78.0},
						{cell_id: 'cell-b', centroid_lat: 17.9, centroid_lng: 78.1},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const regions = await growRegionsWithOptions(client, assignments, {captureDebug: true});

		expect(regions).toHaveLength(2);
		expect(regions.map((region) => region.voter_count).sort((a, b) => a - b)).toEqual([20, 120]);
		expect(regions.some((region) => region.debug?.merged_from_region_ids.length)).toBe(false);
	});

	it('still merges an undersized region when the combined voter count stays within the absolute max', async () => {
		const assignments = new Map<string, CellAssignment>([
			['cell-a', makeAssignment('cell-a', 120, 18.0, 78.0)],
			['cell-b', makeAssignment('cell-b', 10, 17.9, 78.1)],
		]);

		const query = jest.fn(async (sql: string) => {
			if (sql.includes('SELECT DISTINCT') && sql.includes('neighbor_id')) {
				return {
					rows: [
						{cell_id: 'cell-a', neighbor_id: 'cell-b'},
						{cell_id: 'cell-b', neighbor_id: 'cell-a'},
					],
				};
			}

			if (sql.includes('SELECT cell_id, centroid_lat, centroid_lng FROM temp_grid_cells')) {
				return {
					rows: [
						{cell_id: 'cell-a', centroid_lat: 18.0, centroid_lng: 78.0},
						{cell_id: 'cell-b', centroid_lat: 17.9, centroid_lng: 78.1},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const regions = await growRegionsWithOptions(client, assignments, {captureDebug: true});

		expect(regions).toHaveLength(1);
		expect(regions[0]?.voter_count).toBe(130);
		expect(regions[0]?.debug?.merged_from_region_ids).toContain('region_0002');
	});

	it('rebalances an undersized region by transferring a boundary cell from an adjacent donor region', async () => {
		const assignments = new Map<string, CellAssignment>([
			['cell-a', makeAssignment('cell-a', 100, 18.0, 78.0)],
			['cell-b', makeAssignment('cell-b', 10, 17.95, 78.05)],
			['cell-c', makeAssignment('cell-c', 10, 17.9, 78.1)],
			['cell-d', makeAssignment('cell-d', 80, 17.85, 78.15)],
		]);

		const query = jest.fn(async (sql: string) => {
			if (sql.includes('SELECT DISTINCT') && sql.includes('neighbor_id')) {
				return {
					rows: [
						{cell_id: 'cell-a', neighbor_id: 'cell-b'},
						{cell_id: 'cell-a', neighbor_id: 'cell-c'},
						{cell_id: 'cell-b', neighbor_id: 'cell-a'},
						{cell_id: 'cell-c', neighbor_id: 'cell-a'},
						{cell_id: 'cell-c', neighbor_id: 'cell-d'},
						{cell_id: 'cell-d', neighbor_id: 'cell-c'},
					],
				};
			}

			if (sql.includes('SELECT cell_id, centroid_lat, centroid_lng FROM temp_grid_cells')) {
				return {
					rows: [
						{cell_id: 'cell-a', centroid_lat: 18.0, centroid_lng: 78.0},
						{cell_id: 'cell-b', centroid_lat: 17.95, centroid_lng: 78.05},
						{cell_id: 'cell-c', centroid_lat: 17.9, centroid_lng: 78.1},
						{cell_id: 'cell-d', centroid_lat: 17.85, centroid_lng: 78.15},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const regions = await growRegionsWithOptions(client, assignments, {captureDebug: true});

		expect(regions).toHaveLength(2);
		expect(regions.map((region) => region.voter_count).sort((a, b) => a - b)).toEqual([90, 110]);
		expect(regions.every((region) => region.voter_count >= 90 && region.voter_count <= 135)).toBe(true);
		expect(regions.find((region) => region.voter_count === 90)?.debug?.rebalanced_transfers).toEqual([
			expect.objectContaining({
				cell_id: 'cell-c',
				donor_region_id: 'region_0001',
			}),
		]);
	});

	it('globally compresses a small middle region into nearby neighbors to reduce the segment count', async () => {
		const assignments = new Map<string, CellAssignment>([
			['cell-a', makeAssignment('cell-a', 125, 18.0, 78.0)],
			['cell-b', makeAssignment('cell-b', 10, 17.95, 78.05)],
			['cell-c', makeAssignment('cell-c', 10, 17.9, 78.1)],
			['cell-d', makeAssignment('cell-d', 125, 17.85, 78.15)],
		]);

		const query = jest.fn(async (sql: string) => {
			if (sql.includes('SELECT DISTINCT') && sql.includes('neighbor_id')) {
				return {
					rows: [
						{cell_id: 'cell-a', neighbor_id: 'cell-b'},
						{cell_id: 'cell-b', neighbor_id: 'cell-a'},
						{cell_id: 'cell-b', neighbor_id: 'cell-c'},
						{cell_id: 'cell-c', neighbor_id: 'cell-b'},
						{cell_id: 'cell-c', neighbor_id: 'cell-d'},
						{cell_id: 'cell-d', neighbor_id: 'cell-c'},
					],
				};
			}

			if (sql.includes('SELECT cell_id, centroid_lat, centroid_lng FROM temp_grid_cells')) {
				return {
					rows: [
						{cell_id: 'cell-a', centroid_lat: 18.0, centroid_lng: 78.0},
						{cell_id: 'cell-b', centroid_lat: 17.95, centroid_lng: 78.05},
						{cell_id: 'cell-c', centroid_lat: 17.9, centroid_lng: 78.1},
						{cell_id: 'cell-d', centroid_lat: 17.85, centroid_lng: 78.15},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const regions = await growRegionsWithOptions(client, assignments, {captureDebug: true});

		expect(regions).toHaveLength(2);
		expect(regions.map((region) => region.voter_count).sort((a, b) => a - b)).toEqual([135, 135]);
		expect(regions.every((region) => region.voter_count >= 90 && region.voter_count <= 135)).toBe(true);
		expect(regions.flatMap((region) => region.debug?.merged_from_region_ids ?? [])).toContain('region_0002');
		expect(regions.flatMap((region) => region.debug?.compression_transfers ?? [])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source_region_id: 'region_0002',
					cell_id: 'cell-b',
				}),
				expect.objectContaining({
					source_region_id: 'region_0002',
					cell_id: 'cell-c',
					source_eliminated: true,
				}),
			]),
		);
	});
});
