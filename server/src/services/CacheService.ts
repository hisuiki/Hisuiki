/**
 * Two in-process caches, bounded differently: sessions and OAuth states are small and uniform so a
 * count suffices, while page content varies in size and is bounded by bytes.
 *
 * In-process means per-instance. Harmless for content, but a signed-in user whose next request
 * lands on another instance is asked to sign in again; max_instance_count keeps that rare.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  sizeBytes: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private totalBytes = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxBytes = Number.POSITIVE_INFINITY
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return undefined;
    }

    // Re-insert so Map order approximates LRU for the eviction below.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, sizeBytes = 1): void {
    this.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs, sizeBytes });
    this.totalBytes += sizeBytes;
    this.evictIfNeeded();
  }

  delete(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.totalBytes -= existing.sizeBytes;
    this.entries.delete(key);
  }

  private evictIfNeeded(): void {
    // Map preserves insertion order, and get() re-inserts on hit, so the first key is the coldest.
    while (this.totalBytes > this.maxBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.delete(oldest.value);
    }
  }
}

/** Rendered page and article content: 20 MB, 5 minutes. */
export const pageCache = new TtlCache<unknown>(5 * 60 * 1000, 20 * 1024 * 1024);
