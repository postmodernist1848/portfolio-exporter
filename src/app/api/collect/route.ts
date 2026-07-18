import { NextResponse } from 'next/server';
import { requestPublicCollection } from '@/lib/services/collection-coordinator';

export const dynamic = 'force-dynamic';

export async function POST() {
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
