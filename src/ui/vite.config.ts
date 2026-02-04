import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode}) => {
	const env = loadEnv(mode, process.cwd(), '');
	const rawTarget = env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://localhost:3000';
	const apiTarget = rawTarget.startsWith('/') ? 'http://localhost:3000' : rawTarget;

	return {
		plugins: [react()],
		server: {
			port: 5173,
			proxy: {
				'/api': {
					target: apiTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ''),
				},
			},
		},
	};
});
