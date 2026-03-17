import type {BoothGridDebugSnapshot, Segment} from '../../types/api';
import {findDebugRegionForSegment} from '../../services/debugSnapshot';

type AlgorithmFlowPanelProps = {
	snapshot: BoothGridDebugSnapshot | null;
	selectedSegment: Segment | null;
	currentStep: number | null;
	onStepChange: (step: number | null) => void;
};

const actionClasses: Record<string, string> = {
	seed: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30',
	add_neighbor: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
	skip_exceeds_max: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
	region_rebalance: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
	region_compression: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30',
};

const formatAction = (action: string) => action.replaceAll('_', ' ');

const AlgorithmFlowPanel = ({snapshot, selectedSegment, currentStep, onStepChange}: AlgorithmFlowPanelProps) => {
	if (!snapshot) {
		return (
			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400'>
				Run a single-booth segmentation with `ENABLE_BOOTH_SEGMENT_GRID_DEBUG=true` and open the latest version to replay the full algorithm timeline here.
			</div>
		);
	}

	const selectedCode = selectedSegment?.segment_code ?? selectedSegment?.segment_name ?? selectedSegment?.id ?? null;
	const timeline = snapshot.timeline ?? [];
	const maxStep = timeline.length;
	const visibleStep = maxStep > 0 ? Math.max(1, Math.min(currentStep ?? maxStep, maxStep)) : null;
	const activeTimelineStep = visibleStep !== null ? timeline[visibleStep - 1] ?? null : null;
	const timelineRegion = activeTimelineStep?.focus_region_id
		? snapshot.regions.find((region) => region.region_id === activeTimelineStep.focus_region_id) ?? null
		: null;
	const selectedRegion = findDebugRegionForSegment(snapshot, selectedSegment);
	const detailRegion = timelineRegion ?? selectedRegion;
	const growthStep =
		detailRegion && activeTimelineStep?.focus_cell_id
			? detailRegion.growth_steps.find(
					(step) =>
						step.cell_id === activeTimelineStep.focus_cell_id &&
						step.from_cell_id === activeTimelineStep.from_cell_id &&
						step.action === activeTimelineStep.growth_action,
			  ) ?? null
			: null;
	const rebalanceTransfer =
		detailRegion && activeTimelineStep?.stage === 'region_rebalance' && activeTimelineStep.focus_cell_id
			? detailRegion.rebalanced_transfers.find(
					(transfer) =>
						transfer.cell_id === activeTimelineStep.focus_cell_id &&
						transfer.from_cell_id === activeTimelineStep.from_cell_id,
			  ) ?? null
			: null;
	const compressionTransfer =
		detailRegion && activeTimelineStep?.stage === 'region_compression' && activeTimelineStep.focus_cell_id
			? detailRegion.compression_transfers.find(
					(transfer) =>
						transfer.cell_id === activeTimelineStep.focus_cell_id &&
						transfer.from_cell_id === activeTimelineStep.from_cell_id,
			  ) ?? null
			: null;

	return (
		<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-200'>
			<div className='panel-title'>Algorithm Flow</div>
			<div className='mt-2 grid grid-cols-2 gap-2 text-slate-300'>
				<div>Snapshot version: {snapshot.version}</div>
				<div>Booth count: {snapshot.booth_ids.length}</div>
				<div>Grid cells: {snapshot.grid_cells.features.length}</div>
				<div>Regions: {snapshot.regions.length}</div>
				<div>Families: {snapshot.family_points.features.length}</div>
				<div>Voters: {snapshot.voter_points.features.length}</div>
			</div>
			<div className='mt-3 rounded-md border border-slate-800 bg-slate-950/40 p-3'>
				<div className='font-semibold text-slate-100'>
					{selectedCode ? `Selected segment: ${selectedCode}` : 'Algorithm replay'}
				</div>
				{activeTimelineStep ? (
					<>
						<div className='mt-3 rounded-md border border-slate-800 bg-slate-900/60 p-3'>
							<div className='flex items-center justify-between gap-3'>
								<div>
									<div className='text-[11px] uppercase tracking-wide text-slate-500'>Timeline</div>
									<div className='text-sm text-slate-200'>
										Showing step {visibleStep} of {maxStep}
									</div>
								</div>
								<button
									type='button'
									className='rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800'
									onClick={() => onStepChange(maxStep)}
								>
									Jump to final state
								</button>
							</div>
							<input
									type='range'
									min={1}
									max={maxStep}
									step={1}
									value={visibleStep ?? 1}
									onChange={(event) => onStepChange(Number(event.target.value))}
									className='mt-3 w-full accent-cyan-400'
								/>
							<div className='mt-2 flex justify-between text-[11px] text-slate-500'>
								<span>scope</span>
								<span>{activeTimelineStep.stage.replaceAll('_', ' ')}</span>
								<span>{maxStep}</span>
							</div>
						</div>
						<div className='mt-3 rounded-md border border-slate-800 bg-slate-900/60 p-3'>
							<div className='text-[11px] uppercase tracking-wide text-slate-500'>Current stage</div>
							<div className='mt-1 text-sm font-semibold text-slate-100'>{activeTimelineStep.title}</div>
							<div className='mt-1 text-slate-400'>{activeTimelineStep.description}</div>
							<div className='mt-3 grid grid-cols-2 gap-2 text-slate-400'>
								<div>Visible cells: {activeTimelineStep.visible_cell_ids.length}</div>
								<div>Visible regions: {activeTimelineStep.visible_region_ids.length}</div>
								<div>Visible segments: {activeTimelineStep.visible_segment_codes.length}</div>
								<div>Highlighted families: {activeTimelineStep.highlighted_unit_ids.length}</div>
							</div>
						</div>
						{detailRegion ? (
							<>
								<div className='mt-2 grid grid-cols-2 gap-2 text-slate-400'>
									<div>Region: {detailRegion.region_id}</div>
									<div>Seed cell: {detailRegion.seed_cell_id}</div>
									<div>Voters: {detailRegion.voter_count}</div>
									<div>Families: {detailRegion.unit_ids.length}</div>
								</div>
								{growthStep ? (
									<div className='mt-3 rounded-md border border-slate-800 bg-slate-950/50 p-2'>
										<div className='flex items-center justify-between gap-2'>
											<span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionClasses[growthStep.action] ?? 'bg-slate-700 text-slate-200 border-slate-600'}`}>
												{formatAction(growthStep.action)}
											</span>
											<span className='text-slate-500'>region step {growthStep.step}</span>
										</div>
										<div className='mt-2 text-slate-300'>
											Cell {growthStep.cell_id}
											{growthStep.from_cell_id ? ` from ${growthStep.from_cell_id}` : ''}
										</div>
										<div className='mt-1 text-slate-500'>
											Cell voters: {growthStep.cell_voter_count} • running total: {growthStep.running_voter_count} • projected: {growthStep.projected_voter_count}
										</div>
									</div>
								) : null}
								{rebalanceTransfer ? (
									<div className='mt-3 rounded-md border border-slate-800 bg-slate-950/50 p-2'>
										<div className='flex items-center justify-between gap-2'>
											<span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionClasses.region_rebalance}`}>
												Rebalance transfer
											</span>
											<span className='text-slate-500'>transfer {rebalanceTransfer.order}</span>
										</div>
										<div className='mt-2 text-slate-300'>
											Cell {rebalanceTransfer.cell_id} pulled from {rebalanceTransfer.donor_region_id}
										</div>
										<div className='mt-1 text-slate-500'>
											Target total: {rebalanceTransfer.running_voter_count} • donor total: {rebalanceTransfer.donor_voter_count} • moved voters: {rebalanceTransfer.cell_voter_count}
										</div>
									</div>
								) : null}
								{compressionTransfer ? (
									<div className='mt-3 rounded-md border border-slate-800 bg-slate-950/50 p-2'>
										<div className='flex items-center justify-between gap-2'>
											<span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionClasses.region_compression}`}>
												Global compression
											</span>
											<span className='text-slate-500'>transfer {compressionTransfer.order}</span>
										</div>
										<div className='mt-2 text-slate-300'>
											Cell {compressionTransfer.cell_id} moved from {compressionTransfer.source_region_id}
										</div>
										<div className='mt-1 text-slate-500'>
											Target total: {compressionTransfer.target_voter_count} • source total: {compressionTransfer.source_voter_count} • moved voters: {compressionTransfer.cell_voter_count}
										</div>
										{compressionTransfer.source_eliminated ? <div className='mt-1 text-fuchsia-300'>This move fully eliminated the source region.</div> : null}
									</div>
								) : null}
								{detailRegion.merged_from_region_ids.length ? <div className='mt-3 text-slate-400'>Merged undersized regions: {detailRegion.merged_from_region_ids.join(', ')}</div> : null}
								{detailRegion.rebalanced_transfers.length ? <div className='mt-1 text-slate-400'>Boundary rebalances: {detailRegion.rebalanced_transfers.length}</div> : null}
								{detailRegion.compression_transfers.length ? <div className='mt-1 text-slate-400'>Compression moves: {detailRegion.compression_transfers.length}</div> : null}
								{detailRegion.empty_fill_assignments.length ? <div className='mt-1 text-slate-400'>Empty grid fills: {detailRegion.empty_fill_assignments.length}</div> : null}
							</>
						) : (
							<div className='mt-3 text-slate-400'>No region is in focus for this algorithm step.</div>
						)}
					</>
				) : (
					<div className='mt-2 text-slate-400'>The debug snapshot is available, but it has no timeline steps yet.</div>
				)}
			</div>
		</div>
	);
};

export default AlgorithmFlowPanel;
