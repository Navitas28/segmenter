import {DbClient} from '../db/transaction.js';
import {logger} from '../config/logger.js';
import {HierarchyLevelKind, Voter} from '../types/domain.js';

type ScopeResult = {
	scope: HierarchyLevelKind;
	boothIds: string[];
	voters: Voter[];
};

function detectLevelKind(level: Record<string, unknown>): HierarchyLevelKind | null {
	const candidates = [level['level_code'], level['level_name'], level['level_type'], level['code'], level['name'], level['type']].map((value) => (typeof value === 'string' ? value.toUpperCase() : '')).filter(Boolean);

	if (candidates.some((value) => value.includes('BOOTH'))) return 'BOOTH';
	if (candidates.some((value) => value.includes('POLLING STATION') || value.includes('POLLING'))) return 'BOOTH';
	if (candidates.some((value) => value.includes('AC') || value.includes('ASSEMBLY'))) {
		return 'AC';
	}
	return null;
}

export async function resolveScopeAndVoters(client: DbClient, nodeId: string, electionId: string): Promise<ScopeResult> {
	const nodeResult = await client.query(
		`select hn.*, hl.*
     from hierarchy_nodes hn
     join hierarchy_levels hl on hn.level_id = hl.id
     where hn.id = $1`,
		[nodeId],
	);

	if (nodeResult.rowCount === 0) {
		throw new Error(`Hierarchy node not found: ${nodeId}`);
	}

	const levelKind = detectLevelKind(nodeResult.rows[0]);
	if (!levelKind) {
		throw new Error(`Unable to determine node scope for node: ${nodeId}`);
	}

	if (levelKind === 'BOOTH') {
		const boothResult = await client.query(`select id from booths where node_id = $1`, [nodeId]);

		if (boothResult.rowCount === 0) {
			throw new Error(`Booth not found for node: ${nodeId}`);
		}

		const boothIds = boothResult.rows.map((row) => String(row.id));
		const voters = await fetchVoters(client, boothIds, electionId);
		await assertSingleAcBoundary(client, boothIds, electionId);
		return {scope: 'BOOTH', boothIds, voters};
	}

	const boothLevelResult = await client.query(`select * from hierarchy_levels`);
	const boothLevel = boothLevelResult.rows.find((row) => detectLevelKind(row) === 'BOOTH');
	if (!boothLevel) {
		throw new Error('Booth level not found in hierarchy_levels');
	}

	const boothNodesResult = await client.query(
		`
    with recursive node_tree as (
      select id, parent_id, level_id
      from hierarchy_nodes
      where id = $1
      union all
      select hn.id, hn.parent_id, hn.level_id
      from hierarchy_nodes hn
      join node_tree nt on nt.id = hn.parent_id
    )
    select id from node_tree where level_id = $2
    `,
		[nodeId, boothLevel.id],
	);

	const boothNodeIds = boothNodesResult.rows.map((row) => String(row.id));
	if (boothNodeIds.length === 0) {
		logger.warn({nodeId}, 'No booth nodes found under AC');
	}

	const boothsResult = await client.query(`select id from booths where node_id::text = any($1::text[])`, [boothNodeIds]);
	const boothIds = boothsResult.rows.map((row) => String(row.id));
	const voters = await fetchVoters(client, boothIds, electionId);
	await assertSingleAcBoundary(client, boothIds, electionId);

	return {scope: 'AC', boothIds, voters};
}

async function assertSingleAcBoundary(client: DbClient, boothIds: string[], electionId: string): Promise<void> {
	if (boothIds.length === 0) return;

	const acResult = await client.query(
		`
    select count(distinct ac_node.id) as ac_count
    from voters v
    join booths b on v.booth_id = b.id
    join hierarchy_nodes booth_node on b.node_id = booth_node.id
    join hierarchy_nodes ac_node on booth_node.parent_id = ac_node.id
    where v.election_id = $1
      and v.booth_id = any($2)
    `,
		[electionId, boothIds],
	);

	const acCount = Number(acResult.rows[0]?.ac_count ?? 0);
	if (acCount > 1) {
		throw new Error('BOUNDARY_VIOLATION');
	}
}

async function fetchVoters(client: DbClient, boothIds: string[], electionId: string): Promise<Voter[]> {
	if (boothIds.length === 0) return [];

	const votersResult = await client.query(
		`
    select id, election_id, booth_id, family_id, section_number,
           latitude, longitude, address
    from voters
    where booth_id::text = any($1::text[])
      and election_id = $2
    `,
		[boothIds, electionId],
	);

	return votersResult.rows.map((row) => {
		const parsedSection = row.section_number !== null ? Number(row.section_number) : null;
		const sectionNumber = parsedSection !== null && Number.isNaN(parsedSection) ? null : parsedSection;

		return {
			id: String(row.id),
			election_id: String(row.election_id),
			booth_id: row.booth_id ? String(row.booth_id) : null,
			family_id: row.family_id ? String(row.family_id) : null,
			section_number: sectionNumber,
			latitude: row.latitude !== null ? Number(row.latitude) : null,
			longitude: row.longitude !== null ? Number(row.longitude) : null,
			house_number: null,
			address: row.address ? String(row.address) : null,
		};
	});
}
