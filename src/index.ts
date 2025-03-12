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
export type QueueItem<Args extends any[], R> = {
  args: Args;
  resolve: (value: R) => void;
  reject: (error: Error) => void;
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
  options: Partial<CollapserOptions> = { windowMs: 100 }
): (...args: Args) => Promise<R> {
  const { windowMs = 100, maxSize = 32 } = options;

  let queue: QueueItem<Args, R>[] = [];
  let timeoutId: NodeJS.Timeout | undefined;

  /**
   * Generate a stable key for the Map from the arguments tuple
   */
  const getKey = (args: Args): string => {
    return JSON.stringify(args);
  };

  /**
   * Process results returned as an array
   */
  const processArrayResults = (
    results: R[],
    currentQueue: QueueItem<Args, R>[]
  ) => {
    if (results.length !== currentQueue.length) {
      currentQueue.forEach(q => {
        q.reject(
          new Error(
            'Batch function must return same number of results as input items'
          )
        );
      });
      return;
    }

    currentQueue.forEach((q, index) => {
      const result = results[index];
      if (result === undefined) {
        q.reject(new Error('Batch function returned undefined result'));
      } else {
        q.resolve(result);
      }
    });
  };

  /**
   * Process results returned as a Map
   */
  const processMapResults = (
    results: Map<string, R>,
    currentQueue: QueueItem<Args, R>[]
  ) => {
    for (const q of currentQueue) {
      const key = getKey(q.args);
      const result = results.get(key);
      if (result === undefined) {
        q.reject(
          new Error('Batch function must return a result for each input item')
        );
      } else {
        q.resolve(result);
      }
    }
  };

  const processQueue = async () => {
    if (queue.length === 0) return;

    const currentQueue = queue;
    queue = [];
    timeoutId = undefined;

    try {
      const argsArray = currentQueue.map(q => q.args);
      const results = await batchFn(argsArray);

      if (results instanceof Map) {
        processMapResults(results, currentQueue);
      } else {
        processArrayResults(results, currentQueue);
      }
    } catch (error) {
      // Ensure error is always an Error object
      const errorToUse =
        error instanceof Error ? error : new Error(String(error));
      currentQueue.forEach(q => q.reject(errorToUse));
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
      queue.push({ args, resolve, reject });

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
