-- Approximate listen geography from Netlify x-nf-geo at qualified play registration time.
ALTER TABLE qualified_track_plays
  ADD COLUMN IF NOT EXISTS listen_city TEXT,
  ADD COLUMN IF NOT EXISTS listen_country_code CHAR(2);

COMMENT ON COLUMN qualified_track_plays.listen_city IS
  'City name from Netlify GeoIP (x-nf-geo) when the qualified play was recorded, not a precise address.';
COMMENT ON COLUMN qualified_track_plays.listen_country_code IS
  'ISO 3166-1 alpha-2 country code from Netlify GeoIP when the qualified play was recorded.';
