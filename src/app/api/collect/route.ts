import { NextResponse } from 'next/server';
import { collectAndSaveSnapshot } from '@/lib/services/portfolio-service';

export const dynamic = 'force-dynamic';

export async function POST() {
  const snapshot = await collectAndSaveSnapshot();
  return NextResponse.json({ ok: true, snapshot });
}
