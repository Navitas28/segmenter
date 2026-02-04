type StateBlockProps = {
	title: string;
	message: string;
	actionLabel?: string;
	onAction?: () => void;
};

const StateBlock = ({title, message, actionLabel, onAction}: StateBlockProps) => (
	<div className='rounded-md border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300'>
		<div className='text-xs uppercase tracking-wide text-slate-500'>{title}</div>
		<p className='mt-1'>{message}</p>
		{actionLabel && onAction ? (
			<button type='button' className='button mt-2' onClick={onAction}>
				{actionLabel}
			</button>
		) : null}
	</div>
);

export default StateBlock;
