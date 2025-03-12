import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCollapser } from './index';

describe('createCollapser - Window-based Batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  it('should batch multiple requests into a single operation', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      await Promise.resolve();
      return items.map(([n]) => n * 2);
    });

    const singleOp = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
    });

    // Create multiple promises that will be batched
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);
    const promise3 = singleOp(3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    await Promise.all([
      expect(promise1).resolves.toBe(2),
      expect(promise2).resolves.toBe(4),
      expect(promise3).resolves.toBe(6),
    ]);

    // Verify batch function was called once with all numbers
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2], [3]]);
  });

  it('should batch multiple arguments', async () => {
    const batchFn = vi
      .fn()
      .mockImplementation(async (items: [string, number][]) => {
        await Promise.resolve();
        return items.map(([key, value]) => `${key}:${value}`);
      });

    const multiOp = createCollapser<[string, number], string>(batchFn, {
      windowMs: 100,
    });

    // Create multiple promises that will be batched
    const promise1 = multiOp('a', 1);
    const promise2 = multiOp('b', 2);
    const promise3 = multiOp('c', 3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    await Promise.all([
      expect(promise1).resolves.toBe('a:1'),
      expect(promise2).resolves.toBe('b:2'),
      expect(promise3).resolves.toBe('c:3'),
    ]);

    // Verify batch function was called once with all arguments properly grouped
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('should handle errors from batch function', async () => {
    const error = new Error('Batch processing failed');
    const batchFn = vi.fn().mockRejectedValue(error);

    const collapser = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
    });

    // Create promises and store them to prevent unhandled rejections
    const promises = [collapser(1), collapser(2)];

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Handle all rejections
    await Promise.all(
      promises.map(promise =>
        promise.catch(err => {
          expect(err).toBe(error);
        })
      )
    );

    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);
  });

  it('should handle string and number arguments', async () => {
    const batchFn = vi
      .fn()
      .mockImplementation(async (items: [string, number][]) => {
        await Promise.resolve();
        return items.map(([msg, id]) => `${msg}#${id}`);
      });

    const formatMessage = createCollapser<[string, number], string>(batchFn, {
      windowMs: 100,
    });

    // Create multiple promises that will be batched
    const promise1 = formatMessage('Message', 1);
    const promise2 = formatMessage('Task', 2);
    const promise3 = formatMessage('Note', 3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    await Promise.all([
      expect(promise1).resolves.toBe('Message#1'),
      expect(promise2).resolves.toBe('Task#2'),
      expect(promise3).resolves.toBe('Note#3'),
    ]);

    // Verify batch function was called once with all arguments properly grouped
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['Message', 1],
      ['Task', 2],
      ['Note', 3],
    ]);
  });

  it('should support Map return type', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      await Promise.resolve();
      const resultMap = new Map<string, number>();
      items.forEach(item => {
        resultMap.set(JSON.stringify(item), item[0] * 2);
      });
      return resultMap;
    });

    const singleOp = createCollapser<[number], number>(batchFn, {
      windowMs: 100,
    });

    // Create multiple promises that will be batched
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);
    const promise3 = singleOp(3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    await Promise.all([
      expect(promise1).resolves.toBe(2),
      expect(promise2).resolves.toBe(4),
      expect(promise3).resolves.toBe(6),
    ]);

    // Verify batch function was called once with all numbers
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2], [3]]);
  });

  it('should handle errors when Map is missing results', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      await Promise.resolve();
      const map = new Map<string, string>();
      // Only set result for the first item
      map.set(JSON.stringify(items[0]), 'result1');
      return map;
    });

    const collapser = createCollapser<[number], string>(batchFn, {
      windowMs: 100,
    });

    // Create promises and store them to prevent unhandled rejections
    const promise1 = collapser(1);
    const promise2 = collapser(2);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Handle both success and rejection cases
    await Promise.all([
      promise1.then(result => {
        expect(result).toBe('result1');
      }),
      promise2.catch((error: Error) => {
        expect(error.message).toBe(
          'Batch function must return a result for each input item'
        );
      }),
    ]);

    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);
  });
});
