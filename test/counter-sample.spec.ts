/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequestCollapser, RequestCollapser } from '../src';

interface CounterService {
  incBy(value: number): Promise<void>;
}

class BatchedCounterService implements CounterService {
  private readonly collapser: RequestCollapser<number, void>;

  constructor(private readonly counterService: CounterService) {
    this.collapser = createRequestCollapser<number, void>(
      async (values: number[]) => {
        const total = values.reduce((sum, value) => sum + value, 0);
        await this.counterService.incBy(total);

        // Create a map with void values for each input value
        const result = new Map<number, void>();
        values.forEach(value => result.set(value, undefined));
        return result;
      }
    );
  }

  async incBy(value: number): Promise<void> {
    await this.collapser.process(value);
  }
}

describe('BatchedCounterService', () => {
  let counterService: CounterService;
  let batchedCounterService: BatchedCounterService;

  beforeEach(() => {
    counterService = {
      incBy: vi.fn().mockImplementation(async () => {
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 10));
      }),
    };
    batchedCounterService = new BatchedCounterService(counterService);
  });

  it('should batch multiple increment requests into a single call', async () => {
    // given
    const smallIncrements = [1, 2, 3, 4, 5];

    // when
    const promises = smallIncrements.map(value =>
      batchedCounterService.incBy(value)
    );
    await Promise.all(promises);

    // then
    expect(vi.mocked(counterService.incBy).mock.calls.length).toBe(1);
    expect(vi.mocked(counterService.incBy).mock.calls[0][0]).toBe(15); // sum of all increments
  });

  it('should handle concurrent increment requests', async () => {
    // given
    const firstBatch = [1, 2, 3];
    const secondBatch = [4, 5, 6];

    // when
    const firstPromises = firstBatch.map(value =>
      batchedCounterService.incBy(value)
    );
    const secondPromises = secondBatch.map(value =>
      batchedCounterService.incBy(value)
    );
    await Promise.all([...firstPromises, ...secondPromises]);

    // then
    expect(vi.mocked(counterService.incBy).mock.calls.length).toBe(1);
    expect(vi.mocked(counterService.incBy).mock.calls[0][0]).toBe(21); // sum of all increments
  });

  it('should maintain the same interface as the original service', async () => {
    // given
    const value = 42;

    // when
    await batchedCounterService.incBy(value);

    // then
    expect(vi.mocked(counterService.incBy).mock.calls.length).toBe(1);
    expect(vi.mocked(counterService.incBy).mock.calls[0][0]).toBe(value);
  });
});
