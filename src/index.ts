/**
 * Options for configuring the request collapser
 */
export interface RequestCollapserOptions {
  /**
   * Timeout in milliseconds before processing the batch of requests
   * @default 100
   */
  timeoutMillis?: number;
  /**
   * If true, each new item will reset the timeout
   * @default false
   */
  debounce?: boolean;
  /**
   * Maximum number of items that can be queued before forcing immediate processing.
   * When deduplicate is true, this counts unique items.
   * When deduplicate is false, this counts each invocation.
   * @default undefined (no limit)
   */
  maxQueueLength?: number;
  /**
   * If true, duplicate items will be deduplicated and share the same result.
   * If false (default), each call to process() returns its own promise,
   * even for duplicate items.
   * @default false
   */
  deduplicate?: boolean;
}

/**
 * Creates a function that processes individual items by batching them
 * @param batchProcessor Function that processes an array of items and returns a map of results
 * @param options Configuration options for the request collapser
 * @returns Function that processes a single item and returns its result
 */
type PendingPromise<S> = {
  resolve: (value: S) => void;
  reject: (error: unknown) => void;
};

export interface RequestCollapser<T, S> {
  /**
   * Process a single item by adding it to the batch
   */
  process: (item: T) => Promise<S>;
  /**
   * Force processing of all pending items immediately
   */
  flush: () => Promise<void>;
  /**
   * Get the current number of items in the queue
   */
  getQueueLength: () => number;
  /**
   * Stop the collapser and clear any pending timeouts
   */
  close: () => void;
}

// Internal type for queue entries in non-deduplicated mode
type QueueEntry<T, S> = {
  id: number;
  item: T;
  promise: PendingPromise<S>;
};

export function createRequestCollapser<T, S>(
  batchProcessor: (items: T[]) => Promise<Map<T, S>>,
  options: RequestCollapserOptions = {}
): RequestCollapser<T, S> {
  const {
    timeoutMillis = 100,
    debounce = false,
    maxQueueLength,
    deduplicate = false,
  } = options;
  let timeout: NodeJS.Timeout | null = null;
  let closed = false;
  let nextId = 0;

  // For deduplicate mode: track pending promises by item
  const dedupePromises: Map<T, PendingPromise<S>[]> = new Map();
  let dedupeQueue: T[] = [];

  // For non-deduplicate mode: track each invocation separately
  let invocationQueue: QueueEntry<T, S>[] = [];

  const getEffectiveQueueLength = (): number => {
    if (deduplicate) {
      return dedupeQueue.length;
    }
    return invocationQueue.length;
  };

  const processBatch = async (): Promise<void> => {
    if (closed) return;

    timeout = null;

    if (deduplicate) {
      // Deduplicate mode: process unique items
      const items = [...dedupeQueue];
      dedupeQueue = [];

      // Capture promises for this batch only
      const batchPromises = new Map<T, PendingPromise<S>[]>();
      for (const item of items) {
        const promises = dedupePromises.get(item);
        if (promises) {
          batchPromises.set(item, promises);
          dedupePromises.delete(item);
        }
      }

      try {
        const results = await batchProcessor(items);
        for (const [item, result] of results) {
          const promises = batchPromises.get(item);
          if (promises) {
            for (const promise of promises) {
              promise.resolve(result);
            }
            batchPromises.delete(item);
          }
        }
        // Reject any items that weren't returned by the batch processor
        for (const [item, promises] of batchPromises) {
          for (const promise of promises) {
            promise.reject(
              new Error(
                `Batch processor did not return result for item: ${String(item)}`
              )
            );
          }
        }
      } catch (error) {
        // Only reject promises for items in this batch
        for (const promises of batchPromises.values()) {
          for (const promise of promises) {
            promise.reject(error);
          }
        }
      }
    } else {
      // Non-deduplicate mode: process each invocation separately
      const entries = [...invocationQueue];
      invocationQueue = [];

      // Extract items for the batch processor
      const items = entries.map(e => e.item);

      try {
        const results = await batchProcessor(items);

        // Match results back to entries
        for (const entry of entries) {
          const result = results.get(entry.item);
          if (result !== undefined || results.has(entry.item)) {
            entry.promise.resolve(result as S);
          } else {
            entry.promise.reject(
              new Error(
                `Batch processor did not return result for item: ${String(entry.item)}`
              )
            );
          }
        }
      } catch (error) {
        for (const entry of entries) {
          entry.promise.reject(error);
        }
      }
    }
  };

  const scheduleBatch = (): void => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      void processBatch();
    }, timeoutMillis);
  };

  const process = async (item: T): Promise<S> => {
    if (closed) {
      throw new Error('Request collapser was closed');
    }

    return new Promise((resolve, reject) => {
      if (deduplicate) {
        // Deduplicate mode: group by item
        const existing = dedupePromises.get(item);
        if (existing) {
          // Add to existing promises for this item
          existing.push({ resolve, reject });
        } else {
          // New item
          dedupeQueue.push(item);
          dedupePromises.set(item, [{ resolve, reject }]);
        }
      } else {
        // Non-deduplicate mode: each call is separate
        invocationQueue.push({
          id: nextId++,
          item,
          promise: { resolve, reject },
        });
      }

      const queueLen = getEffectiveQueueLength();
      if (maxQueueLength !== undefined && queueLen >= maxQueueLength) {
        // If we've hit the max queue length, process immediately
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        void processBatch();
      } else if (!timeout || debounce) {
        scheduleBatch();
      }
    });
  };

  const flush = async (): Promise<void> => {
    if (closed) return;

    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (getEffectiveQueueLength() > 0) {
      await processBatch();
    }
  };

  const getQueueLength = (): number => getEffectiveQueueLength();

  const close = (): void => {
    closed = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (deduplicate) {
      dedupeQueue = [];
      for (const promises of dedupePromises.values()) {
        for (const promise of promises) {
          promise.reject(new Error('Request collapser was closed'));
        }
      }
      dedupePromises.clear();
    } else {
      for (const entry of invocationQueue) {
        entry.promise.reject(new Error('Request collapser was closed'));
      }
      invocationQueue = [];
    }
  };

  return {
    process,
    flush,
    getQueueLength,
    close,
  };
}
