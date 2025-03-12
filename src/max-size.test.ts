import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCollapser } from './index';

describe('createCollapser - Max Size-based Batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  it('should trigger batch when size limit is reached', async () => {
    const batchFn = vi.fn().mockImplementation(
      async (items: [number][]) => await Promise.resolve(items.map(([n]) => n * 2))
    );

    const singleOp = createCollapser<[number], number>(batchFn, {
      windowMs: 1000,
      maxSize: 2,
    });

    // First batch (size = 2)
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);

    // Wait for the first batch to process
    await Promise.resolve();
    await Promise.resolve();

    // Should trigger immediately due to maxSize
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);

    // Second batch
    const promise3 = singleOp(3);

    // Advance time to process second batch
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    // Verify all results
    await Promise.all([
      expect(promise1).resolves.toBe(2),
      expect(promise2).resolves.toBe(4),
      expect(promise3).resolves.toBe(6),
    ]);

    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenLastCalledWith([[3]]);
  });

  it('should immediately process batches when maxSize is reached', async () => {
    const batchFn = vi.fn().mockImplementation(
      async (items: [string, number][]) =>
        await Promise.resolve(items.map(([msg, id]) => `${msg}#${id}`))
    );

    const formatMessage = createCollapser<[string, number], string>(batchFn, {
      windowMs: 1000, // Long window
      maxSize: 2, // Small batch size
    });

    // First batch - should process immediately when maxSize is reached
    const promise1 = formatMessage('A', 1);
    expect(batchFn).not.toHaveBeenCalled();

    const promise2 = formatMessage('B', 2);
    // Wait for the first batch to process
    await Promise.resolve();
    await Promise.resolve();
    
    // Should process immediately after second item
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['A', 1],
      ['B', 2],
    ]);

    // Second batch - should wait for window
    const promise3 = formatMessage('C', 3);
    expect(batchFn).toHaveBeenCalledTimes(1); // Still only one call

    const promise4 = formatMessage('D', 4);
    // Wait for the second batch to process
    await Promise.resolve();
    await Promise.resolve();
    
    // Should process immediately after fourth item
    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenLastCalledWith([
      ['C', 3],
      ['D', 4],
    ]);

    // Last item - should wait for window
    const promise5 = formatMessage('E', 5);
    expect(batchFn).toHaveBeenCalledTimes(2); // No new calls yet

    // Advance time to process last batch
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    // Verify all results
    await Promise.all([
      expect(promise1).resolves.toBe('A#1'),
      expect(promise2).resolves.toBe('B#2'),
      expect(promise3).resolves.toBe('C#3'),
      expect(promise4).resolves.toBe('D#4'),
      expect(promise5).resolves.toBe('E#5'),
    ]);

    expect(batchFn).toHaveBeenCalledTimes(3);
    expect(batchFn).toHaveBeenLastCalledWith([['E', 5]]);
  });
});
