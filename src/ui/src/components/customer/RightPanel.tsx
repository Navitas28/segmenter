import {useState} from 'react';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {Save, Users, Home, ChevronLeft, ChevronRight, Edit3, X, List, Ruler} from 'lucide-react';
import {updateSegment} from '../../services/api';
import {useCustomerStore} from '../../store/useCustomerStore';
import type {Segment} from '../../types/api';

interface RightPanelProps {
	segments: Segment[];
	selectedSegment: Segment | null;
}

const RightPanel = ({segments, selectedSegment}: RightPanelProps) => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const {rightSidebarCollapsed, toggleRightSidebar} = useCustomerStore();
	const [displayName, setDisplayName] = useState('');
	const [description, setDescription] = useState('');
	const [isEditing, setIsEditing] = useState(false);

	const updateSegmentMutation = useMutation({
		mutationFn: ({segmentId, payload}: {segmentId: string; payload: {display_name?: string; description?: string}}) =>
			updateSegment(segmentId, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({queryKey: ['segments']});
			setIsEditing(false);
		},
	});

	const handleEdit = () => {
		if (selectedSegment) {
			setDisplayName(selectedSegment.display_name ?? selectedSegment.segment_name ?? '');
			setDescription(selectedSegment.description ?? '');
			setIsEditing(true);
		}
	};

	const handleSave = () => {
		if (!selectedSegment) return;
		updateSegmentMutation.mutate({
			segmentId: selectedSegment.id,
			payload: {display_name: displayName, description},
		});
	};

	const handleCancel = () => {
		setIsEditing(false);
		setDisplayName('');
		setDescription('');
	};

	const formatArea = (areaSqM: number | null | undefined) => {
		if (areaSqM == null || Number.isNaN(areaSqM)) return null;
		const km2 = areaSqM / 1_000_000;
		return `${km2.toFixed(2)} sq km`;
	};

	// Calculate statistics
	const totalVoters = segments.reduce((sum, s) => sum + (s.total_voters ?? 0), 0);
	const totalFamilies = segments.reduce((sum, s) => sum + (s.total_families ?? 0), 0);
	const avgVoters = segments.length > 0 ? Math.round(totalVoters / segments.length) : 0;
	const voterCounts = segments.map((s) => s.total_voters ?? 0);
	const minVoters = voterCounts.length > 0 ? Math.min(...voterCounts) : 0;
	const maxVoters = voterCounts.length > 0 ? Math.max(...voterCounts) : 0;

	if (rightSidebarCollapsed) {
		return (
			<div className="w-12 bg-white border-l border-gray-200 flex flex-col">
				<button
					type="button"
					onClick={toggleRightSidebar}
					className="h-12 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
					title="Expand sidebar"
				>
					<ChevronLeft size={16} />
				</button>
			</div>
		);
	}

	return (
		<div className="w-80 bg-white border-l border-gray-200 flex flex-col">
			{/* Header */}
			<div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
				<span className="text-sm font-medium text-gray-900">{selectedSegment ? 'Segment' : 'Summary'}</span>
				<button
					type="button"
					onClick={toggleRightSidebar}
					className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
					title="Collapse sidebar"
				>
					<ChevronRight size={16} />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4">
				{!selectedSegment ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl">
								<div className="text-2xl font-bold text-blue-900">{segments.length}</div>
								<div className="text-xs text-blue-700 mt-1">Segments</div>
							</div>
							<div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
								<div className="text-2xl font-bold text-green-900">{totalVoters.toLocaleString()}</div>
								<div className="text-xs text-green-700 mt-1">Voters</div>
							</div>
							<div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl">
								<div className="text-2xl font-bold text-purple-900">{totalFamilies.toLocaleString()}</div>
								<div className="text-xs text-purple-700 mt-1">Families</div>
							</div>
							<div className="bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-xl">
								<div className="text-2xl font-bold text-amber-900">{avgVoters}</div>
								<div className="text-xs text-amber-700 mt-1">Avg Size</div>
							</div>
						</div>
						<div className="bg-gray-50 p-4 rounded-xl">
							<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Range</div>
							<div className="text-sm font-semibold text-gray-900">
								{minVoters} - {maxVoters} voters
							</div>
						</div>
						{segments.length > 0 && (
							<button
								type="button"
								onClick={() => navigate('/customer/segments-details')}
								className="w-full h-9 flex items-center justify-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
							>
								<List size={14} />
								<span>View all segment details</span>
							</button>
						)}
					</div>
				) : (
					<div className="space-y-4">
						{!isEditing && (
							<button
								type="button"
								onClick={handleEdit}
								className="w-full h-9 flex items-center justify-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
							>
								<Edit3 size={14} />
								<span>Edit Details</span>
							</button>
						)}

						{isEditing ? (
							<div className="space-y-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Name</label>
									<input
										type="text"
										value={displayName}
										onChange={(e) => setDisplayName(e.target.value)}
										className="w-full h-9 px-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Description</label>
									<textarea
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										rows={4}
										className="w-full px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
									/>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={handleSave}
										disabled={updateSegmentMutation.isPending}
										className="flex-1 h-9 px-3 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 rounded-lg transition-all flex items-center justify-center gap-2"
									>
										<Save size={14} />
										<span>Save</span>
									</button>
									<button
										type="button"
										onClick={handleCancel}
										className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
									>
										<X size={16} />
									</button>
								</div>
							</div>
						) : (
							<>
								<div>
									<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Name</div>
									<div className="text-base font-semibold text-gray-900">
										{selectedSegment.display_name ?? selectedSegment.segment_name}
									</div>
								</div>
								{selectedSegment.description && (
									<div>
										<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Description</div>
										<div className="text-sm text-gray-700 leading-relaxed">{selectedSegment.description}</div>
									</div>
								)}
							</>
						)}

						<div className="pt-4 border-t border-gray-100 space-y-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-gray-600">
									<Users size={16} />
									<span className="text-sm">Voters</span>
								</div>
								<span className="text-lg font-bold text-gray-900">{selectedSegment.total_voters}</span>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-gray-600">
									<Home size={16} />
									<span className="text-sm">Families</span>
								</div>
								<span className="text-lg font-bold text-gray-900">{selectedSegment.total_families}</span>
							</div>
						</div>

						{selectedSegment.centroid_lat && selectedSegment.centroid_lng && (
							<div className="bg-gray-50 p-3 rounded-lg">
								<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Coordinates</div>
								<div className="text-xs text-gray-600 font-mono">
									{selectedSegment.centroid_lat.toFixed(6)}, {selectedSegment.centroid_lng.toFixed(6)}
								</div>
							</div>
						)}

						{(selectedSegment.bbox_min_lat != null ||
							selectedSegment.bbox_min_lng != null ||
							selectedSegment.bbox_max_lat != null ||
							selectedSegment.bbox_max_lng != null ||
							selectedSegment.area_sq_m != null) && (
							<div className="bg-gray-50 p-3 rounded-lg space-y-3">
								<div className="flex items-center justify-between">
									<div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Segment size &amp; shape</div>
									<Ruler size={14} className="text-gray-400" />
								</div>

								{selectedSegment.area_sq_m != null && !Number.isNaN(selectedSegment.area_sq_m) && (
									<div className="text-xs text-gray-700 space-y-0.5">
										<div className="font-medium text-gray-600">Approximate ground area</div>
										<div>
											<span className="font-semibold text-gray-900">{formatArea(selectedSegment.area_sq_m)}</span>
											<span className="ml-1 text-[10px] text-gray-500">(shown in square kilometres)</span>
										</div>
									</div>
								)}

								{selectedSegment.bbox_min_lat != null &&
									selectedSegment.bbox_min_lng != null &&
									selectedSegment.bbox_max_lat != null &&
									selectedSegment.bbox_max_lng != null && (
									<div className="text-xs text-gray-700 space-y-1">
										<div className="font-medium text-gray-600">Outer boundary (latitude / longitude in degrees)</div>
										<div className="space-y-0.5 font-mono">
											<div>
												<span className="font-medium text-gray-500">North-most latitude: </span>
												{selectedSegment.bbox_max_lat.toFixed(5)}°
											</div>
											<div>
												<span className="font-medium text-gray-500">South-most latitude: </span>
												{selectedSegment.bbox_min_lat.toFixed(5)}°
											</div>
											<div>
												<span className="font-medium text-gray-500">West-most longitude: </span>
												{selectedSegment.bbox_min_lng.toFixed(5)}°
											</div>
											<div>
												<span className="font-medium text-gray-500">East-most longitude: </span>
												{selectedSegment.bbox_max_lng.toFixed(5)}°
											</div>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default RightPanel;
