import { afterEach, describe, expect, it, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

afterEach(() => vi.unstubAllEnvs());

describe('authentication proxy', () => {
  it('covers pages and APIs but excludes framework assets and icons', () => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/api/collect' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/_next/static/app.js' })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/icon.svg' })).toBe(false);
  });

  it('challenges unauthenticated requests and passes authenticated requests', () => {
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', 'test-password');
    const unauthorized = proxy(new NextRequest('https://example.com/'));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toContain('Basic');

    const authorization = `Basic ${Buffer.from('portfolio:test-password').toString('base64')}`;
    const authorized = proxy(new NextRequest('https://example.com/', {
      headers: { Authorization: authorization }
    }));
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get('cache-control')).toBe('private, no-store');
  });
});
