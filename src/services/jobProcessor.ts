import {v4 as uuidv4} from 'uuid';
import {logger} from '../config/logger.js';
import {withTransaction, DbClient} from '../db/transaction.js';
import {runSegmentation} from '../segmentation/segmentationEngine.js';

type JobRow = {
	id: string;
	election_id: string;
	node_id: string;
	version: number;
};

export function startJobProcessor(pollIntervalMs: number): () => void {
	let isRunning = false;
	const timer = setInterval(() => {
		if (isRunning) return;
		isRunning = true;
		processNextJob()
			.catch((error) => {
				logger.error({error}, 'Job processor error');
			})
			.finally(() => {
				isRunning = false;
			});
	}, pollIntervalMs);

	return () => clearInterval(timer);
}

export async function processNextJob(): Promise<void> {
	let currentJobId: string | null = null;
	const totalStartTime = Date.now();

	await withTransaction(async (client) => {
		// Find and lock next queued job
		const nextJobResult = await client.query(
			`
			SELECT id
			FROM segmentation_jobs
			WHERE job_type = 'auto_segment'
			  AND status = 'queued'
			ORDER BY created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
			`,
		);

		if (nextJobResult.rowCount === 0) return;

		const nextJobId = String(nextJobResult.rows[0].id);

		// Mark job as running
		const lockResult = await client.query(
			`
			UPDATE segmentation_jobs
			SET status = 'running',
			    started_at = NOW()
			WHERE id = $1
			  AND status = 'queued'
			RETURNING id, election_id, node_id, version
			`,
			[nextJobId],
		);

		if (lockResult.rowCount === 0) return;

		const job = lockResult.rows[0] as JobRow;
		const jobId = String(job.id);
		currentJobId = jobId;

		logger.info({jobId, electionId: job.election_id, nodeId: job.node_id}, 'Segmentation job started');

		// Determine next version number
		const versionResult = await client.query(
			`
			SELECT COALESCE(MAX((metadata->>'version')::int), 0) as max_version
			FROM segments
			WHERE node_id = $1
			`,
			[job.node_id],
		);

		const maxVersion = Number(versionResult.rows[0]?.max_version ?? 0);
		job.version = Number.isNaN(maxVersion) ? 1 : maxVersion + 1;

		// Run new grid-based segmentation engine
		try {
			const result = await runSegmentation(job.election_id, job.node_id, job.version);

			// Create audit batch
			await createAuditBatch(client, job, jobId, result.segment_count);

			// Mark job as completed
			const totalDurationMs = Date.now() - totalStartTime;

			await client.query(
				`
				UPDATE segmentation_jobs
				SET status = 'completed',
				    completed_at = NOW(),
				    result = $2
				WHERE id = $1
				`,
				[
					jobId,
					{
						algorithm_ms: result.algorithm_ms,
						db_write_ms: result.db_write_ms,
						total_ms: totalDurationMs,
						run_hash: result.run_hash,
						segment_count: result.segment_count,
						voter_count: result.voter_count,
						family_count: result.family_count,
					},
				],
			);

			logger.info(
				{
					jobId,
					segmentCount: result.segment_count,
					voterCount: result.voter_count,
					version: job.version,
					durationMs: totalDurationMs,
				},
				'Segmentation job completed successfully',
			);
		} catch (error) {
			// Log error and mark job as failed
			const errorId = uuidv4();
			// #region agent log
			fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					location: 'jobProcessor.ts:128',
					message: 'CATCH BLOCK - Error details',
					data: {
						errorId,
						jobId,
						errorType: typeof error,
						errorConstructor: error?.constructor?.name,
						errorMessage: error instanceof Error ? error.message : String(error),
						errorStack: error instanceof Error ? error.stack : undefined,
						errorKeys: error ? Object.keys(error) : [],
					},
					timestamp: Date.now(),
					sessionId: 'debug-session',
					hypothesisId: 'A',
				}),
			}).catch(() => {});
			// #endregion
			logger.error({error, errorId, jobId}, 'Segmentation failed');

			await client.query(`UPDATE segmentation_jobs SET status = 'failed' WHERE id = $1`, [jobId]);

			await insertException(client, job.election_id, jobId, errorId, error);

			throw error;
		}
	}).catch(async (error) => {
		// #region agent log
		fetch('http://127.0.0.1:7246/ingest/8859c6b7-464f-4642-bea1-fa31d63b931e', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				location: 'jobProcessor.ts:139',
				message: 'Transaction CATCH - Error details',
				data: {errorType: typeof error, errorConstructor: error?.constructor?.name, errorMessage: error instanceof Error ? error.message : String(error), errorStack: error instanceof Error ? error.stack : undefined, currentJobId},
				timestamp: Date.now(),
				sessionId: 'debug-session',
				hypothesisId: 'A',
			}),
		}).catch(() => {});
		// #endregion
		logger.error({error}, 'Job processing transaction failed');
		if (currentJobId) {
			await markJobFailedOutsideTransaction(currentJobId, error);
		}
	});
}

/**
 * Create audit batch for segmentation job.
 */
async function createAuditBatch(client: DbClient, job: JobRow, jobId: string, segmentCount: number): Promise<void> {
	const batchResult = await client.query(
		`
		INSERT INTO audit_batches (election_id, batch_type, description, total_changes, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
		`,
		[job.election_id, 'segmentation', `Auto segmentation job ${jobId}`, segmentCount, 'applied'],
	);

	const batchId = String(batchResult.rows[0]?.id);

	// Get all segments for this job
	const segmentsResult = await client.query(
		`
		SELECT id, metadata
		FROM segments
		WHERE node_id = $1 AND status = 'draft'
		`,
		[job.node_id],
	);

	// Insert audit movements
	const values: string[] = [];
	const params: unknown[] = [];

	for (const segment of segmentsResult.rows) {
		const offset = params.length;
		values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
		params.push(batchId, 'segment', String(segment.id), 'create', segment.metadata);
	}

	if (values.length > 0) {
		await client.query(
			`
			INSERT INTO audit_movements (batch_id, entity_type, entity_id, action, new_data)
			VALUES ${values.join(',')}
			`,
			params,
		);
	}

	logger.info({batchId, segmentCount}, 'Audit batch created');
}

/**
 * Insert exception record for failed job.
 */
async function insertException(client: DbClient, electionId: string, jobId: string, errorId: string, error: unknown): Promise<void> {
	await client.query(
		`
		INSERT INTO exceptions (
			election_id,
			exception_type,
			entity_type,
			entity_id,
			severity,
			metadata
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		`,
		[
			electionId,
			'other',
			'segment',
			jobId,
			'high',
			{
				job_id: jobId,
				error_id: errorId,
				reason: 'JOB_FAILED',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
		],
	);
}

/**
 * Mark job as failed outside of transaction (fallback).
 */
async function markJobFailedOutsideTransaction(jobId: string, error: unknown): Promise<void> {
	const errorId = uuidv4();
	logger.error({error, errorId, jobId}, 'Marking job as failed (outside transaction)');

	await withTransaction(async (client) => {
		await client.query(`UPDATE segmentation_jobs SET status = 'failed' WHERE id = $1`, [jobId]);

		const jobResult = await client.query(`SELECT election_id FROM segmentation_jobs WHERE id = $1`, [jobId]);

		const electionId = jobResult.rows[0]?.election_id;
		if (electionId) {
			await insertException(client, String(electionId), jobId, errorId, error);
		}
	});
}
