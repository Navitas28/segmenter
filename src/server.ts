import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {jobRoutes} from './routes/jobRoutes.js';
import {apiRoutes} from './routes/apiRoutes.js';

export function createServer() {
	const app = express();
	app.use(express.json({limit: '2mb'}));

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	// API routes
	app.use(jobRoutes);
	app.use(apiRoutes);

	// Serve static files from the built frontend
	const uiPath = path.join(__dirname, 'ui');
	app.use(express.static(uiPath));

	// SPA fallback - serve index.html for all non-API routes
	app.get('*', (_req, res) => {
		res.sendFile(path.join(uiPath, 'index.html'));
	});

	return app;
}
