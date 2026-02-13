import pg from 'pg';
import {readFileSync} from 'fs';
import {join} from 'path';
import {env} from '../src/config/env.js';

const {Pool} = pg;

async function runMigration(migrationFile: string) {
	const pool = new Pool({
		connectionString: env.databaseUrl,
	});

	try {
		const sql = readFileSync(join(process.cwd(), 'migrations', migrationFile), 'utf-8');
		console.log(`Running migration: ${migrationFile}`);
		await pool.query(sql);
		console.log(`✓ Migration ${migrationFile} completed successfully`);
	} catch (error) {
		console.error(`✗ Migration ${migrationFile} failed:`, error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

const migrationFile = process.argv[2] || '003_ensure_segment_display_fields.sql';
runMigration(migrationFile);
