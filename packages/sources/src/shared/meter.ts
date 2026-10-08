/**
 * Counts provider requests for one unit of work (a sync run, a report), so each can record
 * what it cost. Create one per unit of work; pass it into every adapter call.
 */
export class RequestMeter {
  private readonly counts = new Map<string, number>();

  count(provider: string): void {
    this.counts.set(provider, (this.counts.get(provider) ?? 0) + 1);
  }

  get total(): number {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }

  byProvider(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}
