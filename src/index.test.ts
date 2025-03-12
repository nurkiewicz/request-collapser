import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCollapser } from './index';

describe('createCollapser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should batch multiple requests into a single operation', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => 
      items.map(([n]) => n * 2)
    );

    const singleOp = createCollapser<[number], number>(batchFn, { windowMs: 100 });
    
    // Create multiple promises that will be batched
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);
    const promise3 = singleOp(3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    expect(await promise1).toBe(2);
    expect(await promise2).toBe(4);
    expect(await promise3).toBe(6);
    
    // Verify batch function was called once with all numbers
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2], [3]]);
  });

  it('should batch multiple arguments', async () => {
    const batchFn = vi.fn().mockImplementation(
      async (items: [string, number][]) => 
        items.map(([key, value]) => `${key}:${value}`)
    );

    const multiOp = createCollapser<[string, number], string>(batchFn, { windowMs: 100 });
    
    // Create multiple promises that will be batched
    const promise1 = multiOp('a', 1);
    const promise2 = multiOp('b', 2);
    const promise3 = multiOp('c', 3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    expect(await promise1).toBe('a:1');
    expect(await promise2).toBe('b:2');
    expect(await promise3).toBe('c:3');

    // Verify batch function was called once with all arguments properly grouped
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ]);
  });

  it('should trigger batch when size limit is reached', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => 
      items.map(([n]) => n * 2)
    );

    const singleOp = createCollapser<[number], number>(batchFn, { 
      windowMs: 1000,
      maxSize: 2 
    });
    
    // First batch (size = 2)
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);
    
    // Should trigger immediately due to maxSize
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);

    // Second batch
    const promise3 = singleOp(3);
    
    // Advance time to process second batch
    await vi.advanceTimersByTimeAsync(1000);

    // Verify all results
    expect(await promise1).toBe(2);
    expect(await promise2).toBe(4);
    expect(await promise3).toBe(6);
  });

  it('should handle errors from batch function', async () => {
    const error = new Error('Batch processing failed');
    const batchFn = vi.fn().mockImplementation(async () => {
      throw error;
    });

    const singleOp = createCollapser<[number], number>(batchFn, { windowMs: 100 });
    
    // Create promises that will fail
    const promises = [singleOp(1), singleOp(2)];

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Wait for all promises to settle and verify they were rejected with the error
    const results = await Promise.allSettled(promises);
    results.forEach(result => {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBe(error);
      }
    });

    // Verify batch function was called once
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);
  });

  it('should handle string and number arguments', async () => {
    // Mock function that formats messages with IDs
    const batchFn = vi.fn().mockImplementation(
      async (items: [string, number][]) => 
        items.map(([msg, id]) => `${msg}#${id}`)
    );

    const formatMessage = createCollapser<[string, number], string>(batchFn, { windowMs: 100 });
    
    // Create multiple promises that will be batched
    const promise1 = formatMessage('Message', 1);
    const promise2 = formatMessage('Task', 2);
    const promise3 = formatMessage('Note', 3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    expect(await promise1).toBe('Message#1');
    expect(await promise2).toBe('Task#2');
    expect(await promise3).toBe('Note#3');
    
    // Verify batch function was called once with all arguments properly grouped
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['Message', 1],
      ['Task', 2],
      ['Note', 3]
    ]);
  });

  it('should support Map return type', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      const resultMap = new Map<string, number>();
      items.forEach(item => {
        resultMap.set(JSON.stringify(item), item[0] * 2);
      });
      return resultMap;
    });

    const singleOp = createCollapser<[number], number>(batchFn, { windowMs: 100 });
    
    // Create multiple promises that will be batched
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);
    const promise3 = singleOp(3);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Verify results
    expect(await promise1).toBe(2);
    expect(await promise2).toBe(4);
    expect(await promise3).toBe(6);
    
    // Verify batch function was called once with all numbers
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2], [3]]);
  });

  it('should handle errors when Map is missing results', async () => {
    const batchFn = vi.fn().mockImplementation(async (items: [number][]) => {
      const resultMap = new Map<string, number>();
      // Only process the first item
      const firstItem = items[0];
      resultMap.set(JSON.stringify(firstItem), firstItem[0] * 2);
      return resultMap;
    });

    const singleOp = createCollapser<[number], number>(batchFn, { windowMs: 100 });
    
    // Create promises that will fail
    const promise1 = singleOp(1);
    const promise2 = singleOp(2);

    // Advance timers to trigger batch processing
    await vi.advanceTimersByTimeAsync(100);

    // Wait for all promises to settle
    const results = await Promise.allSettled([promise1, promise2]);

    // First promise should succeed, second should fail
    expect(results[0].status).toBe('fulfilled');
    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe(2);
    }
    expect(results[1].status).toBe('rejected');
    if (results[1].status === 'rejected') {
      expect(results[1].reason.message).toBe('Batch function must return a result for each input item');
    }

    // Verify batch function was called once
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([[1], [2]]);
  });

  it('should immediately process batches when maxSize is reached', async () => {
    const batchFn = vi.fn().mockImplementation(
      async (items: [string, number][]) => 
        items.map(([msg, id]) => `${msg}#${id}`)
    );

    const formatMessage = createCollapser<[string, number], string>(batchFn, { 
      windowMs: 1000, // Long window
      maxSize: 2     // Small batch size
    });
    
    // First batch - should process immediately when maxSize is reached
    const promise1 = formatMessage('A', 1);
    expect(batchFn).not.toHaveBeenCalled();
    
    const promise2 = formatMessage('B', 2);
    // Should process immediately after second item
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith([
      ['A', 1],
      ['B', 2]
    ]);

    // Second batch - should wait for window
    const promise3 = formatMessage('C', 3);
    expect(batchFn).toHaveBeenCalledTimes(1); // Still only one call
    
    const promise4 = formatMessage('D', 4);
    // Should process immediately after fourth item
    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenLastCalledWith([
      ['C', 3],
      ['D', 4]
    ]);

    // Last item - should wait for window
    const promise5 = formatMessage('E', 5);
    expect(batchFn).toHaveBeenCalledTimes(2); // No new calls yet
    
    // Advance time to process last batch
    await vi.advanceTimersByTimeAsync(1000);
    expect(batchFn).toHaveBeenCalledTimes(3);
    expect(batchFn).toHaveBeenLastCalledWith([
      ['E', 5]
    ]);

    // Verify all results
    expect(await promise1).toBe('A#1');
    expect(await promise2).toBe('B#2');
    expect(await promise3).toBe('C#3');
    expect(await promise4).toBe('D#4');
    expect(await promise5).toBe('E#5');
  });
}); 