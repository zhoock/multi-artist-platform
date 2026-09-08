import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('../public-document/resolver', () => ({
  resolveDocumentAllow: jest.fn(),
}));

import { resolveDocumentAllow } from '../public-document/resolver';
import { resetDocumentHtmlCacheForTests } from '../public-document/responses';
import { handler } from '../../public-document';

const mockResolveDocumentAllow = resolveDocumentAllow as jest.MockedFunction<
  typeof resolveDocumentAllow
>;

const documentDir = resolve(__dirname, '../../_document');

function seedDocumentHtml(): void {
  mkdirSync(documentDir, { recursive: true });
  writeFileSync(resolve(documentDir, 'index.html'), '<!doctype html><html><body>app</body></html>');
  writeFileSync(
    resolve(documentDir, '404.html'),
    '<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head><body>404</body></html>'
  );
  resetDocumentHtmlCacheForTests();
}

function makeEvent(path: string, artist?: string): HandlerEvent {
  const query = artist ? { artist } : null;
  return {
    httpMethod: 'GET',
    path,
    queryStringParameters: query,
    headers: {},
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: path,
    rawQuery: artist ? `artist=${artist}` : '',
  } as HandlerEvent;
}

describe('public-document handler', () => {
  beforeEach(() => {
    mockResolveDocumentAllow.mockReset();
    seedDocumentHtml();
  });

  test('allow → HTTP 200 with index.html', async () => {
    mockResolveDocumentAllow.mockResolvedValue(true);
    const response = await handler(makeEvent('/ru', 'existing-artist'), {} as never);
    expect(response?.statusCode).toBe(200);
    expect(String(response?.body)).toContain('app');
  });

  test('deny → HTTP 404 with noindex', async () => {
    mockResolveDocumentAllow.mockResolvedValue(false);
    const response = await handler(makeEvent('/ru', 'missing-artist'), {} as never);
    expect(response?.statusCode).toBe(404);
    expect(String(response?.body)).toContain('noindex,nofollow');
  });

  test('unknown route classification returns 404 via resolver', async () => {
    mockResolveDocumentAllow.mockResolvedValue(false);
    const response = await handler(makeEvent('/ru/unknown-path'), {} as never);
    expect(response?.statusCode).toBe(404);
  });

  test('HEAD returns empty body', async () => {
    mockResolveDocumentAllow.mockResolvedValue(true);
    const response = await handler({ ...makeEvent('/ru'), httpMethod: 'HEAD' }, {} as never);
    expect(response?.statusCode).toBe(200);
    expect(response?.body).toBe('');
  });
});
