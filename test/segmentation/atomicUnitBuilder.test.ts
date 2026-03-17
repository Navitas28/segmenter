import {jest} from '@jest/globals';
import type {DbClient} from '../../src/db/transaction.js';
import {buildAtomicUnits} from '../../src/segmentation/grid-based/atomicUnitBuilder.js';

describe('buildAtomicUnits', () => {
	it('uses the families table when requested and preserves family member_count with family coordinates', async () => {
		const query = jest.fn(async (sql: string) => {
			if (sql.includes('ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326) as centroid')) {
				return {
					rowCount: 2,
					rows: [
						{
							id: 'family-1',
							voter_count: 5,
							voter_ids: ['v1', 'v2', 'v3', 'v4', 'v5'],
							centroid_geojson: JSON.stringify({
								type: 'Point',
								coordinates: [78.1, 17.4],
							}),
							used_voter_centroid: false,
						},
						{
							id: 'family-2',
							voter_count: 3,
							voter_ids: ['v6', 'v7', 'v8'],
							centroid_geojson: JSON.stringify({
								type: 'Point',
								coordinates: [78.2, 17.5],
							}),
						},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const units = await buildAtomicUnits(client, 'election-1', ['booth-1'], {source: 'families'});

		expect(units).toEqual([
			{
				id: 'family-1',
				voter_count: 5,
				voter_ids: ['v1', 'v2', 'v3', 'v4', 'v5'],
				centroid: {
					type: 'Point',
					coordinates: [78.1, 17.4],
				},
			},
			{
				id: 'family-2',
				voter_count: 3,
				voter_ids: ['v6', 'v7', 'v8'],
				centroid: {
					type: 'Point',
					coordinates: [78.2, 17.5],
				},
			},
		]);
		expect(query).toHaveBeenCalledTimes(1);
	});

	it('excludes families without family coordinates even if their voters exist', async () => {
		const query = jest.fn(async (sql: string) => {
			if (sql.includes('ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326) as centroid')) {
				return {
					rowCount: 1,
					rows: [
						{
							id: 'family-1',
							voter_count: 5,
							voter_ids: ['v1', 'v2', 'v3', 'v4', 'v5'],
							centroid_geojson: JSON.stringify({
								type: 'Point',
								coordinates: [78.1, 17.4],
							}),
						},
					],
				};
			}

			throw new Error(`Unexpected query in test: ${sql}`);
		});

		const client = {query} as unknown as DbClient;

		const units = await buildAtomicUnits(client, 'election-1', ['booth-1'], {source: 'families'});

		expect(units).toHaveLength(1);
		expect(units[0]?.id).toBe('family-1');
	});
});
