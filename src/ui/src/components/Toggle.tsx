type ToggleProps = {
	label: string;
	checked: boolean;
	onChange: () => void;
};

const Toggle = ({label, checked, onChange}: ToggleProps) => (
	<label className='flex items-center justify-between gap-3 text-sm'>
		<span>{label}</span>
		<button type='button' onClick={onChange} className={`h-6 w-12 rounded-full border transition ${checked ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-800 border-slate-700'}`}>
			<span className={`block h-5 w-5 rounded-full bg-slate-100 transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
		</button>
	</label>
);

export default Toggle;
