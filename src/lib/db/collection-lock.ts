import { prisma } from './client';
import { saveSnapshot } from './portfolio-repository';
import type { PortfolioSnapshot } from '@/types/portfolio';

// Transaction-scoped locks also work with transaction-mode PostgreSQL poolers.
// PostgreSQL releases the lock when the transaction ends or its connection dies.
export async function collectWithDatabaseLock(collect: () => Promise<PortfolioSnapshot>) {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(1848, 3000) AS acquired
    `;
    if (!lock.acquired) return { state: 'in_progress' as const, snapshot: null };

    const [recent] = await tx.$queryRaw<Array<{ cooling: boolean }>>`
      SELECT COALESCE((
        SELECT "createdAt" > clock_timestamp() - interval '60 seconds'
        FROM "PortfolioSnapshot" ORDER BY "capturedAt" DESC LIMIT 1
      ), false) AS cooling
    `;
    if (recent.cooling) return { state: 'cooldown' as const, snapshot: null };

    const snapshot = await collect();
    // Persist under the same lock: a timed-out transaction cannot publish a result.
    await saveSnapshot(snapshot, tx);
    return { state: 'completed' as const, snapshot };
  }, { maxWait: 5_000, timeout: 280_000 });
}
