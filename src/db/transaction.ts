import pg from 'pg';
import {env} from '../config/env.js';

const {Pool} = pg;

export const pool = new Pool({
	connectionString: env.databaseUrl,
});

export type DbClient = pg.PoolClient;

export async function checkDbConnection(): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query('SELECT 1');
	} finally {
		client.release();
	}
}

// Only use the pg client inside the transaction callback.
export async function withTransaction<T>(handler: (client: DbClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await handler(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}
