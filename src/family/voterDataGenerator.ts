import {logger} from '../config/logger.js';
import {withTransaction, DbClient} from '../db/transaction.js';

export interface VoterDataGenerationResult {
	voters_updated: number;
	booths_processed: number;
}

/**
 * Generate random latitude, longitude, and floor_number for voters
 * based on their booth location.
 */
export async function generateVoterData(electionId: string): Promise<VoterDataGenerationResult> {
	logger.info({electionId}, 'Starting voter data generation');

	const startTime = Date.now();

	const result = await withTransaction(async (client) => {
		// Get all booths for this election with their coordinates
		const boothsResult = await client.query(
			`
			SELECT b.id, b.latitude, b.longitude, COUNT(v.id) as voter_count
			FROM booths b
			LEFT JOIN voters v ON v.booth_id = b.id AND v.election_id = $1
			WHERE b.election_id = $1
			GROUP BY b.id, b.latitude, b.longitude
			`,
			[electionId],
		);

		const booths = boothsResult.rows;
		logger.info({electionId, boothCount: booths.length}, 'Found booths to process');

		if (booths.length === 0) {
			logger.warn({electionId}, 'No booths found for election');
			return {voters_updated: 0, booths_processed: 0};
		}

		let totalVotersUpdated = 0;

		// Process each booth
		for (const booth of booths) {
			const boothId = booth.id;
			const boothLat = Number(booth.latitude);
			const boothLng = Number(booth.longitude);
			const voterCount = Number(booth.voter_count);

			if (!boothLat || !boothLng || voterCount === 0) {
				logger.debug({boothId, boothLat, boothLng, voterCount}, 'Skipping booth (no coordinates or voters)');
				continue;
			}

			logger.debug({boothId, voterCount}, `Processing booth with ${voterCount} voters`);

			// Update voters for this booth with random coordinates and floor numbers
			// Using SQL random functions for performance
			const updateResult = await client.query(
				`
				UPDATE voters
				SET
					latitude = $2 + (random() * 2 * $4 - $4),
					longitude = $3 + (random() * 2 * $4 - $4) * (1 / cos(radians($2))),
					floor_number = CASE
						WHEN random() < 0.50 THEN 0
						WHEN random() < 0.75 THEN 1  -- 25% (0.50-0.75)
						WHEN random() < 0.95 THEN 2  -- 20% (0.75-0.95)
						ELSE 3                        -- 5% (0.95-1.00)
					END
				WHERE election_id = $1
					AND booth_id = $5
				`,
				[
					electionId,
					boothLat,
					boothLng,
					0.018, // ~2km in degrees (1 degree ≈ 111km)
					boothId,
				],
			);

			const votersUpdated = updateResult.rowCount ?? 0;
			totalVotersUpdated += votersUpdated;

			logger.debug({boothId, votersUpdated}, 'Updated voters for booth');
		}

		logger.info({electionId, totalVotersUpdated, boothsProcessed: booths.length}, 'Voter data generation completed');

		return {
			voters_updated: totalVotersUpdated,
			booths_processed: booths.length,
		};
	});

	const durationMs = Date.now() - startTime;
	logger.info(
		{
			electionId,
			result,
			durationMs,
		},
		'Voter data generation completed',
	);

	return result;
}
