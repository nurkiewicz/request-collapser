/// <reference types="node" />

export const myPackage = (taco = ''): string => `${taco} from my package`;

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

type UnzipArrays<T extends any[][]> = {
  [K in keyof T[0]]: T[number][K]
}[];

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
 * Creates a function that collapses individual operations into batches
 * @param batchFn Function that processes items in batches
 * @param options Configuration options
 * @returns Function that processes single items by batching them
 */
export function createCollapser<Args extends any[], R>(
  batchFn: (...args: UnzipArrays<Args[]>) => Promise<R[]>,
  options: CollapserOptions = {}
): (...args: Args) => Promise<R> {
  const {
    windowMs = 100,
    maxSize = 32
  } = options;

  let queue: QueueItem<Args, R>[] = [];
  
  let timeoutId: number | undefined;

  const processQueue = async () => {
    const currentQueue = queue;
    queue = [];
    timeoutId = undefined;

    try {
      // Transpose the arguments array to group by parameter position
      const argsArrays = currentQueue.map(q => q.args);
      const transposedArgs = argsArrays[0].map((_, i) => 
        argsArrays.map(args => args[i])
      ) as UnzipArrays<Args[]>;
      
      const results = await batchFn(...transposedArgs);
      
      if (results.length !== currentQueue.length) {
        throw new Error('Batch function must return same number of results as input items');
      }

      currentQueue.forEach((q, index) => {
        q.resolve(results[index]);
      });
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
