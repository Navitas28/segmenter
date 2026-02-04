export type HierarchyLevelKind = 'AC' | 'BOOTH';

export type Voter = {
	id: string;
	election_id: string;
	booth_id: string | null;
	family_id: string | null;
	section_number: number | null;
	latitude: number | null;
	longitude: number | null;
	house_number: string | null;
	address: string | null;
};

export type FamilyGroup = {
	key: string;
	familyId: string | null;
	voters: Voter[];
	centroidLat: number;
	centroidLng: number;
	angle: number;
};

export type SegmentBuild = {
	index: number;
	families: FamilyGroup[];
	voters: Voter[];
	voterCount: number;
	familyCount: number;
	centroidLat: number;
	centroidLng: number;
	centroidGeoJson: object;
	boundaryGeoJson: object;
	geometry?: {
		type: 'Polygon';
		coordinates: number[][][];
	};
	minAngle?: number;
	maxAngle?: number;
};

export type SegmentStats = {
	totalSegments: number;
	totalVoters: number;
	totalFamilies: number;
	minVoters: number;
	maxVoters: number;
	avgVoters: number;
};

export type SegmentationException = {
	type: 'SEGMENTATION';
	metadata: Record<string, unknown>;
};
