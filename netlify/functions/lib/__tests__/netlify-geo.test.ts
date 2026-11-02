import { describe, expect, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import {
  LISTEN_CITY_MAX_LENGTH,
  parseListenGeoFromEvent,
  parseListenGeoFromHeader,
  readNetlifyGeoHeader,
} from '../netlify-geo';

function encodeNetlifyGeoBase64(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

describe('parseListenGeoFromHeader', () => {
  test('parses valid x-nf-geo JSON', () => {
    expect(
      parseListenGeoFromHeader(
        JSON.stringify({
          city: '  Moscow ',
          country: { code: 'ru', name: 'Russia' },
        })
      )
    ).toEqual({ listenCity: 'Moscow', listenCountryCode: 'RU' });
  });

  test('returns nulls when header is missing', () => {
    expect(parseListenGeoFromHeader(null)).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
    expect(parseListenGeoFromHeader('   ')).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('returns nulls on invalid JSON', () => {
    expect(parseListenGeoFromHeader('{not json')).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('returns null city when city is missing or blank', () => {
    expect(parseListenGeoFromHeader(JSON.stringify({ country: { code: 'US' } }))).toEqual({
      listenCity: null,
      listenCountryCode: 'US',
    });
    expect(parseListenGeoFromHeader(JSON.stringify({ city: '   ' }))).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('returns null country code when missing or invalid', () => {
    expect(parseListenGeoFromHeader(JSON.stringify({ city: 'Berlin' }))).toEqual({
      listenCity: 'Berlin',
      listenCountryCode: null,
    });
    expect(
      parseListenGeoFromHeader(JSON.stringify({ city: 'Berlin', country: { code: 'DEU' } }))
    ).toEqual({ listenCity: 'Berlin', listenCountryCode: null });
  });

  test('truncates long city names', () => {
    const longCity = 'a'.repeat(LISTEN_CITY_MAX_LENGTH + 20);
    const result = parseListenGeoFromHeader(JSON.stringify({ city: longCity }));
    expect(result.listenCity).toHaveLength(LISTEN_CITY_MAX_LENGTH);
  });

  test('parses Base64-encoded x-nf-geo JSON with city and country code', () => {
    const header = encodeNetlifyGeoBase64({
      city: 'Corvallis',
      country: { code: 'US', name: 'United States' },
    });
    expect(parseListenGeoFromHeader(header)).toEqual({
      listenCity: 'Corvallis',
      listenCountryCode: 'US',
    });
  });

  test('parses Base64 JSON with trim and country code normalization', () => {
    const header = encodeNetlifyGeoBase64({
      city: '  Tokyo ',
      country: { code: 'jp', name: 'Japan' },
    });
    expect(parseListenGeoFromHeader(header)).toEqual({
      listenCity: 'Tokyo',
      listenCountryCode: 'JP',
    });
  });

  test('returns nulls when Base64 is invalid', () => {
    expect(parseListenGeoFromHeader('!!!not-valid-base64!!!')).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('returns nulls when Base64 decodes but JSON is invalid', () => {
    const header = Buffer.from('{not json', 'utf8').toString('base64');
    expect(parseListenGeoFromHeader(header)).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('applies city and country validation to Base64 payloads', () => {
    const header = encodeNetlifyGeoBase64({
      city: 'Berlin',
      country: { code: 'DEU' },
    });
    expect(parseListenGeoFromHeader(header)).toEqual({
      listenCity: 'Berlin',
      listenCountryCode: null,
    });
  });
});

describe('readNetlifyGeoHeader / parseListenGeoFromEvent', () => {
  test('reads x-nf-geo from handler event headers', () => {
    const event = {
      headers: {
        'x-nf-geo': JSON.stringify({
          city: 'Paris',
          country: { code: 'FR', name: 'France' },
        }),
      },
    } as HandlerEvent;

    expect(readNetlifyGeoHeader(event)).toContain('Paris');
    expect(parseListenGeoFromEvent(event)).toEqual({
      listenCity: 'Paris',
      listenCountryCode: 'FR',
    });
  });

  test('handles missing header on event', () => {
    expect(parseListenGeoFromEvent({ headers: {} } as HandlerEvent)).toEqual({
      listenCity: null,
      listenCountryCode: null,
    });
  });

  test('reads Base64 x-nf-geo from handler event headers', () => {
    const event = {
      headers: {
        'x-nf-geo': encodeNetlifyGeoBase64({
          city: 'Paris',
          country: { code: 'FR', name: 'France' },
        }),
      },
    } as HandlerEvent;

    expect(parseListenGeoFromEvent(event)).toEqual({
      listenCity: 'Paris',
      listenCountryCode: 'FR',
    });
  });
});
