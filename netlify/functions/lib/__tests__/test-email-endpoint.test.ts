import { isTestEmailEndpointEnabled } from '../test-email-endpoint';

describe('isTestEmailEndpointEnabled', () => {
  const envKeys = ['CONTEXT', 'NODE_ENV', 'NETLIFY_DEV'] as const;
  const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('is disabled on Netlify production deploy context', () => {
    process.env.CONTEXT = 'production';
    process.env.NETLIFY_DEV = 'true';
    expect(isTestEmailEndpointEnabled()).toBe(false);
  });

  it('is disabled in production Node without Netlify Dev', () => {
    process.env.NODE_ENV = 'production';
    expect(isTestEmailEndpointEnabled()).toBe(false);
  });

  it('is enabled locally with Netlify Dev', () => {
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'development';
    expect(isTestEmailEndpointEnabled()).toBe(true);
  });

  it('is enabled in development Node (jest)', () => {
    process.env.NODE_ENV = 'test';
    expect(isTestEmailEndpointEnabled()).toBe(true);
  });

  it('is disabled on deploy-preview with production Node (typical Netlify)', () => {
    process.env.CONTEXT = 'deploy-preview';
    process.env.NODE_ENV = 'production';
    expect(isTestEmailEndpointEnabled()).toBe(false);
  });
});
