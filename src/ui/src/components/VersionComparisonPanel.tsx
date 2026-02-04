import type {Segment} from '../types/api';
import {getSegmentCode, getSegmentHash} from '../services/segmentUtils';

type VersionComparisonPanelProps = {
	baseVersion: number | null;
	compareVersion: number | null;
	baseSegments: Segment[];
	compareSegments: Segment[];
};

const VersionComparisonPanel = ({baseVersion, compareVersion, baseSegments, compareSegments}: VersionComparisonPanelProps) => {
	if (!baseVersion || !compareVersion) {
		return <div className='text-sm text-slate-400'>Select two versions to compare.</div>;
	}

	const baseByCode = new Map(baseSegments.map((segment) => [getSegmentCode(segment), segment]));
	const compareByCode = new Map(compareSegments.map((segment) => [getSegmentCode(segment), segment]));

	let hashDiff = 0;
	let voterDiff = 0;
	const allCodes = new Set([...baseByCode.keys(), ...compareByCode.keys()]);
	allCodes.forEach((code) => {
		const baseSegment = baseByCode.get(code);
		const compareSegment = compareByCode.get(code);
		if (baseSegment && compareSegment) {
			if (getSegmentHash(baseSegment) !== getSegmentHash(compareSegment)) hashDiff += 1;
			const baseVoters = baseSegment.total_voters ?? 0;
			const compareVoters = compareSegment.total_voters ?? 0;
			if (baseVoters !== compareVoters) voterDiff += Math.abs(Number(compareVoters) - Number(baseVoters));
		}
	});

	return (
		<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-sm'>
			<div className='panel-title'>Version Comparison</div>
			<div className='mt-2 space-y-1'>
				<div>
					Base version {baseVersion} vs {compareVersion}
				</div>
				<div>Segment count diff: {compareSegments.length - baseSegments.length}</div>
				<div>Voter redistribution diff: {voterDiff}</div>
				<div>Hash differences: {hashDiff}</div>
				<div className='text-xs text-slate-400'>Overlay enabled on map for comparison segments.</div>
			</div>
		</div>
	);
};

export default VersionComparisonPanel;
