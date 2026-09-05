export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build' &&
    process.env.VERCEL !== '1' &&
    process.env.SCHEDULER_ENABLED !== 'false'
  ) {
    const { startPortfolioScheduler } = await import('@/lib/services/scheduler');
    startPortfolioScheduler();
  }
}
