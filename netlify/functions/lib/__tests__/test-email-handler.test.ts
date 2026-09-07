import type { HandlerEvent } from '@netlify/functions';

const sendPurchaseEmailMock = jest.fn();

jest.mock('../api-helpers', () => ({
  createOptionsResponse: () => ({ statusCode: 200, headers: {}, body: '' }),
  createErrorResponse: (statusCode: number, error: string) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error }),
  }),
  CORS_HEADERS: {},
  parseJsonBody: (_body: unknown, fallback: object) => fallback,
}));

jest.mock('../email', () => ({
  sendPurchaseEmail: (...args: unknown[]) => sendPurchaseEmailMock(...args),
}));

import { handler } from '../../test-email';

function buildEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/.netlify/functions/test-email',
    rawUrl: '',
    queryStringParameters: { email: 'dev@example.com' },
    ...overrides,
  } as HandlerEvent;
}

describe('test-email handler', () => {
  const envKeys = ['CONTEXT', 'NODE_ENV', 'NETLIFY_DEV'] as const;
  const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    sendPurchaseEmailMock.mockReset();
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NODE_ENV = 'test';
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

  it('returns 404 and does not send email on production deploy context', async () => {
    process.env.CONTEXT = 'production';

    const response = await handler(buildEvent(), {} as never, {} as never);

    expect(response.statusCode).toBe(404);
    expect(sendPurchaseEmailMock).not.toHaveBeenCalled();
  });

  it('returns 404 and does not send email in production Node without Netlify Dev', async () => {
    process.env.NODE_ENV = 'production';

    const response = await handler(buildEvent(), {} as never, {} as never);

    expect(response.statusCode).toBe(404);
    expect(sendPurchaseEmailMock).not.toHaveBeenCalled();
  });

  it('sends test email when endpoint is enabled (dev/test runtime)', async () => {
    sendPurchaseEmailMock.mockResolvedValue({ success: true });

    const response = await handler(buildEvent(), {} as never, {} as never);

    expect(response.statusCode).toBe(200);
    expect(sendPurchaseEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseEmailMock.mock.calls[0][0]).toMatchObject({
      to: 'dev@example.com',
    });
  });
});
