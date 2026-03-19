import type {Pool} from 'pg';
import type {Browser} from 'puppeteer';
import {normalizeBoothDistanceMetadata} from '../segmentation/boothDistance.js';

interface SegmentData {
	id: string;
	segment_name: string;
	display_name: string | null;
	description: string | null;
	total_voters: number;
	total_families: number;
	centroid_lat: number | null;
	centroid_lng: number | null;
	area_sq_m: number | null;
	bbox_min_lat: number | null;
	bbox_min_lng: number | null;
	bbox_max_lat: number | null;
	bbox_max_lng: number | null;
	metadata: Record<string, unknown>;
	boundary_geojson: string | null;
	geometry_geojson: string | null;
	far_voter_count?: number;
	missing_booth_location_voter_count?: number;
	member_location_missing_voter_count?: number;
}

interface VoterData {
	segment_id: string;
	voter_id: string;
	family_id: string;
	full_name: string | null;
	epic_number: string | null;
	age: number | null;
	gender: string | null;
	relation_type: string | null;
	relation_name: string | null;
	booth_id: string | null;
	booth_name: string | null;
	booth_number: string | number | null;
	latitude: number | null;
	longitude: number | null;
	distance_from_booth_m: number | null;
	geodesic_distance_from_booth_m: number | null;
	road_distance_from_booth_m: number | null;
	distance_calculation_type: 'geodesic' | 'road';
	is_far_from_booth: boolean;
	booth_location_status: 'available' | 'missing' | 'member_location_missing';
}

interface ExceptionData {
	id: string;
	exception_type: string;
	severity: string;
	description: string | null;
	suggested_action: string | null;
	status: string;
	created_at: string;
	metadata: Record<string, unknown>;
}

interface BoothData {
	id: string;
	booth_name: string | null;
	booth_number: string | number | null;
	latitude: number | null;
	longitude: number | null;
}

interface AuditData {
	id: string;
	segment_id: string;
	created_at: string;
	metadata: Record<string, unknown>;
}

interface JobData {
	id: string;
	version_name: string | null;
	version_description: string | null;
	version: number;
	result: {
		run_hash?: string;
		algorithm_ms?: number;
		db_write_ms?: number;
		validation_ms?: number;
		total_ms?: number;
		integrity_checks?: {
			all_families_assigned?: boolean;
			no_overlaps?: boolean;
			geometry_valid?: boolean;
			no_empty_polygons?: boolean;
		};
	} | null;
	created_at: string;
	created_by: string | null;
	election_id: string;
	node_id: string;
}

interface ElectionData {
	name: string;
}

interface NodeData {
	name: string;
	code: string | null;
}

export const generateSegmentationPdfHtml = async (
	pool: Pool,
	versionId: string,
	options?: {showBoothMarker?: boolean},
): Promise<string> => {
	const showBoothMarker = options?.showBoothMarker !== false; // default true
	const boothLocationUnavailableMessage = 'Booth location not available. Add booth location to get the details.';
	const boothPinSvg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
			<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#E53935"/>
			<circle cx="12" cy="9" r="3" fill="#f8f8f8"/>
		</svg>
	`.trim();
	// Fetch job data
	const jobResult = await pool.query<JobData>(
		`
		SELECT id, version_name, version_description, version, result,
		       created_at, created_by, election_id, node_id
		FROM segmentation_jobs
		WHERE id = $1
		`,
		[versionId],
	);

	if (jobResult.rows.length === 0) {
		throw new Error('Job not found');
	}

	const job = jobResult.rows[0];

	// Fetch election data
	const electionResult = await pool.query<ElectionData>('SELECT name FROM elections WHERE id = $1', [job.election_id]);
	const election = electionResult.rows[0];

	// Fetch node data
	const nodeResult = await pool.query<NodeData>('SELECT name, code FROM hierarchy_nodes WHERE id = $1', [job.node_id]);
	const node = nodeResult.rows[0];

	// Fetch booth data for this node (booth location marker)
	const boothResult = await pool.query<BoothData>(
		'SELECT id, booth_name, booth_number, latitude::float8, longitude::float8 FROM booths WHERE node_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL',
		[job.node_id],
	);
	const booths: BoothData[] = boothResult.rows;

	// Fetch segments with geometry
	const segmentsResult = await pool.query<SegmentData>(
		`
		SELECT id, segment_name, display_name, description,
		       total_voters, total_families,
		       centroid_lat::float8 as centroid_lat,
		       centroid_lng::float8 as centroid_lng,
		       ST_Area(geometry::geography) as area_sq_m,
		       ST_YMin(ST_Envelope(geometry)) as bbox_min_lat,
		       ST_XMin(ST_Envelope(geometry)) as bbox_min_lng,
		       ST_YMax(ST_Envelope(geometry)) as bbox_max_lat,
		       ST_XMax(ST_Envelope(geometry)) as bbox_max_lng,
		       metadata,
		       ST_AsGeoJSON(boundary) as boundary_geojson,
		       ST_AsGeoJSON(geometry) as geometry_geojson
		FROM segments
		WHERE (
			-- Primary: segments are associated to job via node_id + version
			(node_id = $2 AND ($3::int is null OR (metadata->>'version')::int = $3::int OR (metadata->>'version_number')::int = $3::int))
			-- Fallback: some pipelines may stamp job_id directly into metadata
			OR metadata->>'job_id' = $1
		)
		ORDER BY segment_name ASC
		`,
		[versionId, job.node_id, Number.isFinite(job.version) ? job.version : null],
	);

	const segments = segmentsResult.rows;
	const boothDistanceBySegment = new Map(
		segments.map((segment) => [segment.id, normalizeBoothDistanceMetadata(segment.metadata?.booth_distance)]),
	);

	// Fetch voters for all segments
	const segmentIds = segments.map((s) => s.id);
	let votersBySegment: Record<string, VoterData[]> = {};
	if (segmentIds.length > 0) {
		const votersResult = await pool.query<VoterData>(
			`
			SELECT sm.segment_id,
			       v.id as voter_id,
			       sm.family_id,
			       v.full_name as full_name,
			       v.epic_number as epic_number,
			       v.age,
			       v.gender,
			       NULL::text as relation_type,
			       NULL::text as relation_name,
			       v.booth_id::text as booth_id,
			       b.booth_name,
			       b.booth_number,
			       COALESCE(v.latitude, ST_Y(v.location)) as latitude,
			       COALESCE(v.longitude, ST_X(v.location)) as longitude
			FROM segment_members sm
			JOIN voters v ON v.family_id = sm.family_id
			LEFT JOIN booths b ON b.id = v.booth_id
			WHERE sm.segment_id = ANY($1::uuid[])
			ORDER BY sm.segment_id, v.id
			`,
			[segmentIds],
		);

		votersBySegment = votersResult.rows.reduce<Record<string, VoterData[]>>((acc, row) => {
			const segmentId = String(row.segment_id);
			if (!acc[segmentId]) acc[segmentId] = [];
			const boothDistance = boothDistanceBySegment.get(segmentId);
			const farVoter = boothDistance?.far_voters.find((item) => item.voter_id === String(row.voter_id)) ?? null;
			const isMissingBoothLocation = boothDistance?.missing_booth_location_voter_ids.includes(String(row.voter_id)) ?? false;
			const isMemberLocationMissing = boothDistance?.member_location_missing_voter_ids.includes(String(row.voter_id)) ?? false;
			acc[segmentId].push({
				segment_id: segmentId,
				voter_id: String(row.voter_id),
				family_id: String(row.family_id),
				full_name: row.full_name ?? null,
				epic_number: row.epic_number ?? null,
				age: row.age != null ? Number(row.age) : null,
				gender: row.gender ?? null,
				relation_type: row.relation_type ?? null,
				relation_name: row.relation_name ?? null,
				booth_id: row.booth_id != null ? String(row.booth_id) : null,
				booth_name: row.booth_name ?? null,
				booth_number: row.booth_number ?? null,
				latitude: row.latitude != null ? Number(row.latitude) : null,
				longitude: row.longitude != null ? Number(row.longitude) : null,
				distance_from_booth_m: farVoter?.distance_meters ?? null,
				geodesic_distance_from_booth_m: farVoter?.geodesic_distance_meters ?? null,
				road_distance_from_booth_m: farVoter?.road_distance_meters ?? null,
				distance_calculation_type: farVoter?.distance_calculation_type ?? boothDistance?.distance_calculation_type ?? 'geodesic',
				is_far_from_booth: Boolean(farVoter),
				booth_location_status: isMissingBoothLocation
					? 'missing'
					: isMemberLocationMissing
						? 'member_location_missing'
						: 'available',
			});
			return acc;
		}, {});
	}

	// Fetch exceptions
	const exceptionsResult = await pool.query<ExceptionData>(
		`
		SELECT id, exception_type, severity, description, suggested_action, status, created_at, metadata
		FROM exceptions
		WHERE metadata->>'job_id' = $1
		ORDER BY 
			CASE severity
				WHEN 'critical' THEN 1
				WHEN 'high' THEN 2
				WHEN 'medium' THEN 3
				WHEN 'low' THEN 4
			END,
			created_at DESC
		LIMIT 100
		`,
		[versionId],
	);
	const exceptions = exceptionsResult.rows;

	// Fetch audit logs
	const auditResult = await pool.query<AuditData>(
		`
		SELECT am.id,
		       am.entity_id as segment_id,
		       am.created_at,
		       am.new_data as metadata
		FROM audit_movements am
		JOIN audit_batches ab ON ab.id = am.batch_id
		WHERE ab.batch_type = 'segmentation'
		  AND ab.election_id = $1
		  AND ab.description ILIKE '%' || $2 || '%'
		ORDER BY am.created_at DESC
		LIMIT 200
		`,
		[job.election_id, versionId],
	);
	const auditLogs = auditResult.rows;

	// Calculate statistics
	const totalVoters = segments.reduce((sum, s) => sum + s.total_voters, 0);
	const totalFamilies = segments.reduce((sum, s) => sum + s.total_families, 0);
	const totalFarVoters = segments.reduce(
		(sum, segment) => sum + normalizeBoothDistanceMetadata(segment.metadata?.booth_distance).far_voter_count,
		0,
	);
	const totalMissingBoothLocationVoters = segments.reduce(
		(sum, segment) => sum + normalizeBoothDistanceMetadata(segment.metadata?.booth_distance).missing_booth_location_voter_count,
		0,
	);
	const segmentsWithFarVoters = segments.filter(
		(segment) => normalizeBoothDistanceMetadata(segment.metadata?.booth_distance).far_voter_count > 0,
	).length;
	const avgVoters = segments.length > 0 ? Math.round(totalVoters / segments.length) : 0;
	const voterCounts = segments.map((s) => s.total_voters);
	const minVoters = voterCounts.length > 0 ? Math.min(...voterCounts) : 0;
	const maxVoters = voterCounts.length > 0 ? Math.max(...voterCounts) : 0;
	const oversizedSegments = segments.filter((s) => s.total_voters > 135).length;
	const undersizedSegments = segments.filter((s) => s.total_voters < 90).length;

	// Area statistics (in sq km) for context
	const areasSqKm = segments
		.map((s) => (typeof s.area_sq_m === 'number' ? s.area_sq_m / 1_000_000 : null))
		.filter((v): v is number => v != null && Number.isFinite(v));
	const avgAreaSqKm = areasSqKm.length > 0 ? areasSqKm.reduce((sum, v) => sum + v, 0) / areasSqKm.length : null;

	// Generate suggestions
	const suggestions: string[] = [];
	if (oversizedSegments > 0) {
		suggestions.push(`${oversizedSegments} segment(s) exceed the recommended size of 135 voters. Consider splitting these segments for better manageability.`);
	}
	if (undersizedSegments > 0) {
		suggestions.push(`${undersizedSegments} segment(s) are below the minimum recommended size of 90 voters. Consider merging with adjacent segments.`);
	}
	if (segments.length > 0) {
		const sizeVariance = Math.max(...voterCounts) - Math.min(...voterCounts);
		if (sizeVariance > 50) {
			suggestions.push(`Significant size variance detected (${sizeVariance} voters). Consider redistributing voters for more balanced segments.`);
		}
	}
	if (exceptions.length > 0) {
		const criticalExceptions = exceptions.filter((e) => e.severity === 'critical').length;
		if (criticalExceptions > 0) {
			suggestions.push(`${criticalExceptions} critical exception(s) require immediate attention. Review and resolve before finalizing segmentation.`);
		}
	}
	if (suggestions.length === 0) {
		suggestions.push('Segmentation meets all quality standards. No immediate action required.');
	}

	// Try to generate a real map image using Google Maps + Puppeteer; fall back to centroid sketch if unavailable.
	let mapVisualHtml: string;
	const mapImageDataUrl = await renderSegmentsMapImage(segments, booths, votersBySegment, showBoothMarker).catch(() => null);

	if (mapImageDataUrl) {
		mapVisualHtml = `
			<div class="map-image-wrapper">
				<img src="${mapImageDataUrl}" alt="Segment map" class="map-image" />
			</div>
			<p class="map-info">
				Map view of segment boundaries rendered from GeoJSON geometry (not interactive in PDF).
			</p>
		`;
	} else {
		// Build simple centroid-based "mini map" sketch using latitude/longitude
		const centroidSegments = segments.filter((s) => s.centroid_lat != null && s.centroid_lng != null);
		if (centroidSegments.length === 0) {
			mapVisualHtml =
				'<p style="font-size: 10px; color: #64748b; margin-top: 12px;">Centroid coordinates are not available for this segmentation.</p>';
		} else {
			const allLats = centroidSegments.map((s) => s.centroid_lat as number);
			const allLngs = centroidSegments.map((s) => s.centroid_lng as number);

			// Extend bounds to include booth locations if marker enabled
			const boothsWithCoords = showBoothMarker ? booths.filter((b) => b.latitude != null && b.longitude != null) : [];
			if (boothsWithCoords.length > 0) {
				boothsWithCoords.forEach((b) => {
					allLats.push(b.latitude as number);
					allLngs.push(b.longitude as number);
				});
			}

			const minLat = Math.min(...allLats);
			const maxLat = Math.max(...allLats);
			const minLng = Math.min(...allLngs);
			const maxLng = Math.max(...allLngs);
			const latSpan = Math.max(maxLat - minLat, 0.000001);
			const lngSpan = Math.max(maxLng - minLng, 0.000001);
			const labeledCount = Math.min(12, centroidSegments.length);

			const dots = centroidSegments
				.map((s, index) => {
					const lat = s.centroid_lat as number;
					const lng = s.centroid_lng as number;
					const xPct = ((lng - minLng) / lngSpan) * 100;
					const yPct = ((maxLat - lat) / latSpan) * 100;
					const hasLabel = index < labeledCount;
					return `
						<div class="map-sketch-dot" style="left: ${xPct.toFixed(2)}%; top: ${yPct.toFixed(2)}%;"></div>
						${
							hasLabel
								? `<div class="map-sketch-dot-label" style="left: ${xPct.toFixed(2)}%; top: ${yPct.toFixed(
										2,
									)}%;"><span>${s.segment_name}</span></div>`
								: ''
						}
					`;
				})
				.join('');
			const segmentColorIndex = new Map(segments.map((segment, index) => [segment.id, index]));
			const voterDots = Object.entries(votersBySegment)
				.flatMap(([segmentId, voters]) => {
					const colorIndex = segmentColorIndex.get(segmentId) ?? 0;
					const color = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'][colorIndex % 10];
					return voters
						.filter((voter) => voter.latitude != null && voter.longitude != null)
						.map((voter) => {
							const xPct = (((voter.longitude as number) - minLng) / lngSpan) * 100;
							const yPct = ((maxLat - (voter.latitude as number)) / latSpan) * 100;
							return `<div class="map-sketch-voter" style="left: ${xPct.toFixed(2)}%; top: ${yPct.toFixed(2)}%; background: ${color};"></div>`;
						});
				})
				.join('');

			// Booth markers in the fallback sketch
			const boothDots = boothsWithCoords
				.map((b) => {
					const xPct = (((b.longitude as number) - minLng) / lngSpan) * 100;
					const yPct = ((maxLat - (b.latitude as number)) / latSpan) * 100;
					return `
						<div class="map-sketch-booth" style="left: ${xPct.toFixed(2)}%; top: ${yPct.toFixed(2)}%;">${boothPinSvg}</div>
					`;
				})
				.join('');

			mapVisualHtml = `
				<div class="map-sketch">
					${dots}
					${voterDots}
					${boothDots}
				</div>
				<p class="map-info">
					Approximate relative placement of segment centroids (not to scale). Labels are shown for up to ${labeledCount} segments.
					${boothsWithCoords.length > 0 ? 'Pin marker = Booth location' : ''}
				</p>
			`;
		}
	}

	const boothLegendHtml =
		showBoothMarker && booths.length > 0
			? `
				<div class="booth-legend">
					<div class="booth-legend-title">Booth Locations</div>
					<div class="booth-legend-list">
						${booths
							.map((booth) => {
								const label = booth.booth_name ?? (booth.booth_number != null ? `Booth ${booth.booth_number}` : 'Booth');
								return `
									<div class="booth-legend-item">
										<span class="booth-legend-icon">${boothPinSvg}</span>
										<span>${label}</span>
									</div>
								`;
							})
							.join('')}
					</div>
				</div>
			`
			: '';

	// Generate HTML
	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; line-height: 1.5; color: #1e293b; }
		.page { page-break-after: always; padding: 40px; min-height: 100vh; }
		.page:last-child { page-break-after: auto; }
		h1 { font-size: 28px; margin-bottom: 12px; color: #0f172a; font-weight: 600; }
		h2 { font-size: 20px; margin-bottom: 10px; margin-top: 24px; color: #334155; font-weight: 600; }
		h3 { font-size: 16px; margin-bottom: 8px; margin-top: 20px; color: #475569; font-weight: 600; }
		.cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
		.cover h1 { font-size: 42px; margin-bottom: 24px; }
		.cover .subtitle { font-size: 18px; color: #64748b; margin-bottom: 12px; }
		.metadata-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 32px; }
		.metadata-item { padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
		.metadata-label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px; }
		.metadata-value { font-size: 14px; font-weight: 600; color: #0f172a; }
		.dashboard-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
		.dashboard-card { padding: 16px; border-radius: 10px; color: white; text-align: center; }
		.dashboard-card.primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
		.dashboard-card.success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
		.dashboard-card.warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
		.dashboard-card.danger { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
		.dashboard-card.info { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
		.dashboard-card.secondary { background: linear-gradient(135deg, #64748b 0%, #475569 100%); }
		.dashboard-value { font-size: 28px; font-weight: bold; margin-bottom: 4px; }
		.dashboard-label { font-size: 11px; opacity: 0.95; text-transform: uppercase; letter-spacing: 0.5px; }
		.map-container { margin-top: 16px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
		.map-info { font-size: 10px; color: #64748b; margin-top: 8px; }
		.map-image-wrapper { margin-top: 16px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
		.map-image { width: 100%; display: block; }
		.map-sketch { margin-top: 16px; width: 100%; height: 260px; border-radius: 8px; background: radial-gradient(circle at top, #e5f2ff 0, #f8fafc 45%, #e2e8f0 100%); position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
		.map-sketch-dot { position: absolute; width: 7px; height: 7px; border-radius: 999px; background: #2563eb; box-shadow: 0 0 0 1px #eff6ff, 0 0 0 4px rgba(37,99,235,0.45); transform: translate(-50%, -50%); }
		.map-sketch-voter { position: absolute; width: 5px; height: 5px; border-radius: 999px; transform: translate(-50%, -50%); box-shadow: 0 0 0 1px rgba(255,255,255,0.9); z-index: 6; }
		.map-sketch-dot-label { position: absolute; transform: translate(-50%, -130%); background: rgba(15,23,42,0.9); color: #f9fafb; padding: 2px 4px; border-radius: 3px; font-size: 7px; white-space: nowrap; }
		.map-sketch-booth { position: absolute; transform: translate(-50%, -80%); filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); z-index: 10; }
		.map-sketch-booth svg { width: 22px; height: 22px; display: block; }
		.map-sketch-booth-label { position: absolute; transform: translate(-50%, 30%); background: rgba(234,88,12,0.9); color: #fff; padding: 2px 5px; border-radius: 3px; font-size: 7px; white-space: nowrap; font-weight: 600; z-index: 11; }
		.booth-legend { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
		.booth-legend-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 8px; }
		.booth-legend-list { display: flex; flex-direction: column; gap: 6px; }
		.booth-legend-item { display: flex; align-items: center; gap: 8px; font-size: 10px; color: #475569; }
		.booth-legend-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: 0 0 20px; }
		.booth-legend-icon svg { width: 18px; height: 18px; display: block; }
		.segment-card { padding: 16px; margin-bottom: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; }
		.segment-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; }
		.segment-title { font-size: 16px; font-weight: 600; color: #0f172a; }
		.segment-description { color: #64748b; margin-bottom: 10px; line-height: 1.4; font-size: 10px; }
		.segment-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
		.segment-stat { text-align: center; padding: 8px; background: #f8fafc; border-radius: 4px; }
		.segment-stat-value { font-size: 18px; font-weight: 600; color: #3b82f6; }
		.segment-stat-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; }
		.voter-table { font-size: 9px; margin-top: 12px; }
		.voter-table th, .voter-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
		.voter-table th { background: #f8fafc; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 8px; }
		.voter-table td { color: #334155; }
		.voter-row-far td { background: #fff1f2; }
		.voter-row-missing td { background: #fffbeb; }
		.status-badge { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 8px; font-weight: 600; text-transform: uppercase; }
		.status-badge.far { background: #fee2e2; color: #b91c1c; }
		.status-badge.missing { background: #fef3c7; color: #b45309; }
		.status-badge.ok { background: #dcfce7; color: #15803d; }
		.booth-location-note { margin-top: 12px; padding: 10px 12px; border-radius: 6px; background: #fff7ed; color: #9a3412; border-left: 4px solid #f97316; font-size: 10px; }
		.integrity-checks { margin-top: 20px; }
		.check-item { display: flex; align-items: center; padding: 10px; margin-bottom: 6px; background: #f8fafc; border-radius: 4px; }
		.check-icon { width: 20px; height: 20px; margin-right: 10px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 12px; }
		.check-pass { background: #10b981; }
		.check-fail { background: #ef4444; }
		.check-label { flex: 1; font-weight: 500; font-size: 10px; }
		.performance-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px; }
		.performance-item { padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b; }
		.performance-value { font-size: 20px; font-weight: 600; color: #92400e; }
		.performance-label { font-size: 10px; color: #78350f; text-transform: uppercase; }
		table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
		th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
		th { background: #f8fafc; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
		td { color: #334155; }
		.exception-badge { display: inline-block; padding: 3px 6px; border-radius: 3px; font-size: 8px; font-weight: 600; text-transform: uppercase; }
		.exception-badge.critical { background: #fee2e2; color: #991b1b; }
		.exception-badge.high { background: #fecaca; color: #b91c1c; }
		.exception-badge.medium { background: #fed7aa; color: #c2410c; }
		.exception-badge.low { background: #fef3c7; color: #92400e; }
		.suggestion-item { padding: 12px; margin-bottom: 8px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 10px; line-height: 1.4; }
		.audit-item { padding: 10px; margin-bottom: 6px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #64748b; font-size: 9px; }
		.audit-time { color: #64748b; font-size: 8px; margin-top: 4px; }
	</style>
</head>
<body>
	<!-- Cover Page -->
	<div class="page cover">
		<h1>Segmentation Report</h1>
		<div class="subtitle">${election?.name ?? 'Election'}</div>
		<div class="subtitle">${node?.name ?? node?.code ?? 'Node'}</div>
		<div class="metadata-grid" style="margin-top: 48px; max-width: 600px;">
			<div class="metadata-item">
				<div class="metadata-label">Version Name</div>
				<div class="metadata-value">${job.version_name ?? `Version ${job.version}`}</div>
			</div>
			<div class="metadata-item">
				<div class="metadata-label">Run Hash</div>
				<div class="metadata-value">${job.result?.run_hash?.substring(0, 12) ?? 'N/A'}</div>
			</div>
			<div class="metadata-item">
				<div class="metadata-label">Created</div>
				<div class="metadata-value">${new Date(job.created_at).toLocaleDateString()}</div>
			</div>
			<div class="metadata-item">
				<div class="metadata-label">Total Segments</div>
				<div class="metadata-value">${segments.length}</div>
			</div>
		</div>
		${
			job.version_description
				? `<div style="margin-top: 24px; max-width: 600px; padding: 20px; background: #f8fafc; border-radius: 10px; text-align: left;"><div class="metadata-label">Description</div><div style="margin-top: 6px; color: #475569; line-height: 1.5; font-size: 11px;">${job.version_description}</div></div>`
				: ''
		}
	</div>

	<!-- Dashboard Page -->
	<div class="page">
		<h1>Executive Dashboard</h1>
		<div class="dashboard-grid">
			<div class="dashboard-card primary">
				<div class="dashboard-value">${segments.length}</div>
				<div class="dashboard-label">Total Segments</div>
			</div>
			<div class="dashboard-card success">
				<div class="dashboard-value">${totalVoters.toLocaleString()}</div>
				<div class="dashboard-label">Total Voters</div>
			</div>
			<div class="dashboard-card info">
				<div class="dashboard-value">${totalFamilies.toLocaleString()}</div>
				<div class="dashboard-label">Total Families</div>
			</div>
			<div class="dashboard-card ${totalFarVoters > 0 ? 'danger' : 'secondary'}">
				<div class="dashboard-value">${totalFarVoters}</div>
				<div class="dashboard-label">Voters >= 2 km</div>
			</div>
			<div class="dashboard-card ${totalMissingBoothLocationVoters > 0 ? 'warning' : 'secondary'}">
				<div class="dashboard-value">${totalMissingBoothLocationVoters}</div>
				<div class="dashboard-label">Missing Booth Location</div>
			</div>
			<div class="dashboard-card secondary">
				<div class="dashboard-value">${avgVoters}</div>
				<div class="dashboard-label">Avg Voters/Segment</div>
			</div>
			<div class="dashboard-card warning">
				<div class="dashboard-value">${minVoters}-${maxVoters}</div>
				<div class="dashboard-label">Voter Range</div>
			</div>
			<div class="dashboard-card ${exceptions.length > 0 ? 'danger' : 'success'}">
				<div class="dashboard-value">${exceptions.length}</div>
				<div class="dashboard-label">Exceptions</div>
			</div>
		</div>

		<h2>Quality Metrics</h2>
		<div class="dashboard-grid" style="margin-top: 12px;">
			<div class="dashboard-card ${oversizedSegments > 0 ? 'warning' : 'success'}">
				<div class="dashboard-value">${oversizedSegments}</div>
				<div class="dashboard-label">Oversized Segments</div>
			</div>
			<div class="dashboard-card ${undersizedSegments > 0 ? 'warning' : 'success'}">
				<div class="dashboard-value">${undersizedSegments}</div>
				<div class="dashboard-label">Undersized Segments</div>
			</div>
			<div class="dashboard-card ${segmentsWithFarVoters > 0 ? 'danger' : 'success'}">
				<div class="dashboard-value">${segmentsWithFarVoters}</div>
				<div class="dashboard-label">Segments With Far Voters</div>
			</div>
			<div class="dashboard-card info">
				<div class="dashboard-value">${auditLogs.length}</div>
				<div class="dashboard-label">Audit Records</div>
			</div>
		</div>

		<h2>Segment Distribution</h2>
		<table>
			<thead>
				<tr>
					<th>Segment</th>
					<th>Display Name</th>
					<th>Voters</th>
					<th>Families</th>
					<th>&gt;= 2 km</th>
					<th>Missing Booth</th>
					<th>Area (sq km)</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				${segments
					.map(
						(s) => {
							const boothDistance = normalizeBoothDistanceMetadata(s.metadata?.booth_distance);
							return `
					<tr>
						<td>${s.segment_name}</td>
						<td>${s.display_name ?? s.segment_name}</td>
						<td>${s.total_voters}</td>
						<td>${s.total_families}</td>
						<td>${boothDistance.far_voter_count}</td>
						<td>${boothDistance.missing_booth_location_voter_count}</td>
						<td>${s.area_sq_m != null ? (s.area_sq_m / 1_000_000).toFixed(2) : 'N/A'}</td>
						<td>${
							boothDistance.far_voter_count > 0
								? '<span class="status-badge far">2 km away</span>'
								: boothDistance.missing_booth_location_voter_count > 0
									? '<span class="status-badge missing">Booth missing</span>'
									: s.total_voters > 135
								? '<span class="exception-badge critical">Oversized</span>'
								: s.total_voters < 90
									? '<span class="exception-badge warning">Undersized</span>'
									: '<span class="status-badge ok">Normal</span>'
						}</td>
					</tr>
				`;
						},
					)
					.join('')}
			</tbody>
		</table>
		${totalMissingBoothLocationVoters > 0 ? `<div class="booth-location-note">${boothLocationUnavailableMessage}</div>` : ''}
	</div>

	<!-- Map Visualization Page -->
	<div class="page">
		<h1>Geographic Overview</h1>
		<div class="map-container">
			<h3>Segment Boundaries</h3>
			<p style="font-size: 10px; color: #64748b; margin-top: 8px;">
				This report contains ${segments.length} segments covering ${totalVoters.toLocaleString()} voters across ${totalFamilies.toLocaleString()} families.
			</p>
			${mapVisualHtml}
			<div style="margin-top: 16px;">
				<h4 style="font-size: 12px; margin-bottom: 8px;">Segment Centroids & Footprints</h4>
				<table style="font-size: 9px;">
					<thead>
						<tr>
							<th>Segment</th>
							<th>Latitude</th>
							<th>Longitude</th>
							<th>Area (sq km)</th>
							<th>Voters</th>
						</tr>
					</thead>
					<tbody>
						${segments
							.filter((s) => s.centroid_lat != null && s.centroid_lng != null)
							.slice(0, 30)
							.map(
								(s) => `
							<tr>
								<td>${s.segment_name}</td>
								<td>${s.centroid_lat?.toFixed(6) ?? 'N/A'}</td>
								<td>${s.centroid_lng?.toFixed(6) ?? 'N/A'}</td>
								<td>${s.area_sq_m != null ? (s.area_sq_m / 1_000_000).toFixed(2) : 'N/A'}</td>
								<td>${s.total_voters}</td>
							</tr>
						`,
							)
							.join('')}
					</tbody>
				</table>
				${segments.filter((s) => s.centroid_lat != null && s.centroid_lng != null).length > 30 ? `<p style="font-size: 9px; color: #64748b; margin-top: 8px;">... and ${segments.filter((s) => s.centroid_lat != null && s.centroid_lng != null).length - 30} more segments</p>` : ''}
			</div>
			<div class="map-info">
				<strong>Note:</strong> For interactive map visualization, please use the Segmentation Console in the web application. 
				GeoJSON boundaries are available for each segment in the detailed segment pages.
			</div>
			${boothLegendHtml}
		</div>
	</div>

	<!-- Segment Details Pages with Voters -->
	${segments
		.map(
			(segment) => {
				const voters = votersBySegment[segment.id] ?? [];
				const boothDistance = normalizeBoothDistanceMetadata(segment.metadata?.booth_distance);
				const votersPerPage = 25;
				const voterPages = [];
				for (let i = 0; i < voters.length; i += votersPerPage) {
					voterPages.push(voters.slice(i, i + votersPerPage));
				}
				if (voterPages.length === 0) voterPages.push([]);

				return voterPages
					.map(
						(voterPage, pageIndex) => `
		<div class="page">
			<div class="segment-card">
				<div class="segment-header">
					<div>
						<div class="segment-title">${segment.display_name ?? segment.segment_name}</div>
						<div style="font-size: 12px; color: #64748b; margin-top: 4px;">${segment.segment_name}</div>
					</div>
					<div style="text-align: right;">
						<div style="font-size: 10px; color: #64748b;">Page ${pageIndex + 1} of ${voterPages.length}</div>
					</div>
				</div>
				${segment.description ? `<div class="segment-description">${segment.description}</div>` : ''}
				<div class="segment-stats">
					<div class="segment-stat">
						<div class="segment-stat-value">${segment.total_voters}</div>
						<div class="segment-stat-label">Voters</div>
					</div>
					<div class="segment-stat">
						<div class="segment-stat-value">${segment.total_families}</div>
						<div class="segment-stat-label">Families</div>
					</div>
					<div class="segment-stat">
						<div class="segment-stat-value">${
							segment.area_sq_m != null ? (segment.area_sq_m / 1_000_000).toFixed(2) : 'N/A'
						}</div>
						<div class="segment-stat-label">Area (sq km)</div>
					</div>
					<div class="segment-stat">
						<div class="segment-stat-value">${
							segment.centroid_lat != null && segment.centroid_lng != null
								? `${segment.centroid_lat.toFixed(4)}, ${segment.centroid_lng.toFixed(4)}`
								: 'N/A'
						}</div>
						<div class="segment-stat-label">Centroid (lat, lng)</div>
					</div>
					<div class="segment-stat">
						<div class="segment-stat-value">${boothDistance.far_voter_count}</div>
						<div class="segment-stat-label">Voters &gt;= 2 km</div>
					</div>
					<div class="segment-stat">
						<div class="segment-stat-value">${boothDistance.missing_booth_location_voter_count}</div>
						<div class="segment-stat-label">Missing Booth Location</div>
					</div>
				</div>
				${
					segment.bbox_min_lat != null &&
					segment.bbox_min_lng != null &&
					segment.bbox_max_lat != null &&
					segment.bbox_max_lng != null
						? `<div style="margin-top: 8px; font-size: 9px; color: #64748b;">
					<strong>Bounds:</strong>
					N ${segment.bbox_max_lat.toFixed(4)}°, S ${segment.bbox_min_lat.toFixed(4)}°, 
					W ${segment.bbox_min_lng.toFixed(4)}°, E ${segment.bbox_max_lng.toFixed(4)}°
				</div>`
						: ''
				}
				${voters.length > 0 ? `
				<h3 style="margin-top: 16px; margin-bottom: 8px;">Voters ${pageIndex * votersPerPage + 1}-${Math.min((pageIndex + 1) * votersPerPage, voters.length)} of ${voters.length}</h3>
				<table class="voter-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>EPIC</th>
							<th>Booth</th>
							<th>Status</th>
							<th>Distance</th>
							<th>Age</th>
							<th>Gender</th>
							<th>Relation</th>
							<th>Family ID</th>
						</tr>
					</thead>
					<tbody>
						${voterPage
							.map(
								(v) => `
							<tr class="${
								v.is_far_from_booth
									? 'voter-row-far'
									: v.booth_location_status === 'missing'
										? 'voter-row-missing'
										: ''
							}">
								<td>${v.full_name ?? 'N/A'}</td>
								<td>${v.epic_number ?? 'N/A'}</td>
								<td>${v.booth_name ?? (v.booth_number != null ? `Booth ${v.booth_number}` : 'N/A')}</td>
								<td>${
									v.is_far_from_booth
										? '<span class="status-badge far">2 km away</span>'
										: v.booth_location_status === 'missing'
											? '<span class="status-badge missing">Booth location unavailable</span>'
											: v.booth_location_status === 'member_location_missing'
												? '<span class="status-badge missing">Member location unavailable</span>'
												: '<span class="status-badge ok">Normal</span>'
								}</td>
								<td>${v.distance_from_booth_m != null ? `${(v.distance_from_booth_m / 1000).toFixed(2)} km` : 'N/A'}</td>
								<td>${v.age ?? 'N/A'}</td>
								<td>${v.gender ?? 'N/A'}</td>
								<td>${v.relation_type ?? 'N/A'}${v.relation_name ? ` (${v.relation_name})` : ''}</td>
								<td style="font-size: 8px; font-family: monospace;">${v.family_id.substring(0, 8)}...</td>
							</tr>
						`,
							)
							.join('')}
					</tbody>
				</table>
				` : '<p style="margin-top: 16px; color: #64748b; font-size: 10px;">No voters found for this segment.</p>'}
				${boothDistance.missing_booth_location_voter_count > 0 ? `<div class="booth-location-note">${boothLocationUnavailableMessage}</div>` : ''}
			</div>
		</div>
	`,
					)
					.join('');
			},
		)
		.join('')}

	<!-- Exceptions Page -->
	${exceptions.length > 0 ? `
	<div class="page">
		<h1>Exceptions & Issues</h1>
		<p style="font-size: 10px; color: #64748b; margin-bottom: 16px;">
			${exceptions.length} exception(s) detected during segmentation. Review and resolve as needed.
		</p>
		<table>
			<thead>
				<tr>
					<th>Type</th>
					<th>Severity</th>
					<th>Description</th>
					<th>Suggested Action</th>
					<th>Status</th>
					<th>Date</th>
				</tr>
			</thead>
			<tbody>
				${exceptions
					.map(
						(e) => `
					<tr>
						<td>${e.exception_type}</td>
						<td><span class="exception-badge ${e.severity}">${e.severity}</span></td>
						<td>${e.description ?? 'N/A'}</td>
						<td>${e.suggested_action ?? 'Review manually'}</td>
						<td>${e.status}</td>
						<td>${new Date(e.created_at).toLocaleDateString()}</td>
					</tr>
				`,
					)
					.join('')}
			</tbody>
		</table>
	</div>
	` : ''}

	<!-- Audit Reports Page -->
	${auditLogs.length > 0 ? `
	<div class="page">
		<h1>Audit Reports</h1>
		<p style="font-size: 10px; color: #64748b; margin-bottom: 16px;">
			${auditLogs.length} audit record(s) for this segmentation job.
		</p>
		${auditLogs
			.map(
				(log) => `
			<div class="audit-item">
				<div style="font-weight: 600; margin-bottom: 4px;">Segment: ${log.metadata?.segment_name ?? log.segment_id ?? 'Unknown'}</div>
				<div style="font-size: 9px; color: #475569;">Action: ${log.metadata?.action ?? 'create'} | Entity: ${log.metadata?.entity_type ?? 'segment'}</div>
				<div class="audit-time">${new Date(log.created_at).toLocaleString()}</div>
			</div>
		`,
			)
			.join('')}
	</div>
	` : ''}

	<!-- Performance & Validation Page -->
	<div class="page">
		<h1>Performance & Validation</h1>

		<h2>Integrity Checks</h2>
		<div class="integrity-checks">
			<div class="check-item">
				<div class="check-icon ${job.result?.integrity_checks?.all_families_assigned !== false ? 'check-pass' : 'check-fail'}">${job.result?.integrity_checks?.all_families_assigned !== false ? '✓' : '✗'}</div>
				<div class="check-label">All families assigned</div>
			</div>
			<div class="check-item">
				<div class="check-icon ${job.result?.integrity_checks?.no_overlaps !== false ? 'check-pass' : 'check-fail'}">${job.result?.integrity_checks?.no_overlaps !== false ? '✓' : '✗'}</div>
				<div class="check-label">No overlaps detected</div>
			</div>
			<div class="check-item">
				<div class="check-icon ${job.result?.integrity_checks?.geometry_valid !== false ? 'check-pass' : 'check-fail'}">${job.result?.integrity_checks?.geometry_valid !== false ? '✓' : '✗'}</div>
				<div class="check-label">Geometry valid</div>
			</div>
			<div class="check-item">
				<div class="check-icon ${job.result?.integrity_checks?.no_empty_polygons !== false ? 'check-pass' : 'check-fail'}">${job.result?.integrity_checks?.no_empty_polygons !== false ? '✓' : '✗'}</div>
				<div class="check-label">No empty polygons</div>
			</div>
		</div>

		<h2>Performance Metrics</h2>
		<div class="performance-grid">
			<div class="performance-item">
				<div class="performance-value">${job.result?.algorithm_ms ? `${job.result.algorithm_ms}ms` : 'N/A'}</div>
				<div class="performance-label">Algorithm Time</div>
			</div>
			<div class="performance-item">
				<div class="performance-value">${job.result?.db_write_ms ? `${job.result.db_write_ms}ms` : 'N/A'}</div>
				<div class="performance-label">Database Write</div>
			</div>
			<div class="performance-item">
				<div class="performance-value">${job.result?.validation_ms ? `${job.result.validation_ms}ms` : 'N/A'}</div>
				<div class="performance-label">Validation Time</div>
			</div>
			<div class="performance-item">
				<div class="performance-value">${job.result?.total_ms ? `${job.result.total_ms}ms` : 'N/A'}</div>
				<div class="performance-label">Total Time</div>
			</div>
		</div>

		<h2>Determinism Confirmation</h2>
		<div style="margin-top: 12px; padding: 16px; background: #ecfdf5; border-radius: 6px; border-left: 4px solid #10b981;">
			<div style="font-weight: 600; color: #065f46; margin-bottom: 6px; font-size: 12px;">Deterministic Algorithm Verified</div>
			<div style="color: #047857; font-size: 11px; line-height: 1.4;">
				Run Hash: <code style="background: white; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 10px;">${job.result?.run_hash ?? 'N/A'}</code>
			</div>
			<div style="color: #047857; font-size: 9px; margin-top: 6px;">
				Grid-based region growing algorithm ensures consistent results across multiple runs with identical inputs.
			</div>
		</div>
	</div>

	<!-- Suggestions Page -->
	<div class="page">
		<h1>Recommendations & Suggestions</h1>
		<p style="font-size: 10px; color: #64748b; margin-bottom: 16px;">
			Based on the analysis of this segmentation, the following recommendations are provided:
		</p>
		${suggestions
			.map(
				(suggestion) => `
			<div class="suggestion-item">
				${suggestion}
			</div>
		`,
			)
			.join('')}
		<h2 style="margin-top: 24px;">Next Steps</h2>
		<ul style="font-size: 10px; line-height: 1.8; color: #475569; margin-left: 20px;">
			<li>Review segment boundaries on the interactive map</li>
			<li>Verify voter assignments match geographic boundaries</li>
			<li>Address any exceptions before finalizing segmentation</li>
			<li>Assign BLOs (Booth Level Officers) to segments</li>
			<li>Export segment data for field operations</li>
		</ul>
	</div>
</body>
</html>
	`;

	return html;
};

/**
 * Render a static map image showing all segment geometries using Google Maps + Puppeteer.
 * Returns a data URL (data:image/png;base64,...) or null on failure.
 */
async function renderSegmentsMapImage(
	segments: SegmentData[],
	booths: BoothData[],
	votersBySegment: Record<string, VoterData[]>,
	showBoothMarker: boolean,
): Promise<string | null> {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		return null;
	}
	if (segments.length === 0) {
		return null;
	}

	// Build a lightweight payload with parsed GeoJSON geometries
	const payload = segments.map((s, index) => ({
		id: s.id,
		name: s.display_name ?? s.segment_name,
		voters: s.total_voters,
		colorIndex: index,
		geometry: s.geometry_geojson ? JSON.parse(s.geometry_geojson) : null,
	}));
	const segmentColorIndex = new Map(segments.map((segment, index) => [segment.id, index]));
	const voterPayload = Object.entries(votersBySegment)
		.flatMap(([segmentId, voters]) =>
			voters
				.filter((voter) => voter.latitude != null && voter.longitude != null)
				.map((voter) => ({
					lat: voter.latitude as number,
					lng: voter.longitude as number,
					colorIndex: segmentColorIndex.get(segmentId) ?? 0,
				})),
		);

	const boothPayload = showBoothMarker
		? booths
				.filter((b) => b.latitude != null && b.longitude != null)
				.map((b) => ({
					lat: b.latitude as number,
					lng: b.longitude as number,
					label: b.booth_name ?? (b.booth_number != null ? `Booth ${b.booth_number}` : 'Booth'),
				}))
		: [];

	const boothPinSvgUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#E53935"/><circle cx="12" cy="9" r="3" fill="#f8f8f8"/></svg>`,
	)}`;

	const serialized = JSON.stringify(payload);
	const boothSerialized = JSON.stringify(boothPayload);
	const voterSerialized = JSON.stringify(voterPayload);

	const html = `
<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8" />
		<style>
			html, body { margin: 0; padding: 0; }
			#map { width: 900px; height: 600px; }
		</style>
	</head>
	<body>
		<div id="map"></div>
		<script>
			const SEGMENTS = ${serialized};
			const BOOTHS = ${boothSerialized};
			const VOTERS = ${voterSerialized};
			const COLORS = [
				'#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
				'#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
			];

			function toPaths(geometry) {
				if (!geometry || !geometry.coordinates) return [];
				const type = geometry.type;
				const coords = geometry.coordinates;
				const paths = [];
				if (type === 'Polygon') {
					const ring = coords[0] || [];
					paths.push(ring.map(function(pair) { return {lat: pair[1], lng: pair[0]}; }));
				} else if (type === 'MultiPolygon') {
					coords.forEach(function(poly) {
						const ring = (poly && poly[0]) || [];
						paths.push(ring.map(function(pair) { return {lat: pair[1], lng: pair[0]}; }));
					});
				}
				return paths;
			}

			function initMap() {
				const mapEl = document.getElementById('map');
				const map = new google.maps.Map(mapEl, {
					center: {lat: 22.9734, lng: 78.6569},
					zoom: 5,
					disableDefaultUI: true,
					mapTypeId: 'roadmap',
				});

				const bounds = new google.maps.LatLngBounds();

				SEGMENTS.forEach(function(seg) {
					const paths = toPaths(seg.geometry);
					if (!paths.length) return;
					const color = COLORS[seg.colorIndex % COLORS.length];
					const polygon = new google.maps.Polygon({
						paths: paths,
						strokeColor: color,
						strokeOpacity: 0.9,
						strokeWeight: 1.5,
						fillColor: color,
						fillOpacity: 0.35,
						map: map,
					});
					paths.forEach(function(ring) {
						ring.forEach(function(pt) { bounds.extend(pt); });
					});
				});

				VOTERS.forEach(function(voter) {
					const pos = {lat: voter.lat, lng: voter.lng};
					new google.maps.Marker({
						position: pos,
						icon: {
							path: google.maps.SymbolPath.CIRCLE,
							scale: 3.5,
							fillColor: COLORS[voter.colorIndex % COLORS.length],
							fillOpacity: 0.9,
							strokeColor: '#ffffff',
							strokeOpacity: 0.9,
							strokeWeight: 1,
						},
						map: map,
					});
					bounds.extend(pos);
				});

				// Add booth location markers
				BOOTHS.forEach(function(booth) {
					const pos = {lat: booth.lat, lng: booth.lng};
					new google.maps.Marker({
						position: pos,
						map: map,
						title: booth.label,
						icon: {
							url: '${boothPinSvgUrl}',
							scaledSize: new google.maps.Size(28, 28),
						},
					});
					bounds.extend(pos);
				});

				if (!bounds.isEmpty()) {
					map.fitBounds(bounds);
				}

				window.__mapReady = true;
			}

			window.__mapReady = false;
		</script>
		<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap" async defer></script>
	</body>
</html>
`;

	let browser: Browser | null = null;
	try {
		const puppeteer = await import('puppeteer');
		browser = await puppeteer.default.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		});
		const page = await browser.newPage();
		await page.setViewport({width: 900, height: 600});
		await page.setContent(html, {waitUntil: 'networkidle0'});
		try {
			await page.waitForFunction('window.__mapReady === true', {timeout: 10000});
		} catch {
			// ignore timeout; we may still get a usable image
		}
		const png = await page.screenshot({type: 'png', encoding: 'base64'});
		return `data:image/png;base64,${png}`;
	} catch {
		return null;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

export const convertHtmlToPdf = async (html: string): Promise<Buffer> => {
	let browser: Browser | null = null;
	try {
		// Dynamically import puppeteer
		const puppeteer = await import('puppeteer');
		browser = await puppeteer.default.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		});
		const page = await browser.newPage();
		await page.setContent(html, {waitUntil: 'networkidle0'});
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: {top: '0', right: '0', bottom: '0', left: '0'},
		});
		return Buffer.from(pdf);
	} finally {
		if (browser) {
			await browser.close();
		}
	}
};
