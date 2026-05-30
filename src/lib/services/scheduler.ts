import { collectAndSaveSnapshot } from '@/lib/services/portfolio-service';

const HOUR_MS = 60 * 60 * 1000;
let started = false;
let alignTimer: NodeJS.Timeout | null = null;

async function runTick(label: string): Promise<void> {
  try {
    const snapshot = await collectAndSaveSnapshot();
    console.log(
      `[scheduler:${label}] snapshot saved at ${snapshot.capturedAt}, total=${snapshot.totalRub.toFixed(2)} RUB`
    );
  } catch (error) {
    console.error(`[scheduler:${label}] snapshot failed`, error);
  }
}

export function startPortfolioScheduler(): void {
  if (started) {
    return;
  }

  started = true;
  const scheduleNextTick = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const delayMs = Math.max(0, nextHour.getTime() - now.getTime());

    alignTimer = setTimeout(async () => {
      await runTick('hourly');
      scheduleNextTick();
    }, delayMs);

    console.log(`[scheduler] next tick at ${nextHour.toISOString()}`);
  };

  scheduleNextTick();
}
