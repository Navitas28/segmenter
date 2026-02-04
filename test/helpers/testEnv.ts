type TestGlobals = typeof globalThis & {
	__TEST_DB_URL__?: string;
};

export function getTestDbUrl(): string {
	const globals = globalThis as TestGlobals;
	if (!globals.__TEST_DB_URL__) {
		throw new Error('Test database URL not initialized');
	}
	return globals.__TEST_DB_URL__;
}

export function initTestEnv(): void {
	process.env.DATABASE_URL = getTestDbUrl();
	process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
	process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key';
	process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
}
