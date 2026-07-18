import { NextResponse } from 'next/server';
import { getSourceHistory } from '@/lib/db/portfolio-repository';
import { isPortfolioSourceId } from '@/lib/sources/metadata';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  range: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
  limit: z.coerce.number().int().min(1).max(2000).default(200)
});

export async function GET(request: Request, { params }: { params: { sourceId: string } }) {
  if (!isPortfolioSourceId(params.sourceId)) {
    return NextResponse.json({ error: 'Unknown source' }, { status: 404 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid history query' }, { status: 400 });
  }
  const points = await getSourceHistory(params.sourceId, parsed.data.limit, parsed.data.range);
  return NextResponse.json(points);
}
