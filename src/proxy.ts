import { NextResponse, type NextRequest } from 'next/server';
import { requireBasicAuth } from '@/lib/auth/basic-auth';

export function proxy(request: NextRequest): Response {
  const error = requireBasicAuth(request);
  if (error) return error;

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)']
};
