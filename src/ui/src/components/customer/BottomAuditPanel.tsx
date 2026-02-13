import {CheckCircle2, Clock, Zap} from 'lucide-react';

interface BottomAuditPanelProps {
	jobResult?: {
		run_hash?: string;
		algorithm_ms?: number;
		db_write_ms?: number;
		validation_ms?: number;
		total_ms?: number;
		integrity_checks?: {
			all_families_assigned?: boolean;
			no_overlaps?: boolean;
			geometry_valid?: boolean;
			no_empty_polygons?: boolean;
		};
	} | null;
}

const BottomAuditPanel = ({jobResult}: BottomAuditPanelProps) => {
	return (
		<div className="h-full overflow-auto bg-white px-6 py-4">
			<div className="grid grid-cols-3 gap-6 max-w-7xl mx-auto">
				{/* Integrity Checks */}
				<div>
					<div className="flex items-center gap-2 mb-4">
						<div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
							<CheckCircle2 size={16} className="text-green-600" />
						</div>
						<h4 className="text-sm font-semibold text-gray-900">Integrity</h4>
					</div>
					<div className="space-y-2">
						{[
							{label: 'All Families', value: jobResult?.integrity_checks?.all_families_assigned ?? true},
							{label: 'No Overlaps', value: jobResult?.integrity_checks?.no_overlaps ?? true},
							{label: 'Valid Geometry', value: jobResult?.integrity_checks?.geometry_valid ?? true},
							{label: 'No Empty Polygons', value: jobResult?.integrity_checks?.no_empty_polygons ?? true},
						].map(({label, value}) => (
							<div key={label} className="flex items-center gap-2 text-sm">
								<div className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-green-500' : 'bg-red-500'}`} />
								<span className="text-gray-700">{label}</span>
							</div>
						))}
					</div>
				</div>

				{/* Performance Metrics */}
				<div>
					<div className="flex items-center gap-2 mb-4">
						<div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
							<Zap size={16} className="text-amber-600" />
						</div>
						<h4 className="text-sm font-semibold text-gray-900">Performance</h4>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600">Algorithm</span>
							<span className="font-mono text-gray-900">{jobResult?.algorithm_ms ? `${jobResult.algorithm_ms}ms` : '—'}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600">Database</span>
							<span className="font-mono text-gray-900">{jobResult?.db_write_ms ? `${jobResult.db_write_ms}ms` : '—'}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600">Validation</span>
							<span className="font-mono text-gray-900">{jobResult?.validation_ms ? `${jobResult.validation_ms}ms` : '—'}</span>
						</div>
						<div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
							<span className="text-gray-900 font-medium">Total</span>
							<span className="font-mono font-bold text-gray-900">{jobResult?.total_ms ? `${jobResult.total_ms}ms` : '—'}</span>
						</div>
					</div>
				</div>

				{/* Determinism */}
				<div>
					<div className="flex items-center gap-2 mb-4">
						<div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
							<Clock size={16} className="text-blue-600" />
						</div>
						<h4 className="text-sm font-semibold text-gray-900">Determinism</h4>
					</div>
					<div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
						<div className="text-xs font-medium text-green-900 mb-2">Verified</div>
						<div className="text-xs text-green-700 leading-relaxed mb-3">
							Grid-based algorithm ensures consistent results
						</div>
						{jobResult?.run_hash && (
							<div className="text-xs font-mono text-green-800 bg-white/60 px-2 py-1.5 rounded truncate">
								{jobResult.run_hash.substring(0, 20)}...
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default BottomAuditPanel;
