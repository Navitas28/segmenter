import {create} from 'zustand';

interface LayerVisibility {
	boundaries: boolean;
	labels: boolean;
	centroids: boolean;
	dimMap: boolean;
	geohash: boolean;
	families: boolean;
	exceptionsOnly: boolean;
	previousVersion: boolean;
	showVoters: boolean;
}

export type MapTypeId = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

interface Filters {
	oversized: boolean;
	undersized: boolean;
	over150: boolean;
	under100: boolean;
	searchTerm: string;
}

interface CustomerStore {
	electionId: string;
	nodeId: string;
	assemblyId: string;
	boothId: string;
	scopeType: 'ac' | 'booth';
	selectedVersion: number | null;
	jobId: string | null;
	pdfJobId: string | null;
	selectedSegmentId: string | null;
	leftSidebarCollapsed: boolean;
	rightSidebarCollapsed: boolean;
	layers: LayerVisibility;
	filters: Filters;
	mapType: MapTypeId;
	map3DEnabled: boolean;
	setMapType: (t: MapTypeId) => void;
	setMap3DEnabled: (v: boolean) => void;
	setElectionId: (id: string) => void;
	setNodeId: (id: string) => void;
	setAssemblyId: (id: string) => void;
	setBoothId: (id: string) => void;
	setScopeType: (type: 'ac' | 'booth') => void;
	setSelectedVersion: (version: number | null) => void;
	setJobId: (id: string | null) => void;
	setPdfJobId: (id: string | null) => void;
	setSelectedSegmentId: (id: string | null) => void;
	toggleLeftSidebar: () => void;
	toggleRightSidebar: () => void;
	toggleLayer: (layer: keyof LayerVisibility) => void;
	updateFilter: (filter: keyof Filters, value: boolean | string) => void;
}

export const useCustomerStore = create<CustomerStore>((set) => ({
	electionId: '',
	nodeId: '',
	assemblyId: '',
	boothId: '',
	scopeType: 'ac',
	selectedVersion: null,
	jobId: null,
	pdfJobId: null,
	selectedSegmentId: null,
	leftSidebarCollapsed: false,
	rightSidebarCollapsed: false,
	layers: {
		boundaries: true,
		labels: false,
		centroids: false,
		dimMap: false,
		geohash: false,
		families: false,
		exceptionsOnly: false,
		previousVersion: false,
		showVoters: false,
	},
	mapType: 'roadmap',
	map3DEnabled: false,
	filters: {
		oversized: false,
		undersized: false,
		over150: false,
		under100: false,
		searchTerm: '',
	},
	setElectionId: (id) => set({electionId: id}),
	setNodeId: (id) => set({nodeId: id}),
	setAssemblyId: (id) => set({assemblyId: id}),
	setBoothId: (id) => set({boothId: id}),
	setScopeType: (type) => set({scopeType: type}),
	setSelectedVersion: (version) => set({selectedVersion: version}),
	setJobId: (id) => set({jobId: id}),
	setPdfJobId: (id) => set({pdfJobId: id}),
	setSelectedSegmentId: (id) => set({selectedSegmentId: id}),
	toggleLeftSidebar: () => set((state) => ({leftSidebarCollapsed: !state.leftSidebarCollapsed})),
	toggleRightSidebar: () => set((state) => ({rightSidebarCollapsed: !state.rightSidebarCollapsed})),
	toggleLayer: (layer) => set((state) => ({layers: {...state.layers, [layer]: !state.layers[layer]}})),
	updateFilter: (filter, value) => set((state) => ({filters: {...state.filters, [filter]: value}})),
	setMapType: (mapType) => set({mapType}),
	setMap3DEnabled: (map3DEnabled) => set({map3DEnabled}),
}));
