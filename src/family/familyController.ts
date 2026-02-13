import express from 'express';
import {z} from 'zod';
import {logger} from '../config/logger.js';
import {generateFamilies} from './familyService.js';
import {generateVoterData} from './voterDataGenerator.js';

export const familyRoutes = express.Router();

const electionIdSchema = z.object({
	election_id: z.string().uuid(),
	booth_id: z.string().uuid().optional(),
});

/**
 * POST /generate-voter-data
 * Generate random latitude, longitude, and floor_number for voters
 */
familyRoutes.post('/generate-voter-data', async (req, res) => {
	const parsed = electionIdSchema.safeParse(req.body);

	if (!parsed.success) {
		return res.status(400).json({
			error: 'Invalid request',
			details: parsed.error.flatten(),
		});
	}

	const {election_id} = parsed.data;

	try {
		logger.info({election_id}, 'Received voter data generation request');

		const result = await generateVoterData(election_id);

		return res.status(200).json({
			success: true,
			...result,
		});
	} catch (error) {
		logger.error({error, election_id}, 'Voter data generation failed');

		return res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
});

/**
 * POST /generate-family
 * Generate families deterministically for a given election.
 * Optional booth_id: when provided, only voters in that booth are processed (e.g. when a new booth is added).
 */
familyRoutes.post('/generate-family', async (req, res) => {
	const parsed = electionIdSchema.safeParse(req.body);

	if (!parsed.success) {
		return res.status(400).json({
			error: 'Invalid request',
			details: parsed.error.flatten(),
		});
	}

	const {election_id, booth_id} = parsed.data;

	try {
		logger.info({election_id, booth_id}, 'Received family generation request');

		const result = await generateFamilies(election_id, booth_id ?? undefined);

		return res.status(200).json({
			success: true,
			...result,
		});
	} catch (error) {
		logger.error({error, election_id}, 'Family generation failed');

		return res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
});
