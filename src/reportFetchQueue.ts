import { ReportKind } from './reportKinds';

// How many manifest fetches are allowed in flight at once. Keeps us from
// firing hundreds/thousands of concurrent requests at argocd-server (each of
// which does its own k8s API round trip) while still being far more
// parallel than a single report kind's worth of resources.
export const REPORT_FETCH_CONCURRENCY = 8;

// How often streamed results are flushed into React state. Batching (rather
// than one setState per resolved fetch) keeps re-renders bounded regardless
// of how many CRDs are in the cluster - React 17 does not auto-batch updates
// that happen outside of event handlers.
export const REPORT_FETCH_BATCH_INTERVAL_MS = 150;

export interface QueueTarget<T> {
  key: string;
  kind: ReportKind;
  run: () => Promise<T>;
}

export type SettleResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface FetchQueue<T> {
  /** Runs all targets with up to `concurrency` in flight at once. */
  start(concurrency: number, onSettle: (target: QueueTarget<T>, result: SettleResult<T>) => void): Promise<void>;
  /** Moves `kind`'s not-yet-started targets to the front of the remaining queue. */
  prioritize(kind: ReportKind | string): void;
}

/**
 * A mutable-array worker queue: `concurrency` workers each pull the next
 * target off the front until the queue is empty. Ordering the array (via the
 * initial `targets` order or a later `prioritize` call) is what determines
 * which resources occupy the limited in-flight slots first.
 */
export function createFetchQueue<T>(targets: QueueTarget<T>[]): FetchQueue<T> {
  const queue = targets.slice();

  function prioritize(kind: ReportKind | string): void {
    const matching: QueueTarget<T>[] = [];
    const rest: QueueTarget<T>[] = [];
    for (const target of queue) {
      (target.kind === kind ? matching : rest).push(target);
    }
    queue.splice(0, queue.length, ...matching, ...rest);
  }

  async function worker(onSettle: (target: QueueTarget<T>, result: SettleResult<T>) => void): Promise<void> {
    for (;;) {
      const target = queue.shift();
      if (!target) {
        return;
      }
      try {
        const value = await target.run();
        onSettle(target, { ok: true, value });
      } catch (error) {
        onSettle(target, { ok: false, error });
      }
    }
  }

  async function start(
    concurrency: number,
    onSettle: (target: QueueTarget<T>, result: SettleResult<T>) => void
  ): Promise<void> {
    const workerCount = Math.max(1, Math.min(concurrency, queue.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker(onSettle)));
  }

  return { start, prioritize };
}

/**
 * Accumulates pushed items and flushes them in batches on a timer (plus an
 * immediate `flushNow`), so a burst of near-simultaneous events collapses
 * into a single downstream update instead of one per item.
 */
export interface Batcher<T> {
  push(item: T): void;
  /** Flushes any pending items through the `flush` callback right now. */
  flushNow(): void;
  /** Clears and returns pending items without calling `flush`. */
  drain(): T[];
}

export function createBatcher<T>(flush: (pending: T[]) => void, intervalMs: number): Batcher<T> {
  let pending: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function push(item: T): void {
    pending.push(item);
    if (timer === null) {
      timer = setTimeout(flushNow, intervalMs);
    }
  }

  function flushNow(): void {
    clearTimer();
    if (pending.length === 0) {
      return;
    }
    const items = pending;
    pending = [];
    flush(items);
  }

  function drain(): T[] {
    clearTimer();
    const items = pending;
    pending = [];
    return items;
  }

  return { push, flushNow, drain };
}
