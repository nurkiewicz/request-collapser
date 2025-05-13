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
   * Maximum number of items that can be queued before forcing immediate processing
   * @default undefined (no limit)
   */
  maxQueueLength?: number;
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

export function createRequestCollapser<T, S>(
  batchProcessor: (items: T[]) => Promise<Map<T, S>>,
  options: RequestCollapserOptions = {}
): RequestCollapser<T, S> {
  const { timeoutMillis = 100, debounce = false, maxQueueLength } = options;
  let queue: T[] = [];
  let timeout: NodeJS.Timeout | null = null;
  let closed = false;
  const pendingPromises: Map<T, PendingPromise<S>> = new Map();

  const processBatch = async () => {
    if (closed) return;

    const items = [...queue];
    queue = [];
    timeout = null;

    try {
      const results = await batchProcessor(items);
      for (const [item, result] of results) {
        const promise = pendingPromises.get(item);
        if (promise) {
          promise.resolve(result);
          pendingPromises.delete(item);
        }
      }
    } catch (error) {
      for (const promise of pendingPromises.values()) {
        promise.reject(error);
      }
      pendingPromises.clear();
    }
  };

  const scheduleBatch = () => {
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
      queue.push(item);
      pendingPromises.set(item, { resolve, reject });

      if (maxQueueLength !== undefined && queue.length >= maxQueueLength) {
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
    if (queue.length > 0) {
      await processBatch();
    }
  };

  const getQueueLength = (): number => queue.length;

  const close = (): void => {
    closed = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    queue = [];
    for (const promise of pendingPromises.values()) {
      promise.reject(new Error('Request collapser was closed'));
    }
    pendingPromises.clear();
  };

  return {
    process,
    flush,
    getQueueLength,
    close,
  };
}
