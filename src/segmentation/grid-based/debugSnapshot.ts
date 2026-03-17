import {DbClient} from '../../db/transaction.js';
import {Voter} from '../../types/domain.js';
import {BoothGridDebugSnapshot, BoothGridDebugTimelineStep, DebugGeoJsonFeature, DebugGeoJsonGeometry} from '../types.js';
import {AtomicUnit} from './atomicUnitBuilder.js';
import {CellAssignment} from './cellAssigner.js';
import {GridCell} from './gridBuilder.js';
import {Region} from './regionGrower.js';
import {Segment} from './segmentBuilder.js';

type BoothRow = {
	id: string;
	node_id: string;
	booth_number: string | null;
	booth_name: string | null;
	latitude: number | null;
	longitude: number | null;
};

type BuildBoothGridDebugSnapshotParams = {
	client: DbClient;
	electionId: string;
	nodeId: string;
	version: number;
	boothIds: string[];
	boundary: {geometry: DebugGeoJsonGeometry};
	gridCells: GridCell[];
	units: AtomicUnit[];
	assignments: Map<string, CellAssignment>;
	regions: Region[];
	segments: Segment[];
	voters: Voter[];
};

function polygonFeature(geometry: DebugGeoJsonGeometry, properties: Record<string, unknown>): DebugGeoJsonFeature {
	return {
		type: 'Feature',
		geometry,
		properties,
	};
}

function pointFeature(longitude: number, latitude: number, properties: Record<string, unknown>): DebugGeoJsonFeature {
	return {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [longitude, latitude],
		},
		properties,
	};
}

const sortStrings = (values: Iterable<string>) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

function buildTimeline(params: {
	gridCells: GridCell[];
	units: AtomicUnit[];
	assignments: Map<string, CellAssignment>;
	regions: Region[];
	segments: Segment[];
}): BoothGridDebugTimelineStep[] {
	const {gridCells, units, assignments, regions, segments} = params;
	const timeline: BoothGridDebugTimelineStep[] = [];
	const allCellIds = sortStrings(gridCells.map((cell) => cell.id));
	const allUnitIds = sortStrings(units.map((unit) => unit.id));
	const segmentByRegionId = new Map(segments.map((segment) => [segment.source_region_id, segment]));
	const regionUnitIds = new Map<string, string[]>();

	for (const region of regions) {
		const unitIds = sortStrings(region.cell_ids.flatMap((cellId) => assignments.get(cellId)?.unit_ids ?? []));
		regionUnitIds.set(region.id, unitIds);
	}

	const pushStep = (step: Omit<BoothGridDebugTimelineStep, 'step'>) => {
		timeline.push({
			step: timeline.length + 1,
			...step,
			visible_cell_ids: sortStrings(step.visible_cell_ids),
			highlighted_cell_ids: sortStrings(step.highlighted_cell_ids),
			visible_region_ids: sortStrings(step.visible_region_ids),
			highlighted_region_ids: sortStrings(step.highlighted_region_ids),
			visible_segment_codes: sortStrings(step.visible_segment_codes),
			highlighted_segment_codes: sortStrings(step.highlighted_segment_codes),
			highlighted_unit_ids: sortStrings(step.highlighted_unit_ids),
		});
	};

	pushStep({
		stage: 'scope',
		title: 'Scope resolved',
		description: 'The algorithm selects the booth scope and the raw voters that belong to it.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: false,
		show_grid: false,
		show_family_points: false,
		show_regions: false,
		show_segments: false,
		visible_cell_ids: [],
		highlighted_cell_ids: [],
		visible_region_ids: [],
		highlighted_region_ids: [],
		visible_segment_codes: [],
		highlighted_segment_codes: [],
		highlighted_unit_ids: [],
	});

	pushStep({
		stage: 'atomic_units',
		title: 'Atomic units built',
		description: 'Families become indivisible atomic units with a single centroid and voter count.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: false,
		show_grid: false,
		show_family_points: true,
		show_regions: false,
		show_segments: false,
		visible_cell_ids: [],
		highlighted_cell_ids: [],
		visible_region_ids: [],
		highlighted_region_ids: [],
		visible_segment_codes: [],
		highlighted_segment_codes: [],
		highlighted_unit_ids: allUnitIds,
	});

	pushStep({
		stage: 'boundary',
		title: 'Parent boundary computed',
		description: 'A concave hull is built around the family centroids to define the working boundary.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: true,
		show_grid: false,
		show_family_points: true,
		show_regions: false,
		show_segments: false,
		visible_cell_ids: [],
		highlighted_cell_ids: [],
		visible_region_ids: [],
		highlighted_region_ids: [],
		visible_segment_codes: [],
		highlighted_segment_codes: [],
		highlighted_unit_ids: [],
	});

	pushStep({
		stage: 'grid',
		title: 'Adaptive grid built',
		description: 'Square grid cells are generated across the parent boundary.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: true,
		show_grid: true,
		show_family_points: true,
		show_regions: false,
		show_segments: false,
		visible_cell_ids: allCellIds,
		highlighted_cell_ids: [],
		visible_region_ids: [],
		highlighted_region_ids: [],
		visible_segment_codes: [],
		highlighted_segment_codes: [],
		highlighted_unit_ids: [],
	});

	pushStep({
		stage: 'assignments',
		title: 'Families assigned to grid cells',
		description: 'Each atomic unit is attached to one grid cell before region growth starts.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: true,
		show_grid: true,
		show_family_points: true,
		show_regions: false,
		show_segments: false,
		visible_cell_ids: allCellIds,
		highlighted_cell_ids: sortStrings(assignments.keys()),
		visible_region_ids: [],
		highlighted_region_ids: [],
		visible_segment_codes: [],
		highlighted_segment_codes: [],
		highlighted_unit_ids: allUnitIds,
	});

	const committedCellIds = new Set<string>();
	const committedRegionIds = new Set<string>();

	for (const region of regions) {
		const segment = segmentByRegionId.get(region.id) ?? null;
		const activeCellIds = new Set<string>();
		const unitIdsForRegion = regionUnitIds.get(region.id) ?? [];
		const growthSteps = region.debug?.growth_steps ?? [];

		for (const growthStep of growthSteps) {
			if (growthStep.action !== 'skip_exceeds_max') {
				activeCellIds.add(growthStep.cell_id);
			}

			pushStep({
				stage: 'region_growth',
				title:
					growthStep.action === 'seed'
						? `Seed region ${region.id}`
						: growthStep.action === 'add_neighbor'
							? `Grow region ${region.id}`
							: `Skip candidate for ${region.id}`,
				description:
					growthStep.action === 'seed'
						? `Region ${region.id} starts from seed cell ${growthStep.cell_id}.`
						: growthStep.action === 'add_neighbor'
							? `Cell ${growthStep.cell_id} is added to region ${region.id}.`
							: `Cell ${growthStep.cell_id} is skipped because it would exceed the maximum size.`,
				focus_region_id: region.id,
				focus_segment_code: segment?.code ?? null,
				focus_cell_id: growthStep.cell_id,
				from_cell_id: growthStep.from_cell_id,
				growth_action: growthStep.action,
				show_booths: true,
				show_voters: true,
				show_boundary: true,
				show_grid: true,
				show_family_points: true,
				show_regions: true,
				show_segments: false,
				visible_cell_ids: [...committedCellIds, ...activeCellIds],
				highlighted_cell_ids: [growthStep.cell_id],
				visible_region_ids: [...committedRegionIds, region.id],
				highlighted_region_ids: [region.id],
				visible_segment_codes: [],
				highlighted_segment_codes: segment?.code ? [segment.code] : [],
				highlighted_unit_ids: unitIdsForRegion,
			});
		}

		for (const cellId of region.cell_ids) {
			if (assignments.has(cellId)) {
				committedCellIds.add(cellId);
			}
		}
		committedRegionIds.add(region.id);

		if ((region.debug?.merged_from_region_ids ?? []).length > 0) {
			pushStep({
				stage: 'region_merge',
				title: `Merge into ${region.id}`,
				description: `Undersized neighboring regions are merged into ${region.id}.`,
				focus_region_id: region.id,
				focus_segment_code: segment?.code ?? null,
				focus_cell_id: null,
				from_cell_id: null,
				growth_action: null,
				show_booths: true,
				show_voters: true,
				show_boundary: true,
				show_grid: true,
				show_family_points: true,
				show_regions: true,
				show_segments: false,
				visible_cell_ids: [...committedCellIds],
				highlighted_cell_ids: region.cell_ids.filter((cellId) => assignments.has(cellId)),
				visible_region_ids: [...committedRegionIds],
				highlighted_region_ids: [region.id],
				visible_segment_codes: [],
				highlighted_segment_codes: segment?.code ? [segment.code] : [],
				highlighted_unit_ids: unitIdsForRegion,
			});
		}
	}

	const rebalanceEvents = regions
		.flatMap((region) =>
			(region.debug?.rebalanced_transfers ?? []).map((transfer) => ({
				region,
				segment: segmentByRegionId.get(region.id) ?? null,
				transfer,
				unitIdsForRegion: regionUnitIds.get(region.id) ?? [],
			})),
		)
		.sort(
			(a, b) =>
				a.transfer.order - b.transfer.order ||
				a.region.id.localeCompare(b.region.id) ||
				a.transfer.cell_id.localeCompare(b.transfer.cell_id),
		);

	for (const {region, segment, transfer, unitIdsForRegion} of rebalanceEvents) {
		pushStep({
			stage: 'region_rebalance',
			title: `Rebalance ${transfer.cell_id} into ${region.id}`,
			description: `Cell ${transfer.cell_id} is pulled from ${transfer.donor_region_id} into ${region.id} to repair an undersized region using a nearby boundary cell.`,
			focus_region_id: region.id,
			focus_segment_code: segment?.code ?? null,
			focus_cell_id: transfer.cell_id,
			from_cell_id: transfer.from_cell_id,
			growth_action: null,
			show_booths: true,
			show_voters: true,
			show_boundary: true,
			show_grid: true,
			show_family_points: true,
			show_regions: true,
			show_segments: false,
			visible_cell_ids: [...committedCellIds],
			highlighted_cell_ids: [transfer.cell_id, transfer.from_cell_id].filter((value): value is string => !!value),
			visible_region_ids: [...committedRegionIds],
			highlighted_region_ids: [region.id, transfer.donor_region_id],
			visible_segment_codes: [],
			highlighted_segment_codes: segment?.code ? [segment.code] : [],
			highlighted_unit_ids: unitIdsForRegion,
		});
	}

	const compressionEvents = regions
		.flatMap((region) =>
			(region.debug?.compression_transfers ?? []).map((transfer) => ({
				region,
				segment: segmentByRegionId.get(region.id) ?? null,
				transfer,
				unitIdsForRegion: regionUnitIds.get(region.id) ?? [],
			})),
		)
		.sort(
			(a, b) =>
				a.transfer.order - b.transfer.order ||
				a.region.id.localeCompare(b.region.id) ||
				a.transfer.cell_id.localeCompare(b.transfer.cell_id),
		);

	for (const {region, segment, transfer, unitIdsForRegion} of compressionEvents) {
		pushStep({
			stage: 'region_compression',
			title: `Compress ${transfer.cell_id} into ${region.id}`,
			description: transfer.source_eliminated
				? `Cell ${transfer.cell_id} completes the compression of ${transfer.source_region_id} into neighboring regions.`
				: `Cell ${transfer.cell_id} moves from ${transfer.source_region_id} into ${region.id} so the algorithm can reduce the total number of regions.`,
			focus_region_id: region.id,
			focus_segment_code: segment?.code ?? null,
			focus_cell_id: transfer.cell_id,
			from_cell_id: transfer.from_cell_id,
			growth_action: null,
			show_booths: true,
			show_voters: true,
			show_boundary: true,
			show_grid: true,
			show_family_points: true,
			show_regions: true,
			show_segments: false,
			visible_cell_ids: [...committedCellIds],
			highlighted_cell_ids: [transfer.cell_id, transfer.from_cell_id].filter((value): value is string => !!value),
			visible_region_ids: [...committedRegionIds],
			highlighted_region_ids: [region.id, transfer.source_region_id],
			visible_segment_codes: [],
			highlighted_segment_codes: segment?.code ? [segment.code] : [],
			highlighted_unit_ids: unitIdsForRegion,
		});
	}

	const filledCellIds = new Set<string>(committedCellIds);
	for (const region of regions) {
		const segment = segmentByRegionId.get(region.id) ?? null;
		const unitIdsForRegion = regionUnitIds.get(region.id) ?? [];
		for (const assignment of region.debug?.empty_fill_assignments ?? []) {
			filledCellIds.add(assignment.cell_id);
			pushStep({
				stage: 'empty_fill',
				title: `Fill empty cell ${assignment.cell_id}`,
				description: `An empty grid cell is attached to region ${region.id} for wall-to-wall coverage.`,
				focus_region_id: region.id,
				focus_segment_code: segment?.code ?? null,
				focus_cell_id: assignment.cell_id,
				from_cell_id: null,
				growth_action: null,
				show_booths: true,
				show_voters: true,
				show_boundary: true,
				show_grid: true,
				show_family_points: true,
				show_regions: true,
				show_segments: false,
				visible_cell_ids: [...filledCellIds],
				highlighted_cell_ids: [assignment.cell_id],
				visible_region_ids: [...committedRegionIds],
				highlighted_region_ids: [region.id],
				visible_segment_codes: [],
				highlighted_segment_codes: segment?.code ? [segment.code] : [],
				highlighted_unit_ids: unitIdsForRegion,
			});
		}
	}

	pushStep({
		stage: 'segments',
		title: 'Segments finalized',
		description: 'Region geometries are cleaned, validated, and stored as final segments.',
		focus_region_id: null,
		focus_segment_code: null,
		focus_cell_id: null,
		from_cell_id: null,
		growth_action: null,
		show_booths: true,
		show_voters: true,
		show_boundary: true,
		show_grid: true,
		show_family_points: true,
		show_regions: true,
		show_segments: true,
		visible_cell_ids: allCellIds,
		highlighted_cell_ids: [],
		visible_region_ids: sortStrings(regions.map((region) => region.id)),
		highlighted_region_ids: [],
		visible_segment_codes: sortStrings(segments.map((segment) => segment.code)),
		highlighted_segment_codes: sortStrings(segments.map((segment) => segment.code)),
		highlighted_unit_ids: [],
	});

	return timeline;
}

export async function buildBoothGridDebugSnapshot({
	client,
	electionId,
	nodeId,
	version,
	boothIds,
	boundary,
	gridCells,
	units,
	assignments,
	regions,
	segments,
	voters,
}: BuildBoothGridDebugSnapshotParams): Promise<BoothGridDebugSnapshot> {
	const boothResult = await client.query<BoothRow>(
		`
		SELECT
			id::text,
			node_id::text,
			booth_number::text,
			booth_name,
			latitude,
			longitude
		FROM booths
		WHERE id::text = any($1::text[])
		ORDER BY booth_number ASC NULLS LAST, id ASC
		`,
		[boothIds],
	);

	const voterById = new Map(voters.map((voter) => [voter.id, voter]));
	const regionById = new Map(regions.map((region) => [region.id, region]));
	const regionByCell = new Map<string, Region>();
	const segmentByRegionId = new Map<string, Segment>();
	const segmentByCell = new Map<string, Segment>();
	const segmentByUnit = new Map<string, Segment>();
	const unitToCell = new Map<string, string>();

	for (const assignment of assignments.values()) {
		for (const unitId of assignment.unit_ids) {
			unitToCell.set(unitId, assignment.cell_id);
		}
	}

	for (const region of regions) {
		for (const cellId of region.cell_ids) {
			regionByCell.set(cellId, region);
		}
	}

	for (const segment of segments) {
		segmentByRegionId.set(segment.source_region_id, segment);
		for (const cellId of segment.cell_ids) {
			segmentByCell.set(cellId, segment);
		}
		for (const unitId of segment.unit_ids) {
			segmentByUnit.set(unitId, segment);
		}
	}

	const gridFeatures = gridCells.map((cell) => {
		const assignment = assignments.get(cell.id);
		const region = regionByCell.get(cell.id) ?? null;
		const segment = segmentByCell.get(cell.id) ?? null;

		return polygonFeature(cell.geometry as DebugGeoJsonGeometry, {
			cell_id: cell.id,
			centroid_lat: cell.centroid.lat,
			centroid_lng: cell.centroid.lng,
			assigned_unit_count: assignment?.unit_ids.length ?? 0,
			assigned_voter_count: assignment?.voter_count ?? 0,
			assigned_unit_ids: assignment?.unit_ids ?? [],
			region_id: region?.id ?? null,
			segment_code: segment?.code ?? null,
			seed_cell_id: region?.seed_cell_id ?? null,
			is_seed_cell: region?.seed_cell_id === cell.id,
			is_empty_fill_cell: !assignment && !!region,
			region_voter_count: region?.voter_count ?? null,
			region_merged_from_ids: region?.debug?.merged_from_region_ids ?? [],
			region_rebalance_count: region?.debug?.rebalanced_transfers.length ?? 0,
			region_compression_count: region?.debug?.compression_transfers.length ?? 0,
		});
	});

	const familyFeatures = units.map((unit) => {
		const [longitude, latitude] = unit.centroid.coordinates;
		const cellId = unitToCell.get(unit.id) ?? null;
		const region = cellId ? regionByCell.get(cellId) ?? null : null;
		const segment = segmentByUnit.get(unit.id) ?? null;
		const sampleVoter = unit.voter_ids.map((voterId) => voterById.get(voterId)).find(Boolean) ?? null;

		return pointFeature(longitude, latitude, {
			family_id: unit.id,
			booth_id: sampleVoter?.booth_id ?? null,
			cell_id: cellId,
			region_id: region?.id ?? null,
			segment_code: segment?.code ?? null,
			voter_count: unit.voter_count,
			voter_ids: unit.voter_ids,
		});
	});

	const voterFeatures = voters
		.filter((voter) => voter.latitude != null && voter.longitude != null)
		.map((voter) => {
			const segment = voter.family_id ? segmentByUnit.get(voter.family_id) ?? null : null;
			const cellId = voter.family_id ? unitToCell.get(voter.family_id) ?? null : null;
			const region = cellId ? regionByCell.get(cellId) ?? null : null;

			return pointFeature(voter.longitude as number, voter.latitude as number, {
				voter_id: voter.id,
				family_id: voter.family_id,
				booth_id: voter.booth_id,
				cell_id: cellId,
				region_id: region?.id ?? null,
				segment_code: segment?.code ?? null,
				address: voter.address ?? null,
			});
		});

	const timeline = buildTimeline({
		gridCells,
		units,
		assignments,
		regions,
		segments,
	});

	return {
		type: 'booth_grid_debug_snapshot',
		election_id: electionId,
		node_id: nodeId,
		version,
		scope: 'BOOTH',
		booth_ids: boothIds,
		created_for_single_booth: boothIds.length === 1,
		booths: boothResult.rows.map((row) => ({
			id: row.id,
			node_id: row.node_id,
			booth_number: row.booth_number,
			booth_name: row.booth_name,
			latitude: row.latitude != null ? Number(row.latitude) : null,
			longitude: row.longitude != null ? Number(row.longitude) : null,
		})),
		boundary: boundary.geometry,
		grid_cells: {
			type: 'FeatureCollection',
			features: gridFeatures,
		},
		family_points: {
			type: 'FeatureCollection',
			features: familyFeatures,
		},
		voter_points: {
			type: 'FeatureCollection',
			features: voterFeatures,
		},
		regions: regions.map((region) => ({
			region_id: region.id,
			segment_code: segmentByRegionId.get(region.id)?.code ?? null,
			seed_cell_id: region.seed_cell_id,
			voter_count: region.voter_count,
			cell_ids: [...region.cell_ids].sort(),
			unit_ids: [...new Set(region.cell_ids.flatMap((cellId) => assignments.get(cellId)?.unit_ids ?? []))].sort(),
			growth_steps: (regionById.get(region.id)?.debug?.growth_steps ?? []).map((step) => ({...step})),
			merged_from_region_ids: [...(region.debug?.merged_from_region_ids ?? [])],
			rebalanced_transfers: (region.debug?.rebalanced_transfers ?? []).map((transfer) => ({...transfer})),
			compression_transfers: (region.debug?.compression_transfers ?? []).map((transfer) => ({...transfer})),
			empty_fill_assignments: (region.debug?.empty_fill_assignments ?? []).map((assignment) => ({...assignment})),
		})),
		segments: segments.map((segment) => ({
			segment_id: segment.id,
			segment_code: segment.code,
			source_region_id: segment.source_region_id,
			seed_cell_id: segment.seed_cell_id,
			total_voters: segment.total_voters,
			total_families: segment.total_families,
			cell_ids: [...segment.cell_ids].sort(),
			unit_ids: [...segment.unit_ids],
		})),
		timeline,
	};
}
