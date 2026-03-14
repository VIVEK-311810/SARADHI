module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  transformIgnorePatterns: ['/node_modules/'],
  // Timeout for async tests
  testTimeout: 10000,
};
