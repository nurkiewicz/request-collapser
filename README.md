# request-collapser

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Code Coverage][codecov-img]][codecov-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

Batch multiple independent requests into a single operation, reducing overhead and improving throughput.

## Use Cases

- Batch GET requests, database inserts, or message publishing
- Throttle/debounce user activity on frontend into single HTTP POST requests
- Increment counters in batches rather than individual `+1` operations
- Fetch database sequence values in batches
- Fire-and-forget operations that aren't time-sensitive

## When Not to Use

- Caching is sufficient for your use case
- You need fast response times and can't tolerate batching delays
- Operations need to run sequentially (`await` after `await`)
- Operations must be part of a transaction
- Operations must be part of a larger trace/span

## Install

```bash
npm install request-collapser
```

## Usage

```typescript
import { createRequestCollapser } from 'request-collapser';

// Define a batch processor that handles multiple items at once
const batchProcessor = async (ids: number[]): Promise<Map<number, User>> => {
  const users = await fetchUsersFromDB(ids);
  const result = new Map<number, User>();
  users.forEach(user => result.set(user.id, user));
  return result;
};

// Create the collapser
const collapser = createRequestCollapser(batchProcessor, {
  timeoutMillis: 100, // Wait up to 100ms to batch requests
  maxQueueLength: 32, // Process immediately if 32 items are queued
});

// Use it - concurrent calls will be batched together
const [user1, user2, user3] = await Promise.all([
  collapser.process(1),
  collapser.process(2),
  collapser.process(3),
]);
```

## API

### `createRequestCollapser<T, S>(batchProcessor, options)`

Creates a request collapser instance.

**Parameters:**

- `batchProcessor: (items: T[]) => Promise<Map<T, S>>` - Function that processes a batch of items and returns a Map of results keyed by the input items
- `options` - Configuration options (all optional):
  - `timeoutMillis: number` - Time to wait before processing the batch (default: 100ms)
  - `maxQueueLength: number` - Maximum queue size before forcing immediate processing
  - `debounce: boolean` - If true, each new item resets the timeout (default: false)

**Returns:** `RequestCollapser<T, S>` object with:

- `process(item: T): Promise<S>` - Add an item to the batch and get its result
- `flush(): Promise<void>` - Force immediate processing of all pending items
- `getQueueLength(): number` - Get the current number of pending items
- `close(): void` - Stop the collapser and reject all pending promises

## Modes of Operation

### Time-based (default)

Items are batched and processed after `timeoutMillis` elapses.

```typescript
const collapser = createRequestCollapser(processor, {
  timeoutMillis: 100,
});
```

### Size-based

Items are processed immediately when the queue reaches `maxQueueLength`.

```typescript
const collapser = createRequestCollapser(processor, {
  maxQueueLength: 32,
  timeoutMillis: 60000, // Long timeout, effectively size-based
});
```

### Time-based with Size Cap (recommended)

Items are processed either when timeout elapses or queue reaches max size.

```typescript
const collapser = createRequestCollapser(processor, {
  timeoutMillis: 100,
  maxQueueLength: 32,
});
```

### Debounce Mode

Each new item resets the timeout, useful for user activity batching.

```typescript
const collapser = createRequestCollapser(processor, {
  timeoutMillis: 100,
  debounce: true,
});
```

## Example: Batched Counter Service

```typescript
import { createRequestCollapser, RequestCollapser } from 'request-collapser';

class BatchedCounterService {
  private readonly collapser: RequestCollapser<number, void>;

  constructor(private readonly counterService: CounterService) {
    this.collapser = createRequestCollapser<number, void>(
      async (values: number[]) => {
        const total = values.reduce((sum, value) => sum + value, 0);
        await this.counterService.incBy(total);
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

// Multiple concurrent increments are batched into a single call
const service = new BatchedCounterService(counterService);
await Promise.all([
  service.incBy(1),
  service.incBy(2),
  service.incBy(3),
]); // Results in a single counterService.incBy(6) call
```

## License

MIT

[build-img]: https://github.com/nurkiewicz/request-collapser/actions/workflows/release.yml/badge.svg
[build-url]: https://github.com/nurkiewicz/request-collapser/actions/workflows/release.yml
[downloads-img]: https://img.shields.io/npm/dt/request-collapser
[downloads-url]: https://www.npmtrends.com/request-collapser
[npm-img]: https://img.shields.io/npm/v/request-collapser
[npm-url]: https://www.npmjs.com/package/request-collapser
[issues-img]: https://img.shields.io/github/issues/nurkiewicz/request-collapser
[issues-url]: https://github.com/nurkiewicz/request-collapser/issues
[codecov-img]: https://codecov.io/gh/nurkiewicz/request-collapser/branch/main/graph/badge.svg
[codecov-url]: https://codecov.io/gh/nurkiewicz/request-collapser
[semantic-release-img]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]: https://github.com/semantic-release/semantic-release
[commitizen-img]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]: http://commitizen.github.io/cz-cli/
