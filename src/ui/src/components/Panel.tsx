import type {ReactNode} from 'react';

type PanelProps = {
	title: string;
	children: ReactNode;
	actions?: ReactNode;
};

const Panel = ({title, children, actions}: PanelProps) => (
	<section className='panel space-y-3'>
		<div className='flex items-start justify-between gap-2'>
			<h2 className='panel-title'>{title}</h2>
			{actions}
		</div>
		{children}
	</section>
);

export default Panel;
