/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    // `cookie` (via fastify's light-my-request) is ESM-only; Jest can't require() ESM before Node 24.9.
    '^.+/node_modules/cookie/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true }, diagnostics: false }],
  },
  transformIgnorePatterns: ['/node_modules/(?!cookie/)'],
};
