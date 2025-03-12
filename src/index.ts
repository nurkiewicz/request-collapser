/// <reference types="node" />

export interface CollapserOptions {
  /**
   * Time window in milliseconds before batch is executed
   * @default 100
   */
  windowMs: number;

  /**
   * Maximum batch size before forced execution
   * @default 32
   */
  maxSize?: number;
}

/**
 * Queue item representing a single operation in the batch
 * @private
 */
export type QueueItem<R> = {
  resolve: (value: R) => void;
  reject: (error: Error) => void;
  key: string;
};

/**
 * Type for batch function return value - either an array of results
 * or a map from input tuple to result
 */
export type BatchReturn<R> = R[] | Map<string, R>;

/**
 * Creates a function that collapses individual operations into batches
 * @param batchFn Function that processes items in batches
 * @param options Configuration options
 * @returns Function that processes single items by batching them
 */
export function createCollapser<Args extends any[], R>(
  batchFn: (items: Args[]) => Promise<BatchReturn<R>>,
  options: CollapserOptions = {}
): (...args: Args) => Promise<R> {
  const { windowMs = 100, maxSize = 32 } = options;

  let queue: QueueItem<R>[] = [];
  let timeoutId: NodeJS.Timeout | undefined;

  /**
   * Generate a stable key for the Map from the arguments tuple
   */
  const getKey = (args: Args): string => {
    return JSON.stringify(args);
  };

  const processQueue = async () => {
    if (queue.length === 0) return;

    const currentQueue = queue;
    queue = [];
    timeoutId = undefined;

    try {
      const argsArray = currentQueue.map(q => q.key);
      const results = await batchFn(argsArray);

      if (results instanceof Map) {
        // Handle Map return type
        for (const q of currentQueue) {
          const key = getKey(q.key);
          const result = results.get(key);
          if (result === undefined) {
            q.reject(
              new Error(
                'Batch function must return a result for each input item'
              )
            );
          } else {
            q.resolve(result);
          }
        }
      } else {
        // Handle Array return type
        if (results.length !== currentQueue.length) {
          currentQueue.forEach(q => {
            q.reject(
              new Error(
                'Batch function must return same number of results as input items'
              )
            );
          });
        } else {
          currentQueue.forEach((q, index) => {
            const result = results[index];
            if (result === undefined) {
              q.reject(new Error('Batch function returned undefined result'));
            } else {
              q.resolve(result);
            }
          });
        }
      }
    } catch (error) {
      currentQueue.forEach(q => q.reject(error));
    }

    // Process any remaining items in the queue
    if (queue.length > 0) {
      if (queue.length >= maxSize) {
        void processQueue();
      } else {
        timeoutId = setTimeout(() => void processQueue(), windowMs);
      }
    }
  };

  return (...args: Args): Promise<R> => {
    return new Promise((resolve, reject) => {
      queue.push({ key: args, resolve, reject });

      if (queue.length >= maxSize) {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        void processQueue();
      } else if (timeoutId === undefined) {
        timeoutId = setTimeout(() => void processQueue(), windowMs);
      }
    });
  };
}
