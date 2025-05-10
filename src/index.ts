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

export function createRequestCollapser<T, S>(
  batchProcessor: (items: T[]) => Promise<Map<T, S>>,
  options: RequestCollapserOptions = {}
): (item: T) => Promise<S> {
  const { timeoutMillis = 100 } = options;
  let queue: T[] = [];
  let timeout: NodeJS.Timeout | null = null;
  const pendingPromises: Map<T, PendingPromise<T, S>> = new Map();

  return async (item: T): Promise<S> => {
    return new Promise((resolve, reject) => {
      queue.push(item);
      pendingPromises.set(item, { resolve, reject });

      if (!timeout) {
        timeout = setTimeout(() => {
          const items = [...queue];
          queue = [];
          timeout = null;

          batchProcessor(items)
            .then(results => {
              for (const [item, result] of results) {
                const promise = pendingPromises.get(item);
                if (promise) {
                  promise.resolve(result);
                  pendingPromises.delete(item);
                }
              }
            })
            .catch(error => {
              for (const promise of pendingPromises.values()) {
                promise.reject(error);
              }
              pendingPromises.clear();
            });
        }, timeoutMillis);
      }
    });
  };
}
