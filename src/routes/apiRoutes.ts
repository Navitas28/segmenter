import express from 'express';
import {z} from 'zod';
import {pool} from '../db/transaction.js';
import {familyRoutes} from '../family/familyController.js';
import {generateSegmentationPdfHtml, convertHtmlToPdf} from '../services/pdfExporter.js';

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

const updateSegmentSchema = z.object({
	display_name: z.string().optional(),
	description: z.string().optional(),
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

const hierarchyChildrenQuerySchema = z.object({
	election_id: z.string().uuid(),
	parent_id: z.string().uuid(),
});

// Booth-level hierarchy nodes under an assembly (parent_id = assembly node id). Fetched from hierarchy_nodes, not booths table.
apiRoutes.get('/hierarchy/booth-nodes', async (req, res) => {
	const parsed = hierarchyChildrenQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	try {
		// Find booth-level hierarchy_levels for this election (name contains booth/polling)
		const levelResult = await pool.query(
			`
      select id from hierarchy_levels
      where election_id = $1
        and (name ilike '%booth%' or name ilike '%polling%')
      limit 1
      `,
			[parsed.data.election_id],
		);
		const boothLevelId = levelResult.rows[0]?.id;
		if (!boothLevelId) {
			return res.json([]);
		}

		const result = await pool.query(
			`
      select n.id, n.name, n.code, n.metadata, n.created_at, n.updated_at
      from hierarchy_nodes n
      where n.parent_id = $1
        and n.level_id = $2
      order by n.code asc nulls last, n.name asc
      `,
			[parsed.data.parent_id, boothLevelId],
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
        s.display_name,
        s.description,
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
        ST_AsGeoJSON(s.geometry) as geometry,
        ST_Area(s.geometry::geography) as area_sq_m,
        ST_XMin(ST_Envelope(s.geometry)) as bbox_min_lng,
        ST_YMin(ST_Envelope(s.geometry)) as bbox_min_lat,
        ST_XMax(ST_Envelope(s.geometry)) as bbox_max_lng,
        ST_YMax(ST_Envelope(s.geometry)) as bbox_max_lat
      from segments s
      where s.node_id = $1
        and ($2::int is null
          or (s.metadata->>'version')::int = $2::int
          or (s.metadata->>'version_number')::int = $2::int)
      order by s.segment_name asc
      `,
			[parsed.data.node_id, Number.isNaN(version) ? null : version],
		);

		const segmentIds = segmentsResult.rows.map((row) => row.id);

		// One row per voter: always fetch segment members (join on family_id), then enrich from voters table
		let membersBySegment: Record<string, unknown[]> = {};
		if (segmentIds.length > 0) {
			const membersResult = await pool.query(
				`
        select sm.segment_id,
               v.id as voter_id,
               sm.family_id,
               coalesce(v.latitude, ST_Y(v.location)) as latitude,
               coalesce(v.longitude, ST_X(v.location)) as longitude
        from segment_members sm
        join voters v on v.family_id = sm.family_id
        where sm.segment_id = any($1::uuid[])
        order by sm.segment_id, v.id
        `,
				[segmentIds],
			);
			const allVoterIds = [...new Set(membersResult.rows.map((r: {voter_id: string}) => String(r.voter_id)))];
			let voterDetailsMap: Record<string, Record<string, unknown>> = {};
			if (allVoterIds.length > 0) {
				const tryDetailsQuery = async (sql: string): Promise<boolean> => {
					try {
						const detailsResult = await pool.query(sql, [allVoterIds]);
						for (const row of detailsResult.rows as Array<Record<string, unknown>>) {
							const id = String(row.id);
							voterDetailsMap[id] = {
								full_name: row.full_name ?? row.name ?? null,
								relation_type: row.relation_type ?? null,
								relation_name: row.relation_name ?? null,
								age: row.age != null ? Number(row.age) : null,
								epic_number: row.epic_number ?? row.epic ?? null,
								is_verified: Boolean(row.is_verified ?? row.verified ?? false),
								serial_number: row.serial_number ?? null,
								gender: row.gender ?? null,
							};
						}
						return true;
					} catch {
						return false;
					}
				};
				const ok = await tryDetailsQuery(
					`
            select id, full_name, relation_type, relation_name, age, epic_number, is_verified, serial_number, gender
            from voters where id = any($1::uuid[])
            `,
				);
				if (!ok) {
					await tryDetailsQuery(
						`
            select id,
                   name as full_name,
                   relation_type,
                   relation_name,
                   age,
                   epic_number,
                   is_verified,
                   serial_number,
                   gender
            from voters where id = any($1::uuid[])
            `,
					);
				}
			}
			membersBySegment = membersResult.rows.reduce<Record<string, unknown[]>>((acc, row) => {
				const segmentId = String(row.segment_id);
				if (!acc[segmentId]) acc[segmentId] = [];
				const voterId = String(row.voter_id);
				const details = voterDetailsMap[voterId] ?? {};
				acc[segmentId].push({
					voter_id: row.voter_id,
					family_id: row.family_id,
					latitude: row.latitude,
					longitude: row.longitude,
					...details,
				});
				return acc;
			}, {});
		}

		const segments = segmentsResult.rows.map((row) => ({
			id: row.id,
			segment_name: row.segment_name,
			display_name: row.display_name ?? row.segment_name,
			description: row.description ?? null,
			total_voters: Number(row.total_voters),
			total_families: Number(row.total_families),
			status: row.status,
			color: row.color,
			centroid_lat: row.centroid_lat != null ? Number(row.centroid_lat) : null,
			centroid_lng: row.centroid_lng != null ? Number(row.centroid_lng) : null,
			created_at: row.created_at,
			metadata: row.metadata ?? {},
			boundary_geojson: row.boundary_geojson ? JSON.parse(row.boundary_geojson) : null,
			centroid_geojson: row.centroid_geojson ? JSON.parse(row.centroid_geojson) : null,
			geometry: row.geometry ? JSON.parse(row.geometry) : null,
			area_sq_m: row.area_sq_m != null ? Number(row.area_sq_m) : null,
			bbox_min_lat: row.bbox_min_lat != null ? Number(row.bbox_min_lat) : null,
			bbox_min_lng: row.bbox_min_lng != null ? Number(row.bbox_min_lng) : null,
			bbox_max_lat: row.bbox_max_lat != null ? Number(row.bbox_max_lat) : null,
			bbox_max_lng: row.bbox_max_lng != null ? Number(row.bbox_max_lng) : null,
			members: membersBySegment[String(row.id)] ?? [],
		}));

		const jobResult = await pool.query(
			version != null
				? `
      select id, result, version, completed_at
      from segmentation_jobs
      where node_id = $1 and version = $2 and status = 'completed'
      limit 1
      `
				: `
      select id, result, version, completed_at
      from segmentation_jobs
      where node_id = $1 and status = 'completed'
      order by completed_at desc nulls last
      limit 1
      `,
			version != null ? [parsed.data.node_id, version] : [parsed.data.node_id],
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
			job_id: jobRow?.id ?? null,
			run_hash: runHash,
			performance,
		});
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

/** Backfill boundary from geometry for segments that have null boundary. One-time fix for segments created before boundary was populated. */
apiRoutes.post('/segments/backfill-boundaries', async (req, res) => {
	const parsed = nodeQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}
	try {
		const result = await pool.query(
			`
      WITH updated AS (
        UPDATE segments s
        SET boundary = ST_Multi((
          SELECT dump.geom
          FROM ST_Dump(s.geometry) AS dump
          ORDER BY ST_Area(dump.geom::geography) DESC
          LIMIT 1
        ))
        WHERE s.node_id = $1 AND s.boundary IS NULL AND s.geometry IS NOT NULL
        RETURNING id
      )
      SELECT count(*)::int as updated_count FROM updated
      `,
			[parsed.data.node_id],
		);
		const updatedCount = result.rows[0]?.updated_count ?? 0;
		return res.json({updated_count: updatedCount, message: `Backfilled boundary for ${updatedCount} segments`});
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

/** List available segment versions for a node (from completed jobs). Used for version dropdown. */
apiRoutes.get('/segments/versions', async (req, res) => {
	const parsed = nodeQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	try {
		const result = await pool.query(
			`
      select distinct version
      from segmentation_jobs
      where node_id = $1 and status = 'completed' and version is not null
      order by version desc
      `,
			[parsed.data.node_id],
		);
		const versions = result.rows.map((r) => Number(r.version)).filter((n) => !Number.isNaN(n));
		return res.json({versions});
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

apiRoutes.patch('/segments/:segmentId', async (req, res) => {
	const {segmentId} = req.params;
	const parsed = updateSegmentSchema.safeParse(req.body);

	if (!parsed.success) {
		return res.status(400).json({error: parsed.error.flatten()});
	}

	const {display_name, description} = parsed.data;

	const updateFields: string[] = [];
	const values: unknown[] = [];
	let paramCount = 1;

	if (display_name !== undefined) {
		updateFields.push(`display_name = $${paramCount++}`);
		values.push(display_name);
	}
	if (description !== undefined) {
		updateFields.push(`description = $${paramCount++}`);
		values.push(description);
	}

	if (updateFields.length === 0) {
		return res.status(400).json({error: 'No fields to update'});
	}

	updateFields.push(`updated_at = NOW()`);
	values.push(segmentId);

	try {
		const result = await pool.query(
			`
			UPDATE segments
			SET ${updateFields.join(', ')}
			WHERE id = $${paramCount}
			RETURNING id, segment_name, display_name, description, total_voters, total_families, updated_at
			`,
			values,
		);

		if (result.rows.length === 0) {
			return res.status(404).json({error: 'Segment not found'});
		}

		return res.json(result.rows[0]);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});

apiRoutes.get('/segments/export/pdf', async (req, res) => {
	const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : '';

	if (!versionId) {
		return res.status(400).json({error: 'versionId query parameter required'});
	}

	try {
		const html = await generateSegmentationPdfHtml(pool, versionId);
		const pdfBuffer = await convertHtmlToPdf(html);

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename="segmentation-${versionId}.pdf"`);
		res.send(pdfBuffer);
	} catch (error) {
		return res.status(500).json({error: error instanceof Error ? error.message : 'Unknown error'});
	}
});
