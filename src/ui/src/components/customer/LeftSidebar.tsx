import {Search, ChevronLeft, ChevronRight} from 'lucide-react';
import {useCustomerStore} from '../../store/useCustomerStore';

const LeftSidebar = () => {
	const {layers, filters, leftSidebarCollapsed, toggleLayer, updateFilter, toggleLeftSidebar} = useCustomerStore();

	if (leftSidebarCollapsed) {
		return (
			<div className="w-12 bg-white border-r border-gray-200 flex flex-col">
				<button
					type="button"
					onClick={toggleLeftSidebar}
					className="h-12 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
					title="Expand sidebar"
				>
					<ChevronRight size={16} />
				</button>
			</div>
		);
	}

	return (
		<div className="w-72 bg-white border-r border-gray-200 flex flex-col">
			{/* Header */}
			<div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
				<span className="text-sm font-medium text-gray-900">Controls</span>
				<button
					type="button"
					onClick={toggleLeftSidebar}
					className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
					title="Collapse sidebar"
				>
					<ChevronLeft size={16} />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-6">
				{/* Layers Section */}
				<div>
					<h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Layers</h3>
					<div className="space-y-1">
						{[
							{key: 'boundaries', label: 'Segment boundaries'},
							{key: 'labels', label: 'Segment numbers on map'},
							{key: 'centroids', label: 'Segment centroids'},
							{key: 'dimMap', label: 'Highlight segments (strong colors)'},
							{key: 'showVoters', label: 'Show voters (lat/lng)'},
							{key: 'geohash', label: 'GeoHash tiles (debug)'},
							{key: 'families', label: 'Families (debug)'},
							{key: 'exceptionsOnly', label: 'Exceptions only (debug)'},
							{key: 'previousVersion', label: 'Previous version overlay'},
						].map(({key, label}) => (
							<label key={key} className="flex items-center gap-3 h-9 px-2 cursor-pointer hover:bg-gray-50 rounded-md transition-colors group">
								<input
									type="checkbox"
									checked={layers[key as keyof typeof layers]}
									onChange={() => toggleLayer(key as keyof typeof layers)}
									className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 transition-all"
								/>
								<span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
							</label>
						))}
					</div>
				</div>

				{/* Filters Section */}
				<div>
					<h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Filters</h3>
					<div className="space-y-1">
						{[
							{key: 'oversized', label: 'Oversized'},
							{key: 'undersized', label: 'Undersized'},
							{key: 'over150', label: '> 150 Voters'},
							{key: 'under100', label: '< 100 Voters'},
						].map(({key, label}) => (
							<label key={key} className="flex items-center gap-3 h-9 px-2 cursor-pointer hover:bg-gray-50 rounded-md transition-colors group">
								<input
									type="checkbox"
									checked={filters[key as keyof typeof filters] as boolean}
									onChange={() => updateFilter(key as keyof typeof filters, !filters[key as keyof typeof filters])}
									className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 transition-all"
								/>
								<span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
							</label>
						))}
					</div>
				</div>

				{/* Search Section */}
				<div>
					<h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Search</h3>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
						<input
							type="text"
							placeholder="Search segments..."
							value={filters.searchTerm}
							onChange={(e) => updateFilter('searchTerm', e.target.value)}
							className="w-full h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LeftSidebar;
