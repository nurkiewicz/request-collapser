import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestCollapser } from '../src';

describe('createRequestCollapser', () => {
  let batchProcessor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    batchProcessor = vi.fn().mockImplementation(async (items: number[]) => {
      const result = new Map<number, string>();
      items.forEach(item => result.set(item, `processed-${item}`));
      return Promise.resolve(result);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch multiple requests into a single batch operation', async () => {
    // given
    const process =
      createRequestCollapser<number, string>(batchProcessor).process;

    // when
    const promise1 = process(1);
    const promise2 = process(2);
    const promise3 = process(3);

    // Fast-forward time to trigger the batch processing
    vi.advanceTimersByTime(100);

    // then
    const [result1, result2, result3] = await Promise.all([
      promise1,
      promise2,
      promise3,
    ]);

    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1, 2, 3]);
    expect(result1).toBe('processed-1');
    expect(result2).toBe('processed-2');
    expect(result3).toBe('processed-3');
  });

  it('should respect custom timeoutMillis option', async () => {
    // given
    const customTimeout = 500;
    const process = createRequestCollapser<number, string>(batchProcessor, {
      timeoutMillis: customTimeout,
    }).process;

    // when
    const promise = process(1);

    // Fast-forward time by less than the custom timeout
    vi.advanceTimersByTime(customTimeout - 100);
    expect(batchProcessor).not.toHaveBeenCalled();

    // Fast-forward to the custom timeout
    vi.advanceTimersByTime(100);
    const result = await promise;

    // then
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should use default timeoutMillis when no options provided', async () => {
    // given
    const process =
      createRequestCollapser<number, string>(batchProcessor).process;

    // when
    const promise = process(1);

    // Fast-forward time by less than the default timeout
    vi.advanceTimersByTime(50);
    expect(batchProcessor).not.toHaveBeenCalled();

    // Fast-forward to the default timeout
    vi.advanceTimersByTime(50);
    const result = await promise;

    // then
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should allow forcing batch processing with flush', async () => {
    // given
    const { process, flush } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    const promise = process(1);
    await flush();

    // then
    const result = await promise;
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should report correct queue length', async () => {
    // given
    const { process, getQueueLength } =
      createRequestCollapser<number, string>(batchProcessor);

    // when & then
    expect(getQueueLength()).toBe(0);

    const promise1 = process(1);
    expect(getQueueLength()).toBe(1);

    const promise2 = process(2);
    expect(getQueueLength()).toBe(2);

    // Fast-forward time to trigger the batch processing
    vi.advanceTimersByTime(100);
    await Promise.all([promise1, promise2]);

    expect(getQueueLength()).toBe(0);
  });

  it('should stop processing and reject pending promises when closed', async () => {
    // given
    const { process, close } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    const promise1 = process(1);
    const promise2 = process(2);
    close();

    // then
    await expect(promise1).rejects.toThrow('Request collapser was closed');
    await expect(promise2).rejects.toThrow('Request collapser was closed');
    expect(batchProcessor).not.toHaveBeenCalled();
  });

  it('should prevent new requests from being processed after closing', async () => {
    // given
    const { process, close } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    close();
    const promise = process(1);

    // then
    await expect(promise).rejects.toThrow('Request collapser was closed');
    expect(batchProcessor).not.toHaveBeenCalled();
  });

  it('should not process batch after closing', async () => {
    // given
    const { process, close } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    const promise = process(1);
    close();
    vi.advanceTimersByTime(100);

    // then
    await expect(promise).rejects.toThrow('Request collapser was closed');
    expect(batchProcessor).not.toHaveBeenCalled();
  });

  it('should not allow flush after closing', async () => {
    // given
    const { process, flush, close } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    const promise = process(1);
    close();
    await flush();

    // then
    await expect(promise).rejects.toThrow('Request collapser was closed');
    expect(batchProcessor).not.toHaveBeenCalled();
  });

  it('should maintain queue length of 0 after closing', async () => {
    // given
    const { process, getQueueLength, close } =
      createRequestCollapser<number, string>(batchProcessor);

    // when
    const promise = process(1);
    expect(getQueueLength()).toBe(1);
    close();

    // then
    expect(getQueueLength()).toBe(0);
    await expect(promise).rejects.toThrow('Request collapser was closed');
  });

  describe('maxQueueLength mode', () => {
    it('should process immediately when queue reaches maxQueueLength', async () => {
      // given
      const { process } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          maxQueueLength: 3,
          timeoutMillis: 1000,
        }
      );

      // when
      const promise1 = process(1);
      const promise2 = process(2);
      expect(batchProcessor).not.toHaveBeenCalled();
      const promise3 = process(3); // This should trigger immediate processing

      // then
      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);
      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(batchProcessor).toHaveBeenCalledWith([1, 2, 3]);
      expect(result1).toBe('processed-1');
      expect(result2).toBe('processed-2');
      expect(result3).toBe('processed-3');
    });

    it('should process multiple batches when items exceed maxQueueLength', async () => {
      // given
      const { process } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          maxQueueLength: 2,
          timeoutMillis: 1000,
        }
      );

      // when
      const promise1 = process(1);
      const promise2 = process(2); // First batch triggers here
      await Promise.all([promise1, promise2]);

      const promise3 = process(3);
      const promise4 = process(4); // Second batch triggers here
      await Promise.all([promise3, promise4]);

      // then
      expect(batchProcessor).toHaveBeenCalledTimes(2);
      expect(batchProcessor).toHaveBeenNthCalledWith(1, [1, 2]);
      expect(batchProcessor).toHaveBeenNthCalledWith(2, [3, 4]);
    });

    it('should still allow timeout-based processing with maxQueueLength', async () => {
      // given
      const { process } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          maxQueueLength: 5,
          timeoutMillis: 100,
        }
      );

      // when
      const promise1 = process(1);
      const promise2 = process(2);
      vi.advanceTimersByTime(100);

      // then
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(batchProcessor).toHaveBeenCalledWith([1, 2]);
      expect(result1).toBe('processed-1');
      expect(result2).toBe('processed-2');
    });
  });

  describe('error handling', () => {
    it('should reject all pending promises when batch processor throws', async () => {
      // given
      const error = new Error('Batch processing failed');
      const failingProcessor = vi.fn().mockRejectedValue(error);
      const { process } =
        createRequestCollapser<number, string>(failingProcessor);

      // when
      const promise1 = process(1);
      const promise2 = process(2);
      vi.advanceTimersByTime(100);

      // then
      await expect(promise1).rejects.toThrow('Batch processing failed');
      await expect(promise2).rejects.toThrow('Batch processing failed');
    });

    it('should allow new requests after a batch failure', async () => {
      // given
      const error = new Error('Batch processing failed');
      let callCount = 0;
      const sometimesFailingProcessor = vi
        .fn()
        .mockImplementation((items: number[]): Promise<Map<number, string>> => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(error);
          }
          const result = new Map<number, string>();
          items.forEach(item => result.set(item, `processed-${item}`));
          return Promise.resolve(result);
        });
      const { process } = createRequestCollapser<number, string>(
        sometimesFailingProcessor
      );

      // when - first batch fails
      const promise1 = process(1);
      vi.advanceTimersByTime(100);
      await expect(promise1).rejects.toThrow('Batch processing failed');

      // when - second batch succeeds
      const promise2 = process(2);
      vi.advanceTimersByTime(100);
      const result2 = await promise2;

      // then
      expect(result2).toBe('processed-2');
      expect(sometimesFailingProcessor).toHaveBeenCalledTimes(2);
    });

    it('should reject if batch processor does not return result for an item', async () => {
      // given
      const incompleteProcessor = vi
        .fn()
        .mockImplementation((items: number[]): Promise<Map<number, string>> => {
          const result = new Map<number, string>();
          // Only return result for first item, skip the rest
          if (items.length > 0) {
            result.set(items[0], `processed-${items[0]}`);
          }
          return Promise.resolve(result);
        });
      const { process } =
        createRequestCollapser<number, string>(incompleteProcessor);

      // when
      const promise1 = process(1);
      const promise2 = process(2);
      vi.advanceTimersByTime(100);

      // then
      const result1 = await promise1;
      expect(result1).toBe('processed-1');
      await expect(promise2).rejects.toThrow(
        'Batch processor did not return result for item'
      );
    });

    it('should not reject queued items when a batch fails', async () => {
      // given
      vi.useRealTimers(); // Use real timers for this test due to async complexity
      let batchCount = 0;
      const slowFailingProcessor = vi
        .fn()
        .mockImplementation(async (items: number[]): Promise<
          Map<number, string>
        > => {
          batchCount++;
          if (batchCount === 1) {
            // First batch fails after a short delay
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('First batch failed');
          }
          // Second batch succeeds
          const result = new Map<number, string>();
          items.forEach(item => result.set(item, `processed-${item}`));
          return result;
        });
      const { process } = createRequestCollapser<number, string>(
        slowFailingProcessor,
        { timeoutMillis: 20 }
      );

      // when - start first batch
      const promise1 = process(1);

      // Wait for first batch to start processing
      await new Promise(resolve => setTimeout(resolve, 25));

      // Queue second item while first batch is processing
      const promise2 = process(2);

      // then - first promise should reject
      await expect(promise1).rejects.toThrow('First batch failed');

      // Second promise should eventually succeed (wait for timeout + processing)
      const result2 = await promise2;
      expect(result2).toBe('processed-2');
      expect(slowFailingProcessor).toHaveBeenCalledTimes(2);

      // Restore fake timers for subsequent tests
      vi.useFakeTimers();
    });
  });

  describe('debounce mode', () => {
    it('should reset timeout when new items are added', async () => {
      // given
      const { process } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          debounce: true,
          timeoutMillis: 100,
        }
      );

      // when
      const promise1 = process(1);
      vi.advanceTimersByTime(50); // Half way through timeout
      const promise2 = process(2);
      vi.advanceTimersByTime(50); // Should not trigger yet
      expect(batchProcessor).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50); // Should trigger now

      // then
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(batchProcessor).toHaveBeenCalledWith([1, 2]);
      expect(result1).toBe('processed-1');
      expect(result2).toBe('processed-2');
    });

    it('should process items after timeout from last item', async () => {
      // given
      const { process } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          debounce: true,
          timeoutMillis: 100,
        }
      );

      // when
      const promise1 = process(1);
      vi.advanceTimersByTime(50);
      const promise2 = process(2);
      vi.advanceTimersByTime(50);
      const promise3 = process(3);
      vi.advanceTimersByTime(50);
      expect(batchProcessor).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50);

      // then
      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);
      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(batchProcessor).toHaveBeenCalledWith([1, 2, 3]);
      expect(result1).toBe('processed-1');
      expect(result2).toBe('processed-2');
      expect(result3).toBe('processed-3');
    });

    it('should still allow immediate processing with flush', async () => {
      // given
      const { process, flush } = createRequestCollapser<number, string>(
        batchProcessor,
        {
          debounce: true,
          timeoutMillis: 100,
        }
      );

      // when
      const promise1 = process(1);
      const promise2 = process(2);
      await flush();

      // then
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(batchProcessor).toHaveBeenCalledWith([1, 2]);
      expect(result1).toBe('processed-1');
      expect(result2).toBe('processed-2');
    });
  });
});
