import crypto from 'crypto';
import request from 'supertest';
import {jest} from '@jest/globals';
import {closePool, createElection} from '../helpers/factories.js';

describe('jobRoutes', () => {
	let app: import('express').Express;
	let pool: import('pg').Pool;
	let createServer: typeof import('../../src/server.js').createServer;

	const supabaseInsert: jest.Mock = jest.fn();

	beforeAll(async () => {
		jest.unstable_mockModule('../../src/db/supabase.js', () => ({
			supabase: {
				from: () => ({
					insert: () => ({
						select: () => ({
							single: supabaseInsert,
						}),
					}),
				}),
			},
		}));

		({createServer} = await import('../../src/server.js'));
		({pool} = await import('../../src/db/transaction.js'));
		app = createServer();
	});

	afterAll(async () => {
		await closePool();
		await pool.end();
	});

	it('creates a segmentation job via POST /jobs/segment', async () => {
		const jobId = crypto.randomUUID();
		supabaseInsert.mockImplementationOnce(async () => ({
			data: {id: jobId},
			error: null,
		}));

		const response = await request(app).post('/jobs/segment').send({election_id: 'e-1', node_id: 'n-1'});

		expect(response.status).toBe(201);
		expect(response.body).toEqual({job_id: jobId});
	});

	it('returns segments and exceptions for GET /jobs/:jobId', async () => {
		const electionId = await createElection();
		const nodeId = crypto.randomUUID();
		const jobId = crypto.randomUUID();
		const segmentId = crypto.randomUUID();

		await pool.query(
			`insert into segments (
        id, election_id, node_id, segment_name, segment_type, total_voters,
        total_families, status, color, metadata, centroid, boundary,
        centroid_lat, centroid_lng
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        ST_SetSRID(ST_Point(0, 0), 4326),
        ST_SetSRID(ST_GeomFromText('POLYGON((0 0,0 1,1 1,1 0,0 0))'), 4326),
        $11, $12
      )`,
			[segmentId, electionId, nodeId, 'Segment 1', 'auto', 10, 5, 'draft', '#000000', {job_id: jobId, segment_code: 'AUTO-1-1', version: 1}, 0, 0],
		);

		await pool.query(
			`insert into exceptions (
        election_id, exception_type, entity_type, entity_id, severity, status, metadata
      ) values ($1, $2, $3, $4, $5, $6, $7)`,
			[electionId, 'other', 'segment', segmentId, 'medium', 'open', {job_id: jobId, reason: 'TEST'}],
		);

		const response = await request(app).get(`/jobs/${jobId}`);

		expect(response.status).toBe(200);
		expect(response.body.job_id).toBe(jobId);
		expect(response.body.segments).toHaveLength(1);
		expect(response.body.exceptions).toHaveLength(1);
		expect(response.body.segments[0].segment_code).toBe('AUTO-1-1');
	});
});
