import fs from 'fs';
import path from 'path';
import pg from 'pg';
import {beforeAll, afterAll, beforeEach, jest as jestGlobals} from '@jest/globals';
import {GenericContainer, Wait, type StartedTestContainer} from 'testcontainers';

type TestGlobals = typeof globalThis & {
	__TEST_DB_URL__?: string;
	__TEST_DB_CLIENT__?: pg.Client;
	__TEST_DB_CONTAINER__?: StartedTestContainer;
};

const globals = globalThis as TestGlobals;

jestGlobals.setTimeout(60000);

const TABLES_TO_TRUNCATE = [
	'public.segment_members',
	'public.segments',
	'public.exceptions',
	'public.audit_movements',
	'public.segmentation_jobs',
	'public.voters',
	'public.booths',
	'public.hierarchy_nodes',
	'public.hierarchy_levels',
	'public.elections',
];

const REQUIRED_TABLES = ['audit_movements', 'audit_batches', 'booths', 'exceptions', 'hierarchy_levels', 'hierarchy_nodes', 'segment_members', 'segmentation_jobs', 'segments', 'voters', 'elections'];

async function startDb(): Promise<void> {
	const container = await new GenericContainer('postgis/postgis:16-3.4')
		.withEnvironment({
			POSTGRES_USER: 'postgres',
			POSTGRES_PASSWORD: 'postgres',
			POSTGRES_DB: 'testdb',
		})
		.withExposedPorts(5432)
		.withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
		.start();

	const host = container.getHost();
	const port = container.getMappedPort(5432);
	const dbUrl = `postgresql://postgres:postgres@${host}:${port}/testdb`;

	let client: pg.Client | null = null;
	const maxRetries = 10;
	for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
		client = new pg.Client({connectionString: dbUrl});
		try {
			await client.connect();
			await client.query('SELECT 1');
			break;
		} catch (error) {
			await client.end().catch(() => undefined);
			if (attempt === maxRetries) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
	if (!client) {
		throw new Error('Failed to connect to test database');
	}

	const schemaPath = path.resolve(process.cwd(), 'schema.sql');
	const schemaSql = fs.readFileSync(schemaPath, 'utf8');
	await client.query(`create schema if not exists extensions`);
	await client.query(`create extension if not exists postgis with schema extensions`);
	await client.query(`create extension if not exists pgcrypto with schema extensions`);
	await client.query(`create extension if not exists "uuid-ossp" with schema extensions`);

	const statements = schemaSql
		.split(/;\s*\n/)
		.map((statement) => statement.trim())
		.filter(Boolean);

	const filtered = statements.filter((statement) => {
		const normalized = statement.replace(/--.*$/gm, '').trim();
		return REQUIRED_TABLES.some((table) => new RegExp(`CREATE TABLE\\s+public\\.${table}\\b`, 'i').test(normalized));
	});

	for (const statement of filtered) {
		await client.query(`${statement};`);
	}

	globals.__TEST_DB_CONTAINER__ = container;
	globals.__TEST_DB_URL__ = dbUrl;
	globals.__TEST_DB_CLIENT__ = client;

	process.env.DATABASE_URL = dbUrl;
	process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
	process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key';
	process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
}

async function stopDb(): Promise<void> {
	if (globals.__TEST_DB_CLIENT__) {
		await globals.__TEST_DB_CLIENT__.end();
	}
	if (globals.__TEST_DB_CONTAINER__) {
		await globals.__TEST_DB_CONTAINER__.stop();
	}
}

async function truncateTables(): Promise<void> {
	if (!globals.__TEST_DB_CLIENT__) return;
	const query = `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`;
	await globals.__TEST_DB_CLIENT__.query(query);
}

beforeAll(async () => {
	await startDb();
});

afterAll(async () => {
	await stopDb();
});

beforeEach(async () => {
	await truncateTables();
});
