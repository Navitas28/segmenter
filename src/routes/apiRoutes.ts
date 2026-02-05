import express from 'express';
import {z} from 'zod';
import {pool} from '../db/transaction.js';
import {familyRoutes} from '../family/familyController.js';

export const apiRoutes = express.Router();

// Mount family routes
apiRoutes.use(familyRoutes);

const electionQuerySchema = z.object({
	election_id: z.string().uuid(),
});

const segmentsQuerySchema = z.object({
	node_id: z.string().uuid(),
	version: z.string().optional(),
});

const nodeQuerySchema = z.object({
	node_id: z.string().uuid(),
});

apiRoutes.get('/elections', async (_req, res) => {
	try {
		const result = await pool.query(
			`select id, name, election_type, election_date, state, status, created_at
       from elections
       order by created_at desc`,
		);
		return res.json(result.rows);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/hierarchy/ac', async (req, res) => {
	const parsed = electionQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	try {
		const result = await pool.query(
			`
      select n.id, n.name, n.code, n.metadata, n.created_at, n.updated_at
      from hierarchy_nodes n
      join hierarchy_levels l on l.id = n.level_id
      where n.election_id = $1
        and (l.name ilike 'ac%' or l.name = 'AC' or l.name ilike 'assembly%')
      order by n.code asc nulls last, n.name asc
      `,
			[parsed.data.election_id],
		);
		return res.json(result.rows);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/booths', async (req, res) => {
	const parsed = electionQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	const nodeId = typeof req.query.node_id === 'string' ? req.query.node_id : null;

	try {
		const result = await pool.query(
			`
      select id, booth_name, booth_number, node_id, latitude, longitude, metadata, created_at, updated_at
      from booths
      where election_id = $1
        and ($2::uuid is null or node_id = $2::uuid)
      order by booth_number asc
      `,
			[parsed.data.election_id, nodeId],
		);
		return res.json(result.rows);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/segments', async (req, res) => {
	const parsed = segmentsQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	const version = parsed.data.version ? Number(parsed.data.version) : null;

	try {
		const segmentsResult = await pool.query(
			`
      select
        s.id,
        s.segment_name,
        s.total_voters,
        s.total_families,
        s.status,
        s.color,
        s.centroid_lat,
        s.centroid_lng,
        s.created_at,
        s.metadata,
        ST_AsGeoJSON(s.boundary) as boundary_geojson,
        ST_AsGeoJSON(s.centroid) as centroid_geojson,
        ST_AsGeoJSON(s.geometry) as geometry
      from segments s
      where s.node_id = $1
        and ($2::int is null or (s.metadata->>'version')::int = $2::int)
      order by s.segment_name asc
      `,
			[parsed.data.node_id, Number.isNaN(version) ? null : version],
		);

		const segmentIds = segmentsResult.rows.map((row) => row.id);

		let membersBySegment: Record<string, unknown[]> = {};
		if (segmentIds.length > 0) {
			const membersResult = await pool.query(
				`
        select sm.segment_id,
               sm.voter_id,
               sm.family_id,
               coalesce(v.latitude, ST_Y(v.location)) as latitude,
               coalesce(v.longitude, ST_X(v.location)) as longitude
        from segment_members sm
        left join voters v on v.id = sm.voter_id
        where sm.segment_id = any($1::uuid[])
        `,
				[segmentIds],
			);
			membersBySegment = membersResult.rows.reduce<Record<string, unknown[]>>((acc, row) => {
				const segmentId = String(row.segment_id);
				if (!acc[segmentId]) acc[segmentId] = [];
				acc[segmentId].push({
					voter_id: row.voter_id,
					family_id: row.family_id,
					latitude: row.latitude,
					longitude: row.longitude,
				});
				return acc;
			}, {});
		}

		const segments = segmentsResult.rows.map((row) => ({
			id: row.id,
			segment_name: row.segment_name,
			total_voters: Number(row.total_voters),
			total_families: Number(row.total_families),
			status: row.status,
			color: row.color,
			centroid_lat: row.centroid_lat ? Number(row.centroid_lat) : null,
			centroid_lng: row.centroid_lng ? Number(row.centroid_lng) : null,
			created_at: row.created_at,
			metadata: row.metadata ?? {},
			boundary_geojson: row.boundary_geojson ? JSON.parse(row.boundary_geojson) : null,
			centroid_geojson: row.centroid_geojson ? JSON.parse(row.centroid_geojson) : null,
			geometry: row.geometry ? JSON.parse(row.geometry) : null,
			members: membersBySegment[String(row.id)] ?? [],
		}));

		const jobResult = await pool.query(
			`
      select id, result, version, completed_at
      from segmentation_jobs
      where node_id = $1
        and status = 'completed'
      order by completed_at desc nulls last
      limit 1
      `,
			[parsed.data.node_id],
		);

		const jobRow = jobResult.rows[0];
		const runHash = jobRow?.result?.run_hash ?? null;
		const performance = jobRow?.result
			? {
					algorithm_time: jobRow.result.algorithm_ms ?? null,
					db_write_time: jobRow.result.db_write_ms ?? null,
					total_time: jobRow.result.total_ms ?? null,
			  }
			: null;

		return res.json({
			segments,
			version: jobRow?.version ?? null,
			run_hash: runHash,
			performance,
		});
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/audit', async (req, res) => {
	const parsed = nodeQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	try {
		const result = await pool.query(
			`
      select id, entity_id as segment_id, created_at, new_data
      from audit_movements
      where new_data->>'node_id' = $1
      order by created_at desc
      limit 200
      `,
			[parsed.data.node_id],
		);
		const rows = result.rows.map((row) => ({
			id: row.id,
			segment_id: row.segment_id,
			created_at: row.created_at,
			metadata: row.new_data ?? {},
		}));
		return res.json(rows);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/exceptions', async (req, res) => {
	const parsed = nodeQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	try {
		const result = await pool.query(
			`
      select e.id, e.exception_type, e.metadata, e.created_at
      from exceptions e
      where e.metadata->>'job_id' in (
        select id::text from segmentation_jobs where node_id = $1
      )
      order by e.created_at desc
      limit 200
      `,
			[parsed.data.node_id],
		);
		return res.json(result.rows);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});
