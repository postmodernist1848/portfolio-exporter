import { NextResponse } from 'next/server';
import { getTotalHistory } from '@/lib/db/portfolio-repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const points = await getTotalHistory();
  return NextResponse.json(points);
}
