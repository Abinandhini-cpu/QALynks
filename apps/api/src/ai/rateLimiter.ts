/** In-process sliding window limiter that protects provider spend. */
export class RateLimiter {
  private readonly hits: number[] = [];

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns 0 when the request is allowed, otherwise seconds until the next slot. */
  take(): number {
    const t = this.now();
    while (this.hits.length > 0 && t - this.hits[0]! >= this.windowMs) this.hits.shift();
    if (this.hits.length >= this.maxPerWindow) {
      return Math.max(1, Math.ceil((this.hits[0]! + this.windowMs - t) / 1000));
    }
    this.hits.push(t);
    return 0;
  }
}
