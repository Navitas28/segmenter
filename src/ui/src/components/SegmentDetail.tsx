import {useEffect, useMemo, useState} from 'react';
import type {Segment, SegmentMember} from '../types/api';
import {
	getSegmentCentroidLatLng,
	getSegmentCode,
	getSegmentFamilyCount,
	getSegmentFarVoterCount,
	getSegmentHash,
	getSegmentMembers,
	getSegmentMissingBoothLocationCount,
	getSegmentVoterCount,
} from '../services/segmentUtils';
import JsonViewer from './JsonViewer';
import SegmentPreviewMap from './map/SegmentPreviewMap';

type SegmentDetailProps = {
	segment: Segment | null;
};

const PAGE_SIZE = 25;

const renderCellValue = (value: unknown) => {
	if (value === null || value === undefined || value === '') return 'n/a';
	return typeof value === 'string' || typeof value === 'number' ? value : String(value);
};

const SegmentDetail = ({segment}: SegmentDetailProps) => {
	const [page, setPage] = useState(1);

	const members = useMemo(() => (segment ? getSegmentMembers(segment) : []), [segment]);

	useEffect(() => {
		setPage(1);
	}, [segment]);

	const families = useMemo(() => {
		const map = new Map<string, SegmentMember[]>();
		members.forEach((member) => {
			const familyId = member.family_id ?? (member.metadata?.family_id as string | undefined) ?? 'unknown';
			const list = map.get(familyId) ?? [];
			list.push(member);
			map.set(familyId, list);
		});
		return Array.from(map.entries());
	}, [members]);

	const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
	const pagedMembers = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
	const centroid = segment ? getSegmentCentroidLatLng(segment) : null;
	const voterCount = segment ? getSegmentVoterCount(segment) : 0;
	const familyCount = segment ? getSegmentFamilyCount(segment) : 0;
	const farVoterCount = segment ? getSegmentFarVoterCount(segment) : 0;
	const missingBoothLocationCount = segment ? getSegmentMissingBoothLocationCount(segment) : 0;
	const sizeStatus = voterCount > 150 ? 'oversized' : voterCount < 80 ? 'undersized' : 'healthy';
	const sizeStatusLabel = sizeStatus === 'healthy' ? 'Healthy' : sizeStatus === 'undersized' ? 'Below 80' : 'Above 150';
	const sizeStatusClass = sizeStatus === 'healthy' ? 'text-emerald-300' : sizeStatus === 'undersized' ? 'text-amber-300' : 'text-rose-300';

	if (!segment) {
		return <div className='text-sm text-slate-400'>Select a segment to inspect details.</div>;
	}

	return (
		<div className='space-y-4 text-sm'>
			<div className='grid grid-cols-1 gap-3 lg:grid-cols-[1fr,220px]'>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Segment Summary</div>
					<div className='mt-2 grid grid-cols-2 gap-2 text-xs text-slate-200'>
						<div>
							<div className='text-slate-400'>Code</div>
							<div className='font-semibold'>{getSegmentCode(segment)}</div>
						</div>
						<div>
							<div className='text-slate-400'>Version</div>
								<div>{renderCellValue(segment.version ?? segment.metadata?.version)}</div>
						</div>
						<div>
							<div className='text-slate-400'>Voter Count</div>
							<div>{voterCount}</div>
						</div>
						<div>
							<div className='text-slate-400'>Family Count</div>
							<div>{familyCount}</div>
						</div>
						<div className='col-span-2'>
							<div className='text-slate-400'>Hash</div>
							<div className='mono break-all'>{getSegmentHash(segment) ?? 'n/a'}</div>
						</div>
						<div className='col-span-2'>
							<div className='text-slate-400'>Size Status</div>
							<div className={`font-semibold ${sizeStatusClass}`}>{sizeStatusLabel}</div>
						</div>
						<div>
							<div className='text-slate-400'>Voters &gt;= 2 km</div>
							<div className='font-semibold text-rose-300'>{farVoterCount}</div>
						</div>
						<div>
							<div className='text-slate-400'>Booth Location Missing</div>
							<div className='font-semibold text-amber-300'>{missingBoothLocationCount}</div>
						</div>
					</div>
				</div>
				<SegmentPreviewMap segment={segment} />
			</div>

			<div className='grid grid-cols-2 gap-3'>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Segment Hash</div>
					<div className='mono mt-2 break-all'>{getSegmentHash(segment) ?? 'n/a'}</div>
				</div>
				<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
					<div className='panel-title'>Centroid</div>
					<div className='mt-2'>{centroid ? `${centroid.lat.toFixed(5)}, ${centroid.lng.toFixed(5)}` : 'n/a'}</div>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title'>Voter List</div>
				<div className='mt-2 text-xs text-slate-400'>
					{members.length} voters • page {page} of {totalPages}
				</div>
				<div className='mt-2 max-h-60 overflow-auto rounded-md border border-slate-800'>
					<table className='min-w-full text-xs'>
						<thead className='bg-slate-900 text-slate-400'>
							<tr>
								<th className='px-2 py-2 text-left'>Voter ID</th>
								<th className='px-2 py-2 text-left'>Family ID</th>
								<th className='px-2 py-2 text-left'>Booth</th>
								<th className='px-2 py-2 text-left'>Status</th>
								<th className='px-2 py-2 text-left'>Distance</th>
								<th className='px-2 py-2 text-left'>Lat</th>
								<th className='px-2 py-2 text-left'>Lng</th>
							</tr>
						</thead>
						<tbody>
							{pagedMembers.map((member, index) => (
								<tr
									key={`${member.voter_id ?? 'voter'}-${index}`}
									className={`border-t border-slate-800 ${
										member.is_far_from_booth
											? 'bg-rose-950/20'
											: member.booth_location_status === 'missing'
												? 'bg-amber-950/20'
												: ''
									}`}
								>
										<td className='px-2 py-1'>{renderCellValue(member.voter_id ?? member.metadata?.voter_id)}</td>
										<td className='px-2 py-1'>{renderCellValue(member.family_id ?? member.metadata?.family_id)}</td>
										<td className='px-2 py-1'>{renderCellValue(member.booth_name ?? member.booth_number ?? member.booth_id)}</td>
										<td className='px-2 py-1'>
											{member.is_far_from_booth
												? '2 km away'
												: member.booth_location_status === 'missing'
													? 'Booth location unavailable'
													: member.booth_location_status === 'member_location_missing'
														? 'Member location unavailable'
														: 'Normal'}
										</td>
										<td className='px-2 py-1'>
											{member.distance_from_booth_m != null ? `${(Number(member.distance_from_booth_m) / 1000).toFixed(2)} km` : 'n/a'}
										</td>
										<td className='px-2 py-1'>{renderCellValue(member.latitude ?? member.metadata?.latitude)}</td>
										<td className='px-2 py-1'>{renderCellValue(member.longitude ?? member.metadata?.longitude)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className='mt-2 flex items-center gap-2'>
					<button type='button' className='button' onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
						Prev
					</button>
					<button type='button' className='button' onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
						Next
					</button>
				</div>
			</div>

			<div className='rounded-md border border-slate-800 bg-slate-900/60 p-3'>
				<div className='panel-title'>Family Groups</div>
				<div className='mt-2 space-y-2 text-xs text-slate-300'>
					{families.map(([familyId, members]) => (
						<div key={familyId} className='flex items-center justify-between gap-2'>
							<span className='mono'>{familyId}</span>
							<span className='badge'>{members.length} voters</span>
						</div>
					))}
				</div>
			</div>

			<JsonViewer title='Geometry JSON' data={segment.boundary_geojson ?? segment.metadata?.boundary_geojson ?? {}} />
		</div>
	);
};

export default SegmentDetail;
