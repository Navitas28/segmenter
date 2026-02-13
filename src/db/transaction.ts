import pg from 'pg';
import {env} from '../config/env.js';
import {logger} from '../config/logger.js';

const {Pool} = pg;

export const pool = new Pool({
	connectionString: env.databaseUrl,
	max: 20, // Maximum number of clients in the pool
	idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
	connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
	allowExitOnIdle: false, // Don't exit when all clients are idle
});

// Handle pool-level errors to prevent unhandled exceptions
pool.on('error', (err, client) => {
	logger.error({err, clientAddress: client?.connection?.stream?.remoteAddress}, 'Unexpected error on idle client');
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
