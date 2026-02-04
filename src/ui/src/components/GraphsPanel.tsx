import {Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Segment} from '../types/api';
import {getSegmentFamilyCount, getSegmentHash, getSegmentVoterCount, getSegmentCode} from '../services/segmentUtils';
import Toggle from './Toggle';
import {useConsoleStore} from '../store/useConsoleStore';

type GraphsPanelProps = {
	segments: Segment[];
	versionSeries: {version: number; segments: number}[];
	compareSegmentsA: Segment[];
	compareSegmentsB: Segment[];
	compareEnabled: boolean;
};

const buildDistribution = (segments: Segment[]) => {
	return segments.map((segment) => ({
		name: segment.segment_code ?? segment.segment_name ?? segment.id,
		size: getSegmentVoterCount(segment),
	}));
};

const buildBuckets = (segments: Segment[]) => {
	const buckets = [
		{label: '80-100', min: 80, max: 100, count: 0},
		{label: '100-120', min: 100, max: 120, count: 0},
		{label: '120-150', min: 120, max: 150, count: 0},
	];
	segments.forEach((segment) => {
		const size = getSegmentVoterCount(segment);
		buckets.forEach((bucket) => {
			if (size >= bucket.min && size < bucket.max) bucket.count += 1;
		});
	});
	return buckets.map((bucket) => ({name: bucket.label, value: bucket.count}));
};

const buildFamilyHistogram = (segments: Segment[]) => {
	const counts: Record<string, number> = {};
	segments.forEach((segment) => {
		const size = getSegmentFamilyCount(segment);
		const bucket = `${Math.floor(size / 5) * 5}-${Math.floor(size / 5) * 5 + 4}`;
		counts[bucket] = (counts[bucket] ?? 0) + 1;
	});
	return Object.entries(counts).map(([bucket, count]) => ({bucket, count}));
};

const buildHistogram = (segments: Segment[], bucketSize = 10) => {
	const sizes = segments.map((segment) => getSegmentVoterCount(segment));
	if (!sizes.length) return [];
	const max = Math.max(...sizes);
	const buckets = Math.max(1, Math.ceil(max / bucketSize));
	return Array.from({length: buckets}, (_, index) => {
		const min = index * bucketSize;
		const maxValue = min + bucketSize;
		const count = sizes.filter((value) => value >= min && value < maxValue).length;
		return {range: `${min}-${maxValue - 1}`, count};
	});
};

const buildComparisonDiff = (baseSegments: Segment[], compareSegments: Segment[]) => {
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
	return [
		{name: 'Segment count diff', value: compareSegments.length - baseSegments.length},
		{name: 'Voter redistribution', value: voterDiff},
		{name: 'Hash differences', value: hashDiff},
	];
};

const GraphsPanel = ({segments, versionSeries, compareSegmentsA, compareSegmentsB, compareEnabled}: GraphsPanelProps) => {
	const {showHeatmap, setShowHeatmap} = useConsoleStore();
	const distribution = buildDistribution(segments);
	const buckets = buildBuckets(segments);
	const familyHistogram = buildFamilyHistogram(segments);
	const sizeHistogram = buildHistogram(segments, 10);
	const comparisonDiff = compareEnabled ? buildComparisonDiff(compareSegmentsA, compareSegmentsB) : [];

	return (
		<div className='grid grid-cols-1 gap-4'>
			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Voter Density Heatmap</div>
				<div className='flex items-center justify-between gap-3 text-sm'>
					<div className='text-slate-300'>Toggle heatmap layer on the map.</div>
					<Toggle label='Heatmap' checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Segment Size Distribution</div>
				<div className='h-52'>
					<ResponsiveContainer width='100%' height='100%'>
						<BarChart data={distribution}>
							<CartesianGrid stroke='#1f2937' />
							<XAxis dataKey='name' hide />
							<YAxis />
							<Tooltip />
							<Bar dataKey='size' fill='#38bdf8' />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Segment Size Histogram</div>
				<div className='h-52'>
					<ResponsiveContainer width='100%' height='100%'>
						<BarChart data={sizeHistogram}>
							<CartesianGrid stroke='#1f2937' />
							<XAxis dataKey='range' hide={sizeHistogram.length > 12} />
							<YAxis />
							<Tooltip />
							<Bar dataKey='count' fill='#f97316' />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Version Comparison</div>
				<div className='h-52'>
					<ResponsiveContainer width='100%' height='100%'>
						<LineChart data={versionSeries}>
							<CartesianGrid stroke='#1f2937' />
							<XAxis dataKey='version' />
							<YAxis />
							<Tooltip />
							<Legend />
							<Line type='monotone' dataKey='segments' stroke='#22d3ee' />
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Version Diff Summary</div>
				{compareEnabled ? (
					<div className='h-48'>
						<ResponsiveContainer width='100%' height='100%'>
							<BarChart data={comparisonDiff}>
								<CartesianGrid stroke='#1f2937' />
								<XAxis dataKey='name' />
								<YAxis />
								<Tooltip />
								<Bar dataKey='value' fill='#22d3ee' />
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : (
					<div className='text-xs text-slate-400'>Enable comparison mode to view diff summary.</div>
				)}
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Segment Size Buckets</div>
				<div className='h-52'>
					<ResponsiveContainer width='100%' height='100%'>
						<PieChart>
							<Pie data={buckets} dataKey='value' nameKey='name' fill='#f472b6' label />
							<Tooltip />
						</PieChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title mb-2'>Family Size Histogram</div>
				<div className='h-52'>
					<ResponsiveContainer width='100%' height='100%'>
						<BarChart data={familyHistogram}>
							<CartesianGrid stroke='#1f2937' />
							<XAxis dataKey='bucket' />
							<YAxis />
							<Tooltip />
							<Bar dataKey='count' fill='#4ade80' />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
};

export default GraphsPanel;
