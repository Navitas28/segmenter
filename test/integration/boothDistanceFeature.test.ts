import crypto from 'crypto';
import request from 'supertest';
import {withTransaction, pool} from '../../src/db/transaction.js';
import {persistBoothDistanceMetadata} from '../../src/segmentation/boothDistance.js';

describe('booth distance feature', () => {
	let createServer: typeof import('../../src/server.js').createServer;
	let app: import('express').Express;

	beforeAll(async () => {
		({createServer} = await import('../../src/server.js'));
		app = createServer();
	});

	afterAll(async () => {
		await pool.end();
	});

	it('persists booth distance metadata for far voters and missing locations', async () => {
		const electionId = crypto.randomUUID();
		const nodeId = crypto.randomUUID();
		const segmentId = crypto.randomUUID();
		const boothWithLocationId = crypto.randomUUID();
		const boothMissingLocationId = crypto.randomUUID();
		const familyFarId = crypto.randomUUID();
		const familyMissingBoothId = crypto.randomUUID();
		const familyMissingMemberLocationId = crypto.randomUUID();
		const farVoterId = crypto.randomUUID();
		const missingBoothVoterId = crypto.randomUUID();
		const missingMemberLocationVoterId = crypto.randomUUID();

		await pool.query(
			`insert into elections (id, name, election_type, election_date, state, status)
       values ($1, $2, $3, $4, $5, $6)`,
			[electionId, 'Test Election', 'general', '2026-01-01', 'TS', 'active'],
		);
		await pool.query(
			`insert into booths (id, election_id, node_id, booth_number, booth_name, latitude, longitude, status)
       values
        ($1, $2, $3, $4, $5, $6, $7, 'active'),
        ($8, $2, $3, $9, $10, null, null, 'active')`,
			[
				boothWithLocationId,
				electionId,
				nodeId,
				'101',
				'Booth 101',
				17.0,
				78.0,
				boothMissingLocationId,
				'102',
				'Booth 102',
			],
		);
		await pool.query(
			`insert into families (id, election_id, booth_id, family_number, latitude, longitude, member_count)
       values
        ($1, $2, $3, 'F-1', $4, $5, 1),
        ($6, $2, $7, 'F-2', $8, $9, 1),
        ($10, $2, $3, 'F-3', null, null, 1)`,
			[
				familyFarId,
				electionId,
				boothWithLocationId,
				17.03,
				78.0,
				familyMissingBoothId,
				boothMissingLocationId,
				17.04,
				78.0,
				familyMissingMemberLocationId,
			],
		);
		await pool.query(
			`insert into voters (
        id, election_id, booth_id, family_id, voter_id_number, full_name, latitude, longitude
      ) values
        ($1, $2, $3, $4, 'V-1', 'Far Voter', null, null),
        ($5, $2, $6, $7, 'V-2', 'Missing Booth Voter', 17.04, 78.0),
        ($8, $2, $3, $9, 'V-3', 'Missing Member Location', null, null)`,
			[
				farVoterId,
				electionId,
				boothWithLocationId,
				familyFarId,
				missingBoothVoterId,
				boothMissingLocationId,
				familyMissingBoothId,
				missingMemberLocationVoterId,
				familyMissingMemberLocationId,
			],
		);
		await pool.query(
			`insert into segments (id, election_id, node_id, segment_name, status, total_voters, total_families, metadata)
       values ($1, $2, $3, 'Segment 001', 'draft', 3, 3, '{"version":1}'::jsonb)`,
			[segmentId, electionId, nodeId],
		);
		await pool.query(
			`insert into segment_members (segment_id, family_id, is_manual_override)
       values
        ($1, $2, false),
        ($1, $3, false),
        ($1, $4, false)`,
			[segmentId, familyFarId, familyMissingBoothId, familyMissingMemberLocationId],
		);

		await withTransaction(async (client) => {
			await persistBoothDistanceMetadata(client, [segmentId]);
		});

		const result = await pool.query<{metadata: {booth_distance?: Record<string, unknown>}}>(
			`select metadata from segments where id = $1`,
			[segmentId],
		);

		const boothDistance = result.rows[0]?.metadata?.booth_distance;
		expect(boothDistance).toBeDefined();
		expect(boothDistance?.far_voter_count).toBe(1);
		expect(boothDistance?.missing_booth_location_voter_count).toBe(1);
		expect(boothDistance?.member_location_missing_voter_count).toBe(1);
		expect(boothDistance?.far_voter_ids).toEqual([farVoterId]);
		expect(boothDistance?.missing_booth_location_voter_ids).toEqual([missingBoothVoterId]);
		expect(boothDistance?.member_location_missing_voter_ids).toEqual([missingMemberLocationVoterId]);
	});

	it('returns persisted booth distance fields from GET /api/segments', async () => {
		const electionId = crypto.randomUUID();
		const nodeId = crypto.randomUUID();
		const segmentId = crypto.randomUUID();
		const boothFarId = crypto.randomUUID();
		const boothMissingId = crypto.randomUUID();
		const familyFarId = crypto.randomUUID();
		const familyMissingId = crypto.randomUUID();
		const farVoterId = crypto.randomUUID();
		const missingVoterId = crypto.randomUUID();
		const jobId = crypto.randomUUID();

		await pool.query(
			`insert into elections (id, name, election_type, election_date, state, status)
       values ($1, $2, $3, $4, $5, $6)`,
			[electionId, 'API Test Election', 'general', '2026-01-01', 'TS', 'active'],
		);
		await pool.query(
			`insert into booths (id, election_id, node_id, booth_number, booth_name, latitude, longitude, status)
       values
        ($1, $2, $3, '201', 'Booth 201', 17.0, 78.0, 'active'),
        ($4, $2, $3, '202', 'Booth 202', null, null, 'active')`,
			[boothFarId, electionId, nodeId, boothMissingId],
		);
		await pool.query(
			`insert into voters (
        id, election_id, booth_id, family_id, voter_id_number, full_name, age, epic_number, latitude, longitude
      ) values
        ($1, $2, $3, $4, 'VA-1', 'Far API Voter', 45, 'EPIC-1', 17.03, 78.0),
        ($5, $2, $6, $7, 'VA-2', 'Missing API Voter', 38, 'EPIC-2', 17.02, 78.0)`,
			[farVoterId, electionId, boothFarId, familyFarId, missingVoterId, boothMissingId, familyMissingId],
		);
		await pool.query(
			`insert into segmentation_jobs (id, election_id, node_id, job_type, status, version)
       values ($1, $2, $3, 'auto_segment', 'completed', 1)`,
			[jobId, electionId, nodeId],
		);
		await pool.query(
			`insert into segments (
        id, election_id, node_id, segment_name, display_name, status, total_voters, total_families, metadata
      ) values (
        $1, $2, $3, 'Segment 101', 'Segment 101', 'draft', 2, 2, $4::jsonb
      )`,
			[
				segmentId,
				electionId,
				nodeId,
				JSON.stringify({
					version: 1,
					booth_distance: {
						threshold_meters: 2000,
						far_voter_count: 1,
						missing_booth_location_voter_count: 1,
						member_location_missing_voter_count: 0,
						far_voter_ids: [farVoterId],
						far_voters: [
							{
								voter_id: farVoterId,
								family_id: familyFarId,
								booth_id: boothFarId,
								booth_name: 'Booth 201',
								booth_number: '201',
								distance_meters: 2500,
								booth_location_status: 'available',
							},
						],
						missing_booth_location_voter_ids: [missingVoterId],
						missing_booth_location_booth_ids: [boothMissingId],
						member_location_missing_voter_ids: [],
						affected_segment: true,
					},
				}),
			],
		);
		await pool.query(
			`insert into segment_members (segment_id, family_id, is_manual_override)
       values ($1, $2, false), ($1, $3, false)`,
			[segmentId, familyFarId, familyMissingId],
		);

		const response = await request(app).get(`/api/segments?node_id=${nodeId}&version=1`);

		expect(response.status).toBe(200);
		expect(response.body.segments).toHaveLength(1);
		expect(response.body.segments[0].far_voter_count).toBe(1);
		expect(response.body.segments[0].missing_booth_location_voter_count).toBe(1);
		expect(response.body.segments[0].has_booth_distance_issues).toBe(true);

		const members = response.body.segments[0].members;
		expect(members).toHaveLength(2);
		expect(members.find((member: {voter_id: string}) => member.voter_id === farVoterId)).toMatchObject({
			is_far_from_booth: true,
			booth_location_status: 'available',
			distance_from_booth_m: 2500,
			booth_name: 'Booth 201',
		});
		expect(members.find((member: {voter_id: string}) => member.voter_id === missingVoterId)).toMatchObject({
			is_far_from_booth: false,
			booth_location_status: 'missing',
			booth_name: 'Booth 202',
		});
	});
});
