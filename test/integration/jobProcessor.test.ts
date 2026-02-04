import crypto from 'crypto';
import {closePool, createBooth, createElection, createHierarchyLevel, createHierarchyNode, createSegmentationJob, createVoter} from '../helpers/factories.js';

describe('processNextJob', () => {
	let processNextJob: () => Promise<void>;
	let pool: import('pg').Pool;

	beforeAll(async () => {
		({processNextJob} = await import('../../src/services/jobProcessor.js'));
		({pool} = await import('../../src/db/transaction.js'));
	});

	afterAll(async () => {
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

		return {electionId, acNodeId, boothId};
	};

	it('creates segments, members, and audit movements for a job', async () => {
		const {electionId, acNodeId, boothId} = await seedHierarchy();
		const familyA = crypto.randomUUID();
		const familyB = crypto.randomUUID();

		for (let i = 0; i < 90; i += 1) {
			await createVoter({
				electionId,
				boothId,
				familyId: familyA,
				voterIdNumber: `A-${i}`,
				fullName: `A ${i}`,
				sectionNumber: 1,
				latitude: 17.3,
				longitude: 78.4,
				address: 'Addr A',
			});
		}
		for (let i = 0; i < 90; i += 1) {
			await createVoter({
				electionId,
				boothId,
				familyId: familyB,
				voterIdNumber: `B-${i}`,
				fullName: `B ${i}`,
				sectionNumber: 2,
				latitude: 17.4,
				longitude: 78.5,
				address: 'Addr B',
			});
		}

		const jobId = await createSegmentationJob({
			electionId,
			nodeId: acNodeId,
		});

		await processNextJob();

		const jobResult = await pool.query(`select status from segmentation_jobs where id = $1`, [jobId]);
		expect(jobResult.rows[0]?.status).toBe('completed');

		const segmentResult = await pool.query(`select id, metadata from segments where metadata->>'job_id' = $1`, [jobId]);
		expect(segmentResult.rowCount).toBe(2);
		segmentResult.rows.forEach((row) => {
			expect(row.metadata?.segment_code).toBeTruthy();
		});

		const memberResult = await pool.query(`select count(*)::int as count from segment_members where job_id = $1`, [jobId]);
		expect(memberResult.rows[0]?.count).toBe(180);

		const auditResult = await pool.query(`select count(*)::int as count from audit_movements`);
		expect(auditResult.rows[0]?.count).toBe(2);

		const exceptionResult = await pool.query(`select count(*)::int as count from exceptions where metadata->>'job_id' = $1`, [jobId]);
		expect(exceptionResult.rows[0]?.count).toBe(0);
	});

	it('stores exceptions when segmentation rules are violated', async () => {
		const {electionId, acNodeId, boothId} = await seedHierarchy();
		const familyA = crypto.randomUUID();

		for (let i = 0; i < 200; i += 1) {
			await createVoter({
				electionId,
				boothId,
				familyId: familyA,
				voterIdNumber: `A-${i}`,
				fullName: `A ${i}`,
				sectionNumber: 1,
				latitude: 17.3,
				longitude: 78.4,
			});
		}

		const jobId = await createSegmentationJob({
			electionId,
			nodeId: acNodeId,
		});

		await processNextJob();

		const exceptionResult = await pool.query(`select count(*)::int as count from exceptions where metadata->>'job_id' = $1`, [jobId]);
		expect(exceptionResult.rows[0]?.count).toBeGreaterThan(0);
	});

	it('marks job failed when hierarchy node is missing', async () => {
		const electionId = await createElection();
		const jobId = await createSegmentationJob({
			electionId,
			nodeId: crypto.randomUUID(),
		});

		await processNextJob();

		const jobResult = await pool.query(`select status from segmentation_jobs where id = $1`, [jobId]);
		expect(jobResult.rows[0]?.status).toBe('failed');

		const exceptionResult = await pool.query(`select count(*)::int as count from exceptions where metadata->>'job_id' = $1`, [jobId]);
		expect(exceptionResult.rows[0]?.count).toBe(1);
	});
});
