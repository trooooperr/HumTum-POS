module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/test/**/*.test.js'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/test/**',
    '!src/models/**',
  ],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
