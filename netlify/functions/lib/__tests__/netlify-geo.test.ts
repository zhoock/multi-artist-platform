import { describe, expect, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import {
  LISTEN_CITY_MAX_LENGTH,
  parseListenGeoFromEvent,
  parseListenGeoFromHeader,
  readNetlifyGeoHeader,
} from '../netlify-geo';

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
});
