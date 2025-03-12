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
}); 