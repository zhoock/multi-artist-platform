import {
  NETLIFY_API_PROXY_IMAGE_PATH,
  NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH,
  getProxyImagePath,
  isLocalDevHostname,
  shouldUseNetlifyApiProxy,
} from '../proxyImageEnvironment';

describe('proxyImageEnvironment', () => {
  describe('isLocalDevHostname', () => {
    it.each(['localhost', '127.0.0.1', 'foo.localhost', '127.0.0.1:8080'])(
      'returns true for %s',
      (hostname) => {
        expect(isLocalDevHostname(hostname)).toBe(true);
      }
    );

    it.each(['multi-artist-platform.netlify.app', 'artists.example.com', 'smolyanoechuchelko.ru'])(
      'returns false for production host %s',
      (hostname) => {
        expect(isLocalDevHostname(hostname)).toBe(false);
      }
    );
  });

  describe('getProxyImagePath', () => {
    it.each(['localhost', '127.0.0.1'])(
      'uses Netlify functions path on dev host %s',
      (hostname) => {
        expect(getProxyImagePath(hostname)).toBe(NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH);
        expect(shouldUseNetlifyApiProxy(hostname)).toBe(false);
      }
    );

    it.each(['multi-artist-platform.netlify.app', 'artists.example.com', 'custom.domain.io'])(
      'uses /api/proxy-image on production host %s',
      (hostname) => {
        expect(getProxyImagePath(hostname)).toBe(NETLIFY_API_PROXY_IMAGE_PATH);
        expect(shouldUseNetlifyApiProxy(hostname)).toBe(true);
      }
    );
  });
});
