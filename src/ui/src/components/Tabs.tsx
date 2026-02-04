type TabsProps = {
	tabs: string[];
	active: string;
	onChange: (value: string) => void;
};

const Tabs = ({tabs, active, onChange}: TabsProps) => (
	<div className='flex flex-wrap gap-2'>
		{tabs.map((tab) => (
			<button
				key={tab}
				type='button'
				onClick={() => onChange(tab)}
				className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${active === tab ? 'bg-cyan-600 text-slate-950 border-cyan-500' : 'bg-slate-800 text-slate-200 border-slate-700'}`}
			>
				{tab}
			</button>
		))}
	</div>
);

export default Tabs;
