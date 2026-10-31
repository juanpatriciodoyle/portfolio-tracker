module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    setupFiles: ['<rootDir>/jest.setup.js'],
    // Integration tests need a real database; run them with `npm run test:integration`.
    testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true
};
