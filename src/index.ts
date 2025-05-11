/**
 * Options for configuring the request collapser
 */
export interface RequestCollapserOptions {
  /**
   * Timeout in milliseconds before processing the batch of requests
   * @default 100
   */
  timeoutMillis?: number;
}

/**
 * Creates a function that processes individual items by batching them
 * @param batchProcessor Function that processes an array of items and returns a map of results
 * @param options Configuration options for the request collapser
 * @returns Function that processes a single item and returns its result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PendingPromise<T, S> = {
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
}

export function createRequestCollapser<T, S>(
  batchProcessor: (items: T[]) => Promise<Map<T, S>>,
  options: RequestCollapserOptions = {}
): RequestCollapser<T, S> {
  const { timeoutMillis = 100 } = options;
  let queue: T[] = [];
  let timeout: NodeJS.Timeout | null = null;
  const pendingPromises: Map<T, PendingPromise<T, S>> = new Map();

  const processBatch = async () => {
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

  const process = async (item: T): Promise<S> => {
    return new Promise((resolve, reject) => {
      queue.push(item);
      pendingPromises.set(item, { resolve, reject });

      if (!timeout) {
        timeout = setTimeout(() => {
          void processBatch();
        }, timeoutMillis);
      }
    });
  };

  const flush = async (): Promise<void> => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (queue.length > 0) {
      await processBatch();
    }
  };

  const getQueueLength = (): number => queue.length;

  return {
    process,
    flush,
    getQueueLength,
  };
}
