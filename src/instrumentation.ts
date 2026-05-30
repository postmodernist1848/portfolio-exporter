import { startPortfolioScheduler } from '@/lib/services/scheduler';
import { env } from '@/lib/config/env';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (env.ALLOW_SELF_SIGNED_TLS === 'true') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      console.warn('[tls] NODE_TLS_REJECT_UNAUTHORIZED=0 (self-signed certificates are allowed)');
    }
    startPortfolioScheduler();
  }
}
