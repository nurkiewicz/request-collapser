import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCollapser } from './index';

describe('createCollapser - Max Size Batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  it('should trigger batch when size limit is reached', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      await Promise.resolve();
      return items.map(([n]) => n * 2);
    });

    const collapser = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
      maxSize: 2,
    });

    // Create promises that will be batched
    const promise1 = collapser(1);
    const promise2 = collapser(2);
    const promise3 = collapser(3);

    // First batch should be processed immediately due to maxSize
    await Promise.all([
      expect(promise1).resolves.toBe(2),
      expect(promise2).resolves.toBe(4),
    ]);

    // Advance time to process the remaining item
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise3).resolves.toBe(6);

    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenNthCalledWith(1, [[1], [2]]);
    expect(batchFn).toHaveBeenNthCalledWith(2, [[3]]);
  });

  it('should immediately process batches when maxSize is reached', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      await Promise.resolve();
      return items.map(([n]) => n * 2);
    });

    const collapser = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
      maxSize: 3,
    });

    // First batch
    const batch1 = [collapser(1), collapser(2), collapser(3)];

    // Should process immediately when maxSize is reached
    await Promise.all(
      batch1.map(async (promise, i) => {
        await expect(promise).resolves.toBe((i + 1) * 2);
      })
    );

    // Second batch
    const batch2 = [collapser(4), collapser(5), collapser(6)];

    // Should process immediately when maxSize is reached
    await Promise.all(
      batch2.map(async (promise, i) => {
        await expect(promise).resolves.toBe((i + 4) * 2);
      })
    );

    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenNthCalledWith(1, [[1], [2], [3]]);
    expect(batchFn).toHaveBeenNthCalledWith(2, [[4], [5], [6]]);
  });

  it('should handle errors when maxSize is reached', async () => {
    const error = new Error('Batch processing failed');
    const batchFn = vi.fn().mockRejectedValue(error);

    const collapser = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
      maxSize: 2,
    });

    // Create promises with immediate error handlers
    const promise1 = collapser(1).catch(err => {
      expect(err).toBe(error);
      return undefined;
    });
    const promise2 = collapser(2).catch(err => {
      expect(err).toBe(error);
      return undefined;
    });

    await Promise.all([promise1, promise2]);

    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);
  });
});
