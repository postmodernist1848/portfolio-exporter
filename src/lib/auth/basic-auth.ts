import { createHash, timingSafeEqual } from 'node:crypto';

export type AuthenticationResult = 'authorized' | 'unauthorized' | 'misconfigured';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function configuredCredentials(): { username: string; password: string } | null {
  const username = process.env.PORTFOLIO_AUTH_USERNAME;
  const password = process.env.PORTFOLIO_AUTH_PASSWORD;
  if (!username || !password || username.includes(':')) return null;
  return { username, password };
}

function decodeBasicCredentials(header: string | null): string | null {
  if (!header?.toLowerCase().startsWith('basic ')) return null;
  const encoded = header.slice(6).trim();
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return null;
  }
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    return decoded.includes(':') ? decoded : null;
  } catch {
    return null;
  }
}

export function authenticateRequest(request: Request): AuthenticationResult {
  const credentials = configuredCredentials();
  if (!credentials) return 'misconfigured';

  const supplied = decodeBasicCredentials(request.headers.get('authorization'));
  if (!supplied) return 'unauthorized';

  const expected = `${credentials.username}:${credentials.password}`;
  return timingSafeEqual(digest(supplied), digest(expected)) ? 'authorized' : 'unauthorized';
}

export function authenticationError(result: Exclude<AuthenticationResult, 'authorized'>): Response {
  if (result === 'misconfigured') {
    return new Response('Authentication is not configured', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Basic realm="Portfolio Exporter", charset="UTF-8"'
    }
  });
}

export function requireBasicAuth(request: Request): Response | null {
  const result = authenticateRequest(request);
  return result === 'authorized' ? null : authenticationError(result);
}
