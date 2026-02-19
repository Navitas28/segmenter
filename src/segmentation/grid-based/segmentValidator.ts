import {DbClient} from '../../db/transaction.js';
import {logger} from '../../config/logger.js';
import {Segment} from './segmentBuilder.js';

/**
 * Validate segments before committing to database.
 *
 * Validation checks:
 * 1. No empty segments
 * 2. Voter count matches expected total
 * 3. No duplicate voter assignments
 * 4. Segment size warnings (oversized/undersized)
 *
 * Throws error on hard validation failure to trigger rollback.
 */
export async function validateSegments(client: DbClient, segments: Segment[], expectedVoterCount: number): Promise<void> {
	logger.info({segmentCount: segments.length}, 'Validating segments');

	const emptySegments = segments.filter((s) => s.total_voters === 0);
	if (emptySegments.length > 0) {
		logger.error({count: emptySegments.length}, 'Found empty segments');
		throw new Error('VALIDATION_FAILED: Empty segments exist');
	}

	const totalAssigned = segments.reduce((sum, s) => sum + s.total_voters, 0);
	if (totalAssigned !== expectedVoterCount) {
		logger.error({expected: expectedVoterCount, assigned: totalAssigned}, 'Voter count mismatch');
		throw new Error(`VALIDATION_FAILED: Expected ${expectedVoterCount} voters, assigned ${totalAssigned}`);
	}

	const seenVoters = new Set<string>();
	const duplicates: string[] = [];

	for (const segment of segments) {
		for (const voterId of segment.voter_ids) {
			if (seenVoters.has(voterId)) {
				duplicates.push(voterId);
			}
			seenVoters.add(voterId);
		}
	}

	if (duplicates.length > 0) {
		logger.error({duplicateCount: duplicates.length}, 'Found duplicate voters');
		throw new Error(`VALIDATION_FAILED: ${duplicates.length} voters assigned to multiple segments`);
	}

	const oversized = segments.filter((s) => s.total_voters > 135);
	const undersized = segments.filter((s) => s.total_voters < 90);

	if (oversized.length > 0) {
		logger.warn(
			{
				count: oversized.length,
				max: Math.max(...oversized.map((s) => s.total_voters)),
				oversizedSegments: oversized.map((s) => ({code: s.code, voters: s.total_voters, families: s.total_families})),
			},
			'Found oversized segments - marking as exceptions for manual review (families cannot be split)',
		);
	}

	if (undersized.length > 0) {
		logger.warn({count: undersized.length, min: Math.min(...undersized.map((s) => s.total_voters))}, 'Found undersized segments (below 90)');
	}

	logger.info('Skipping geometry overlap validation (temporarily disabled for performance)');

	logger.info('All segment validations passed');
}

/**
 * Validate that all voters in database are assigned to exactly one segment.
 */
export async function validateVoterAssignments(client: DbClient, electionId: string): Promise<void> {
	logger.info({electionId}, 'Validating voter assignments in database');

	const unassignedResult = await client.query<{count: number}>(
		`
		SELECT COUNT(*)::int as count
		FROM voters v
		LEFT JOIN segment_members sm ON v.id = sm.voter_id
		WHERE v.election_id = $1
		  AND v.location IS NOT NULL
		  AND sm.voter_id IS NULL
		`,
		[electionId],
	);

	const unassignedCount = unassignedResult.rows[0]?.count || 0;

	if (unassignedCount > 0) {
		logger.error({unassignedCount}, 'Found unassigned voters');
		throw new Error(`VALIDATION_FAILED: ${unassignedCount} voters not assigned to any segment`);
	}

	logger.info('Voter assignment validation passed');
}
