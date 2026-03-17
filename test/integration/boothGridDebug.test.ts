import crypto from 'crypto';
import {closePool, createBooth, createElection, createHierarchyLevel, createHierarchyNode, createSegmentationJob, createVoter} from '../helpers/factories.js';

describe('booth grid debug snapshot', () => {
	let processNextJob: () => Promise<void>;
	let pool: import('pg').Pool;

	beforeAll(async () => {
		process.env.SEGMENTATION_STRATEGY = 'grid-based';
		process.env.ENABLE_BOOTH_SEGMENT_GRID_DEBUG = 'true';

		({processNextJob} = await import('../../src/services/jobProcessor.js'));
		({pool} = await import('../../src/db/transaction.js'));
	});

	afterAll(async () => {
		delete process.env.ENABLE_BOOTH_SEGMENT_GRID_DEBUG;
		await closePool();
		await pool.end();
	});

	const seedHierarchy = async () => {
		const electionId = await createElection();
		const acLevelId = await createHierarchyLevel(electionId, 'AC', 1);
		const boothLevelId = await createHierarchyLevel(electionId, 'BOOTH', 2);
		const acNodeId = await createHierarchyNode({
			electionId,
			levelId: acLevelId,
			name: 'AC-1',
		});
		const boothNodeId = await createHierarchyNode({
			electionId,
			levelId: boothLevelId,
			name: 'BOOTH-1',
			parentId: acNodeId,
		});
		const boothId = await createBooth({
			electionId,
			nodeId: boothNodeId,
			boothNumber: '1',
		});

		return {electionId, boothNodeId, boothId};
	};

	it('stores a booth-only grid snapshot with cells, family points, voter points, and growth trace', async () => {
		const {electionId, boothNodeId, boothId} = await seedHierarchy();
		const familyA = crypto.randomUUID();
		const familyB = crypto.randomUUID();

		for (let i = 0; i < 2; i += 1) {
			await createVoter({
				electionId,
				boothId,
				familyId: familyA,
				voterIdNumber: `A-${i}`,
				fullName: `A ${i}`,
				latitude: 17.3001 + i * 0.0001,
				longitude: 78.4001 + i * 0.0001,
				address: 'Addr A',
			});
		}

		for (let i = 0; i < 2; i += 1) {
			await createVoter({
				electionId,
				boothId,
				familyId: familyB,
				voterIdNumber: `B-${i}`,
				fullName: `B ${i}`,
				latitude: 17.3011 + i * 0.0001,
				longitude: 78.4011 + i * 0.0001,
				address: 'Addr B',
			});
		}

		const jobId = await createSegmentationJob({
			electionId,
			nodeId: boothNodeId,
		});

		await processNextJob();

		const jobResult = await pool.query(`select status, result from segmentation_jobs where id = $1`, [jobId]);
		expect(jobResult.rows[0]?.status).toBe('completed');

		const debugSnapshot = jobResult.rows[0]?.result?.debug_snapshot;
		expect(debugSnapshot).toBeTruthy();
		expect(debugSnapshot.type).toBe('booth_grid_debug_snapshot');
		expect(debugSnapshot.scope).toBe('BOOTH');
		expect(debugSnapshot.booth_ids).toEqual([boothId]);
		expect(debugSnapshot.created_for_single_booth).toBe(true);
		expect(debugSnapshot.grid_cells?.features?.length).toBeGreaterThan(0);
		expect(debugSnapshot.family_points?.features).toHaveLength(2);
		expect(debugSnapshot.voter_points?.features).toHaveLength(4);
		expect(debugSnapshot.regions?.length).toBeGreaterThan(0);
		expect(debugSnapshot.regions?.[0]?.growth_steps?.length).toBeGreaterThan(0);
		expect(debugSnapshot.segments?.length).toBeGreaterThan(0);
	});
});
