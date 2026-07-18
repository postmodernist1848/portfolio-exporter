import { getLatestSnapshot } from '@/lib/db/portfolio-repository';
import { runScheduledCollection } from '@/lib/services/collection-coordinator';

const HOUR_MS = 60 * 60 * 1000;
let started = false;

async function runTick(label: string): Promise<void> {
  try {
    const snapshot = await runScheduledCollection();
    console.info('[scheduler] snapshot saved', { label, capturedAt: snapshot.capturedAt });
  } catch (error) {
    console.error('[scheduler] collection failed', {
      label,
      error: error instanceof Error ? error.message : 'Unknown failure'
    });
  }
}

export function startPortfolioScheduler(): void {
  if (started) return;
  started = true;

  void getLatestSnapshot()
    .then((latest) => {
      if (!latest || Date.now() - Date.parse(latest.capturedAt) >= HOUR_MS) {
        return runTick('startup');
      }
    })
    .catch((error) => console.error('[scheduler] startup check failed', {
      error: error instanceof Error ? error.message : 'Unknown failure'
    }));

  const scheduleNext = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    setTimeout(async () => {
      await runTick('hourly');
      scheduleNext();
    }, nextHour.getTime() - now.getTime());
  };
  scheduleNext();
}
