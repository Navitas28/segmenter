import crypto from 'crypto';
import pg from 'pg';
import {getTestDbUrl} from './testEnv.js';

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
	if (!pool) {
		pool = new pg.Pool({connectionString: getTestDbUrl()});
	}
	return pool;
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
}

export async function createElection(): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into elections (id, name, election_type, election_date, state, status)
     values ($1, $2, $3, $4, $5, $6)`,
		[id, 'Test Election', 'general', '2026-01-01', 'TS', 'active'],
	);
	return id;
}

export async function createHierarchyLevel(electionId: string, name: string, depth: number): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into hierarchy_levels (id, election_id, name, depth)
     values ($1, $2, $3, $4)`,
		[id, electionId, name, depth],
	);
	return id;
}

export async function createHierarchyNode(params: {electionId: string; levelId: string; name: string; parentId?: string | null}): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into hierarchy_nodes (id, election_id, level_id, parent_id, name)
     values ($1, $2, $3, $4, $5)`,
		[id, params.electionId, params.levelId, params.parentId ?? null, params.name],
	);
	return id;
}

export async function createBooth(params: {electionId: string; nodeId: string; boothNumber: string}): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into booths (id, election_id, node_id, booth_number, status)
     values ($1, $2, $3, $4, $5)`,
		[id, params.electionId, params.nodeId, params.boothNumber, 'active'],
	);
	return id;
}

export async function createVoter(params: {
	electionId: string;
	boothId: string;
	familyId?: string | null;
	voterIdNumber: string;
	fullName: string;
	sectionNumber?: number | null;
	latitude?: number | null;
	longitude?: number | null;
	address?: string | null;
	houseNumber?: string | null;
}): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into voters (
      id, election_id, booth_id, family_id, voter_id_number, full_name,
      section_number, latitude, longitude, address
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		[
			id,
			params.electionId,
			params.boothId,
			params.familyId ?? null,
			params.voterIdNumber,
			params.fullName,
			params.sectionNumber !== undefined ? String(params.sectionNumber) : null,
			params.latitude ?? null,
			params.longitude ?? null,
			params.address ?? null,
		],
	);
	return id;
}

export async function createSegmentationJob(params: {electionId: string; nodeId: string; status?: string; jobType?: string; version?: number}): Promise<string> {
	const id = crypto.randomUUID();
	await getPool().query(
		`insert into segmentation_jobs (
      id, election_id, node_id, job_type, status, version
    ) values ($1, $2, $3, $4, $5, $6)`,
		[id, params.electionId, params.nodeId, params.jobType ?? 'auto_segment', params.status ?? 'queued', params.version ?? 1],
	);
	return id;
}
