import { NextResponse } from 'next/server';
import { checkDatabase, getLatestSnapshot } from '@/lib/db/portfolio-repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = await checkDatabase();
  if (!database) {
    return NextResponse.json({ ok: false, database: 'unavailable' }, { status: 503 });
  }
  const latest = await getLatestSnapshot();
  const snapshotAgeSeconds = latest
    ? Math.max(0, Math.round((Date.now() - Date.parse(latest.capturedAt)) / 1000))
    : null;
  return NextResponse.json({
    ok: true,
    database: 'ready',
    snapshot: latest ? (snapshotAgeSeconds! > 2 * 60 * 60 ? 'stale' : 'ready') : 'missing',
    snapshotAgeSeconds
  });
}
