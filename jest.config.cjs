const baseConfig = {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		'^@turf/turf$': '<rootDir>/test/helpers/turfMock.ts',
	},
};

module.exports = {
	projects: [
		{
			...baseConfig,
			displayName: 'unit',
			testMatch: ['<rootDir>/test/segmentation/**/*.test.ts'],
		},
		{
			...baseConfig,
			displayName: 'integration',
			testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
			setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
		},
	],
	collectCoverageFrom: ['src/segmentation/**/*.ts', 'src/services/**/*.ts', 'src/routes/**/*.ts'],
	coverageThreshold: {
		'src/segmentation/**/*.ts': {
			branches: 100,
			functions: 100,
			lines: 100,
			statements: 100,
		},
		global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
		},
	},
};
