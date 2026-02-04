import {create} from 'zustand';

export type ScopeType = 'AC' | 'BOOTH';

type ConsoleState = {
	electionId: string;
	scopeType: ScopeType;
	nodeId: string;
	boothId: string;
	visualizationMode: 'operational' | 'responsibility' | 'comparison' | 'debug';
	selectedVersion: number | null;
	compareVersionA: number | null;
	compareVersionB: number | null;
	lastJobId: string;
	selectedSegmentId: string | null;
	showRawJson: boolean;
	showHashes: boolean;
	showAuditLogs: boolean;
	showExceptions: boolean;
	showGeometryBounds: boolean;
	highlightFamilies: boolean;
	showBoundaries: boolean;
	showAllBoundaries: boolean;
	boundaryStyle: 'wedge' | 'bbox' | 'convexhull';
	showVoters: boolean;
	showCentroids: boolean;
	showHeatmap: boolean;
	showRawGeometry: boolean;
	showCentroidCoords: boolean;
	showBoundingBoxes: boolean;
	showClusteringIndex: boolean;
	setElectionId: (value: string) => void;
	setScopeType: (value: ScopeType) => void;
	setNodeId: (value: string) => void;
	setBoothId: (value: string) => void;
	setVisualizationMode: (value: ConsoleState['visualizationMode']) => void;
	setSelectedVersion: (value: number | null) => void;
	setCompareVersionA: (value: number | null) => void;
	setCompareVersionB: (value: number | null) => void;
	setLastJobId: (value: string) => void;
	setSelectedSegmentId: (value: string | null) => void;
	setShowBoundaries: (value: boolean) => void;
	setShowAllBoundaries: (value: boolean) => void;
	setBoundaryStyle: (value: 'wedge' | 'bbox' | 'convexhull') => void;
	setShowVoters: (value: boolean) => void;
	setShowCentroids: (value: boolean) => void;
	setShowHeatmap: (value: boolean) => void;
	setShowGeometryBounds: (value: boolean) => void;
	setShowRawGeometry: (value: boolean) => void;
	setShowCentroidCoords: (value: boolean) => void;
	setShowBoundingBoxes: (value: boolean) => void;
	setShowClusteringIndex: (value: boolean) => void;
	toggle: (key: keyof Pick<ConsoleState, 'showRawJson' | 'showHashes' | 'showAuditLogs' | 'showExceptions'>) => void;
	resetSelection: () => void;
};

const modeDefaults: Record<ConsoleState['visualizationMode'], {showBoundaries: boolean; showVoters: boolean; showCentroids: boolean; showGeometryBounds: boolean}> = {
	operational: {showBoundaries: true, showVoters: true, showCentroids: true, showGeometryBounds: false},
	responsibility: {showBoundaries: true, showVoters: false, showCentroids: true, showGeometryBounds: false},
	comparison: {showBoundaries: true, showVoters: false, showCentroids: true, showGeometryBounds: false},
	debug: {showBoundaries: true, showVoters: true, showCentroids: true, showGeometryBounds: true},
};

export const useConsoleStore = create<ConsoleState>((set) => ({
	electionId: '',
	scopeType: 'AC',
	nodeId: '',
	boothId: '',
	visualizationMode: 'operational',
	selectedVersion: null,
	compareVersionA: null,
	compareVersionB: null,
	lastJobId: '',
	selectedSegmentId: null,
	showRawJson: false,
	showHashes: true,
	showAuditLogs: true,
	showExceptions: true,
	showGeometryBounds: false,
	highlightFamilies: false,
	showBoundaries: false,
	showAllBoundaries: false,
	boundaryStyle: 'wedge',
	showVoters: true,
	showCentroids: true,
	showHeatmap: false,
	showRawGeometry: false,
	showCentroidCoords: false,
	showBoundingBoxes: false,
	showClusteringIndex: false,
	setElectionId: (value) => set({electionId: value, nodeId: '', boothId: '', selectedVersion: null}),
	setScopeType: (value) => set({scopeType: value, nodeId: '', boothId: '', selectedVersion: null}),
	setNodeId: (value) => set({nodeId: value, selectedVersion: null}),
	setBoothId: (value) => set({boothId: value, selectedVersion: null}),
	setVisualizationMode: (value) =>
		set((state) => ({
			visualizationMode: value,
			showBoundaries: modeDefaults[value].showBoundaries,
			showVoters: modeDefaults[value].showVoters,
			showCentroids: modeDefaults[value].showCentroids,
			showGeometryBounds: modeDefaults[value].showGeometryBounds,
			showHeatmap: value === 'debug' ? state.showHeatmap : false,
		})),
	setSelectedVersion: (value) => set({selectedVersion: value}),
	setCompareVersionA: (value) => set({compareVersionA: value}),
	setCompareVersionB: (value) => set({compareVersionB: value}),
	setLastJobId: (value) => set({lastJobId: value}),
	setSelectedSegmentId: (value) => set({selectedSegmentId: value}),
	setShowBoundaries: (value) => set({showBoundaries: value}),
	setShowAllBoundaries: (value) => set({showAllBoundaries: value}),
	setBoundaryStyle: (value) => set({boundaryStyle: value}),
	setShowVoters: (value) => set({showVoters: value}),
	setShowCentroids: (value) => set({showCentroids: value}),
	setShowHeatmap: (value) => set({showHeatmap: value}),
	setShowGeometryBounds: (value) => set({showGeometryBounds: value}),
	setShowRawGeometry: (value) => set({showRawGeometry: value}),
	setShowCentroidCoords: (value) => set({showCentroidCoords: value}),
	setShowBoundingBoxes: (value) => set({showBoundingBoxes: value}),
	setShowClusteringIndex: (value) => set({showClusteringIndex: value}),
	toggle: (key) => set((state) => ({[key]: !state[key]})),
	resetSelection: () => set({selectedSegmentId: null}),
}));
