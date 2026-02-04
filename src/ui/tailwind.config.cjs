module.exports = {
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas'],
			},
			colors: {
				panel: '#111827',
				panelBorder: '#1f2937',
				primary: '#22d3ee',
				secondary: '#38bdf8',
			},
		},
	},
	plugins: [],
};
