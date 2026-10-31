const base = require('./jest.config');

// Only the tests that talk to a real database (see TEST_DATABASE_URL in the test files).
module.exports = {
    ...base,
    testMatch: ['**/*.integration.test.ts'],
    testPathIgnorePatterns: ['/node_modules/']
};
