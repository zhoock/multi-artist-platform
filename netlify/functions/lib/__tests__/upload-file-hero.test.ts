import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';
import sharp from 'sharp';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../email-verification', () => ({
  isUserEmailVerified: jest.fn(async () => true),
}));

jest.mock('../jwt', () => {
  const actual = jest.requireActual('../jwt') as typeof import('../jwt');
  return {
    ...actual,
    extractRoleFromToken: jest.fn(() => null),
  };
});

jest.mock('../image-processor', () => {
  const actual = jest.requireActual('../image-processor') as typeof import('../image-processor');
  return {
    ...actual,
    generateHeroImageVariants: jest.fn(),
  };
});

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  STORAGE_BUCKET_NAME: 'user-media',
}));

import { generateHeroImageVariants, HeroImageIntegrityError } from '../image-processor';
import { heroVariantFileNamesForBaseName } from '../hero-variants';
import { createSupabaseAdminClient } from '../supabase';
import { requireAuth } from '../api-helpers';
import { handler } from '../../upload-file';

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockGenerateHero = generateHeroImageVariants as jest.MockedFunction<
  typeof generateHeroImageVariants
>;
const mockCreateSupabase = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const BASE_NAME = 'hero-deadbeef';
let HERO_SOURCE_BASE64 = '';

beforeAll(async () => {
  const buf = await sharp({
    create: {
      width: 2560,
      height: 1522,
      channels: 3,
      background: { r: 64, g: 128, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  HERO_SOURCE_BASE64 = buf.toString('base64');
});

function buildHeroUploadEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({
      fileBase64: HERO_SOURCE_BASE64,
      fileName: `${BASE_NAME}.jpg`,
      category: 'hero',
      contentType: 'image/jpeg',
    }),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/upload-file',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '/api/upload-file',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

function sixVariantBuffers(): Record<string, Buffer> {
  const keys = heroVariantFileNamesForBaseName(BASE_NAME);
  expect(keys).toHaveLength(6);
  return Object.fromEntries(keys.map((k) => [k, Buffer.from(k)])) as Record<string, Buffer>;
}

describe('upload-file hero variants', () => {
  let uploadedPaths: string[];
  let removedPaths: string[][];

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(USER_ID);
    mockGenerateHero.mockResolvedValue(sixVariantBuffers());
    uploadedPaths = [];
    removedPaths = [];

    const upload = jest.fn(async (path: string) => {
      uploadedPaths.push(path);
      return { error: null };
    });

    const remove = jest.fn(async (paths: string[]) => {
      removedPaths.push([...paths]);
      return { error: null };
    });

    mockCreateSupabase.mockReturnValue({
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          remove,
          upload,
        }),
      },
    } as never);
  });

  test('returns 200 and main -1920.jpg path when all 6 variants upload', async () => {
    const response = await handler(buildHeroUploadEvent(), {} as never);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.url).toBe(`users/${USER_ID}/hero/${BASE_NAME}-1920.jpg`);
    expect(uploadedPaths).toHaveLength(6);
    expect(uploadedPaths.some((p) => p.includes('.avif'))).toBe(false);
    expect(removedPaths).toHaveLength(0);
  });

  test('returns 500 with code HERO_VARIANT_UPLOAD_INCOMPLETE and removes partial uploads', async () => {
    let call = 0;
    mockCreateSupabase.mockReturnValue({
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          remove: jest.fn(async (paths: string[]) => {
            removedPaths.push([...paths]);
            return { error: null };
          }),
          upload: jest.fn(async (path: string) => {
            call += 1;
            if (call === 5) {
              return { error: { message: 'simulated fail' } };
            }
            uploadedPaths.push(path);
            return { error: null };
          }),
        }),
      },
    } as never);

    const response = await handler(buildHeroUploadEvent(), {} as never);
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.code).toBe('HERO_VARIANT_UPLOAD_INCOMPLETE');
    // Upload continues after first failure; rollback removes every object that was stored.
    expect(uploadedPaths).toHaveLength(5);
    expect(removedPaths.length).toBeGreaterThanOrEqual(1);
    expect(removedPaths[removedPaths.length - 1]).toEqual(uploadedPaths);
  });

  test('returns 500 with code HERO_VARIANT_GENERATION_FAILED when sharp pipeline throws', async () => {
    mockGenerateHero.mockRejectedValueOnce(new Error('webp encoder simulated'));

    const response = await handler(buildHeroUploadEvent(), {} as never);
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.code).toBe('HERO_VARIANT_GENERATION_FAILED');
    expect(String(body.details)).toContain('webp encoder simulated');
    expect(uploadedPaths).toHaveLength(0);
  });

  test('returns 400 with integrity code when hero input is blank', async () => {
    mockGenerateHero.mockRejectedValueOnce(
      new HeroImageIntegrityError('HERO_INPUT_BLANK', 'Hero source image appears blank')
    );

    const response = await handler(buildHeroUploadEvent(), {} as never);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('HERO_INPUT_BLANK');
    expect(uploadedPaths).toHaveLength(0);
  });
});
