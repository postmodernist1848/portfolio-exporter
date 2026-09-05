import { after, NextResponse } from 'next/server';
import { requestPublicCollection } from '@/lib/services/collection-coordinator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.get('background') === '1') {
    after(async () => {
      try {
        const result = await requestPublicCollection();
        console.info('[collection] background finished', {
          state: result.state,
          capturedAt: result.snapshot?.capturedAt,
          status: result.snapshot?.status
        });
      } catch {
        console.error('[collection] background failed');
      }
    });
    return NextResponse.json({ state: 'accepted' }, { status: 202 });
  }
  try {
    const result = await requestPublicCollection();
    return NextResponse.json({
      state: result.state,
      snapshot: result.snapshot ? {
        capturedAt: result.snapshot.capturedAt,
        totalRub: result.snapshot.totalRub,
        status: result.snapshot.status,
        freshSourceCount: result.snapshot.freshSourceCount,
        staleSourceCount: result.snapshot.staleSourceCount,
        errorSourceCount: result.snapshot.errorSourceCount,
        components: result.snapshot.components.map((component) => ({
          sourceId: component.sourceId,
          sourceName: component.sourceName,
          totalRub: component.totalRub,
          observedAt: component.observedAt,
          status: component.status,
          errorMessage: component.errorMessage
        }))
      } : null
    });
  } catch {
    return NextResponse.json(
      { state: 'completed', snapshot: null, error: 'Не удалось обновить портфель' },
      { status: 502 }
    );
  }
}
