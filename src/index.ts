/// <reference types="node" />

export interface CollapserOptions {
  /**
   * Time window in milliseconds before batch is executed
   * @default 100
   */
  windowMs?: number;
  
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
type QueueItem<Args, R> = {
  args: Args;
  resolve: (value: R) => void;
  reject: (error: any) => void;
};

/**
 * Type for batch function return value - either an array of results
 * or a map from input tuple to result
 */
type BatchReturn<Args extends any[], R> = R[] | Map<string, R>;

/**
 * Creates a function that collapses individual operations into batches
 * @param batchFn Function that processes items in batches
 * @param options Configuration options
 * @returns Function that processes single items by batching them
 */
export function createCollapser<Args extends any[], R>(
  batchFn: (items: Args[]) => Promise<BatchReturn<Args, R>>,
  options: CollapserOptions = {}
): (...args: Args) => Promise<R> {
  const {
    windowMs = 100,
    maxSize = 32
  } = options;

  let queue: QueueItem<Args, R>[] = [];
  
  let timeoutId: number | undefined;

  /**
   * Generate a stable key for the Map from the arguments tuple
   */
  const getKey = (args: Args): string => {
    return JSON.stringify(args);
  };

  const processQueue = async () => {
    const currentQueue = queue;
    queue = [];
    timeoutId = undefined;

    try {
      const argsArray = currentQueue.map(q => q.args);
      const results = await batchFn(argsArray);
      
      if (results instanceof Map) {
        // Handle Map return type
        currentQueue.forEach((q) => {
          const key = getKey(q.args);
          const result = results.get(key);
          if (result === undefined) {
            throw new Error('Batch function must return a result for each input item');
          }
          q.resolve(result);
        });
      } else {
        // Handle Array return type
        if (results.length !== currentQueue.length) {
          throw new Error('Batch function must return same number of results as input items');
        }
        currentQueue.forEach((q, index) => {
          q.resolve(results[index]);
        });
      }
    } catch (error) {
      currentQueue.forEach(q => q.reject(error));
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
        processQueue();
      } else if (timeoutId === undefined) {
        timeoutId = setTimeout(processQueue, windowMs) as unknown as number;
      }
    });
  };
}
