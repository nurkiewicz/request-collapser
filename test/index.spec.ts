import { createRequestCollapser } from '../src';

describe('createRequestCollapser', () => {
  it('should batch multiple requests into a single batch operation', async () => {
    // Arrange
    const batchProcessor = jest.fn().mockImplementation((items: number[]) => {
      const result = new Map<number, string>();
      items.forEach(item => result.set(item, `processed-${item}`));
      return result;
    });

    const collapser = createRequestCollapser<number, string>(batchProcessor);

    // Act
    const promise1 = collapser(1);
    const promise2 = collapser(2);
    const promise3 = collapser(3);

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
});
