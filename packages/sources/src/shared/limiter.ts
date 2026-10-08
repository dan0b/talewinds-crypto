import { setTimeout as delay } from 'node:timers/promises';

export type Sleep = (ms: number) => Promise<unknown>;
export const realSleep: Sleep = (ms) => delay(ms);

/**
 * Spaces out request starts for one provider: at most one request per `minIntervalMs`,
 * process-wide. Free tiers rate-limit aggressively, so every adapter call goes through one.
 */
export class RateLimiter {
  private nextAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;
  private readonly sleep: Sleep;
  private readonly now: () => number;

  constructor(minIntervalMs: number, sleep: Sleep = realSleep, now: () => number = Date.now) {
    this.minIntervalMs = minIntervalMs;
    this.sleep = sleep;
    this.now = now;
  }

  /** Resolves when the caller may start its request. */
  acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.nextAt - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextAt = this.now() + this.minIntervalMs;
    });
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** Push the next allowed start back, e.g. after a provider says "slow down". */
  penalize(ms: number): void {
    this.nextAt = Math.max(this.nextAt, this.now() + ms);
  }
}
