import { JOBS } from '@talewinds/core';
import { syncAllOwnedAccounts, syncCron } from '@talewinds/portfolio';
import type { WorkerContext } from '../context.ts';

export async function registerPortfolioHandlers({
  queue,
  portfolio,
  runtime,
}: WorkerContext): Promise<void> {
  await queue.work(JOBS.portfolioSyncAll, async () => {
    const r = await syncAllOwnedAccounts(portfolio);
    runtime.log.info(
      { succeeded: r.succeeded, partial: r.partial, failed: r.failed, prices: r.pricesUpdated },
      'portfolio sync finished',
    );
    return {
      accounts: r.accounts.length,
      succeeded: r.succeeded,
      partial: r.partial,
      failed: r.failed,
      pricesUpdated: r.pricesUpdated,
    };
  });

  const cron = syncCron(portfolio.config.syncIntervalMinutes);
  await queue.schedule(JOBS.portfolioSyncAll, cron, {});
  runtime.log.info({ cron }, 'portfolio sync scheduled');
}
