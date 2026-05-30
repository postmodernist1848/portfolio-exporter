import { NextResponse } from 'next/server';
import { getSourceHistory } from '@/lib/db/portfolio-repository';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { sourceId: string } }) {
  const points = await getSourceHistory(params.sourceId);
  return NextResponse.json(points);
}
