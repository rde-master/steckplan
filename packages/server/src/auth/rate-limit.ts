// Begrenzung von Fehlversuchen beim Anmelden (pro IP-Adresse).
export interface RateLimitOptions {
  maxFailures?: number;
  windowMs?: number;
  now?: () => number;
}

export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RateLimitOptions = {}) {
    this.maxFailures = options.maxFailures ?? 10;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  private recent(ip: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(ip) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list;
  }

  /** Sekunden bis zum nächsten erlaubten Versuch, oder 0 wenn erlaubt. */
  retryAfter(ip: string): number {
    const list = this.recent(ip);
    if (list.length < this.maxFailures) return 0;
    return Math.max(1, Math.ceil((list[0]! + this.windowMs - this.now()) / 1000));
  }

  fail(ip: string): void {
    const list = this.recent(ip);
    list.push(this.now());
    this.failures.set(ip, list);
  }

  succeed(ip: string): void {
    this.failures.delete(ip);
  }
}
