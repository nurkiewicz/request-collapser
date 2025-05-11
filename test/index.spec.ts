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
    // Arrange
    const process =
      createRequestCollapser<number, string>(batchProcessor).process;

    // Act
    const promise1 = process(1);
    const promise2 = process(2);
    const promise3 = process(3);

    // Fast-forward time to trigger the batch processing
    vi.advanceTimersByTime(100);

    // Assert
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
    // Arrange
    const customTimeout = 500;
    const process = createRequestCollapser<number, string>(batchProcessor, {
      timeoutMillis: customTimeout,
    }).process;

    // Act
    const promise = process(1);

    // Fast-forward time by less than the custom timeout
    vi.advanceTimersByTime(customTimeout - 100);
    expect(batchProcessor).not.toHaveBeenCalled();

    // Fast-forward to the custom timeout
    vi.advanceTimersByTime(100);
    const result = await promise;

    // Assert
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should use default timeoutMillis when no options provided', async () => {
    // Arrange
    const process =
      createRequestCollapser<number, string>(batchProcessor).process;

    // Act
    const promise = process(1);

    // Fast-forward time by less than the default timeout
    vi.advanceTimersByTime(50);
    expect(batchProcessor).not.toHaveBeenCalled();

    // Fast-forward to the default timeout
    vi.advanceTimersByTime(50);
    const result = await promise;

    // Assert
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should allow forcing batch processing with flush', async () => {
    // Arrange
    const { process, flush } =
      createRequestCollapser<number, string>(batchProcessor);

    // Act
    const promise = process(1);
    await flush();

    // Assert
    const result = await promise;
    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(batchProcessor).toHaveBeenCalledWith([1]);
    expect(result).toBe('processed-1');
  });

  it('should report correct queue length', async () => {
    // Arrange
    const { process, getQueueLength } =
      createRequestCollapser<number, string>(batchProcessor);

    // Act & Assert
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
});
