type JsonViewerProps = {
	data: unknown;
	title?: string;
	defaultOpen?: boolean;
};

const JsonViewer = ({data, title = 'Raw JSON', defaultOpen = false}: JsonViewerProps) => (
	<details className='rounded-md border border-slate-800 bg-slate-950/40 p-3' open={defaultOpen}>
		<summary className='cursor-pointer text-xs uppercase tracking-wide text-slate-400'>{title}</summary>
		<pre className='mt-2 max-h-80 overflow-auto text-xs text-slate-200'>{JSON.stringify(data, null, 2)}</pre>
	</details>
);

export default JsonViewer;
