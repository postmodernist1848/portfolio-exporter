import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateRequest, requireBasicAuth } from './basic-auth';

function request(username = 'portfolio', password = 'test-password'): Request {
  const value = Buffer.from(`${username}:${password}`).toString('base64');
  return new Request('https://example.com/', { headers: { Authorization: `Basic ${value}` } });
}

afterEach(() => vi.unstubAllEnvs());

describe('basic authentication', () => {
  it('accepts the configured credentials', () => {
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', 'test-password');
    expect(authenticateRequest(request())).toBe('authorized');
  });

  it('rejects missing, malformed, and incorrect credentials', () => {
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', 'test-password');
    expect(authenticateRequest(new Request('https://example.com/'))).toBe('unauthorized');
    expect(authenticateRequest(new Request('https://example.com/', {
      headers: { Authorization: 'Basic not-base64' }
    }))).toBe('unauthorized');
    expect(authenticateRequest(request('portfolio', 'wrong'))).toBe('unauthorized');
  });

  it('fails closed when either server credential is missing', async () => {
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', '');
    const response = requireBasicAuth(request());
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('portfolio');
  });

  it('returns a browser authentication challenge without caching it', () => {
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', 'test-password');
    const response = requireBasicAuth(new Request('https://example.com/'));
    expect(response?.status).toBe(401);
    expect(response?.headers.get('www-authenticate')).toContain('Basic realm="Portfolio Exporter"');
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });
});
