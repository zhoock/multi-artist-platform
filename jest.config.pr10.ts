/**
 * Jest configuration for PR-10 subscription E2E integration tests.
 * @see docs/adr/pr-10-e2e-specification.md §3, §8
 */

import type { Config } from 'jest';

const sharedModuleNameMapper = {
  '^(\\.{1,2}/.*)\\.js$': '$1',
  '\\.(css|scss)$': 'identity-obj-proxy',
  '\\.(jpg|jpeg|png|gif|svg|webp|avif)$': '<rootDir>/__mocks__/fileMock.js',
  '^@/(.*)$': '<rootDir>/src/$1',
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@entities/(.*)$': '<rootDir>/src/entities/$1',
  '^@features/(.*)$': '<rootDir>/src/features/$1',
  '^@widgets/(.*)$': '<rootDir>/src/widgets/$1',
  '^@pages/(.*)$': '<rootDir>/src/pages/$1',
  '^@app/(.*)$': '<rootDir>/src/app/$1',
  '^@routes/(.*)$': '<rootDir>/src/routes/$1',
  '^@audio/(.*)$': '<rootDir>/src/audio/$1',
  '^@models$': '<rootDir>/src/models',
  '^@models/(.*)$': '<rootDir>/src/models/$1',
  '^@config$': '<rootDir>/src/config',
  '^@config/(.*)$': '<rootDir>/src/config/$1',
};

const tier1Shared: Config = {
  preset: 'ts-jest',
  collectCoverage: false,
  moduleNameMapper: sharedModuleNameMapper,
  transformIgnorePatterns: ['/node_modules/', '\\.pnp\\.[^\\/]+$'],
  testMatch: [
    '**/netlify/functions/lib/__tests__/integration/tier1-backend/**/*.integration.test.ts',
  ],
  maxWorkers: 1,
  testEnvironment: 'node',
};

const tier3Shared: Config = {
  ...tier1Shared,
  testMatch: [
    '**/netlify/functions/lib/__tests__/integration/tier3-smoke/**/*.integration.test.ts',
  ],
};

const tier2Ui: Config = {
  preset: 'ts-jest',
  collectCoverage: false,
  moduleNameMapper: sharedModuleNameMapper,
  transformIgnorePatterns: ['/node_modules/', '\\.pnp\\.[^\\/]+$'],
  testMatch: ['**/netlify/functions/lib/__tests__/integration/tier2-ui/**/*.integration.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
};

const config: Config = {
  maxWorkers: 1,
  projects: [
    {
      displayName: 'tier1-flag-off',
      ...tier1Shared,
      setupFiles: ['<rootDir>/netlify/functions/lib/__tests__/helpers/jest.env.tier1-flag-off.ts'],
    },
    {
      displayName: 'tier1-flag-on',
      ...tier1Shared,
      setupFiles: ['<rootDir>/netlify/functions/lib/__tests__/helpers/jest.env.tier1-flag-on.ts'],
    },
    {
      displayName: 'tier2-ui',
      ...tier2Ui,
    },
    {
      displayName: 'tier3-smoke',
      ...tier3Shared,
      setupFiles: ['<rootDir>/netlify/functions/lib/__tests__/helpers/jest.env.tier1-flag-on.ts'],
    },
  ],
};

export default config;
