import {createServer} from './server.js';
import {env} from './config/env.js';
import {logger} from './config/logger.js';
import {startJobProcessor} from './services/jobProcessor.js';
import {checkDbConnection, pool} from './db/transaction.js';
import type {Server} from 'http';

let server: Server | null = null;
let stopProcessor: () => void = () => {};

async function shutdown(signal: string) {
	logger.info({signal}, 'Shutting down');
	stopProcessor();
	if (server) {
		server.close(async () => {
			await pool.end();
			process.exit(0);
		});
		return;
	}
	await pool.end();
	process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function logEnvHosts() {
	try {
		const dbHost = new URL(env.databaseUrl).hostname;
		logger.info({dbHost}, 'Database host');
	} catch (error) {
		logger.warn({err: error}, 'Invalid DATABASE_URL');
	}

	try {
		const supabaseHost = new URL(env.supabaseUrl).hostname;
		logger.info({supabaseHost}, 'Supabase host');
	} catch (error) {
		logger.warn({err: error}, 'Invalid SUPABASE_URL');
	}
}

async function start() {
	logEnvHosts();
	try {
		await checkDbConnection();
		logger.info('Database connected successfully');
	} catch (error) {
		logger.error({err: error}, 'Database connection failed');
		await pool.end();
		process.exit(1);
	}

	const app = createServer();
	server = app.listen(env.port, () => {
		logger.info({port: env.port}, 'Server listening');
	});

	stopProcessor = startJobProcessor(env.pollIntervalMs);
}

start();
