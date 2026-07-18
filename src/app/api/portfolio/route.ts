import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/services/portfolio-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getDashboardData('7d');
  return NextResponse.json(data);
}
