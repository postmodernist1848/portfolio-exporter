import { NextResponse } from 'next/server';
import { getTotalHistory } from '@/lib/db/portfolio-repository';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  range: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
  limit: z.coerce.number().int().min(1).max(2000).default(200)
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid history query' }, { status: 400 });
  }
  const points = await getTotalHistory(parsed.data.limit, parsed.data.range);
  return NextResponse.json(points);
}
