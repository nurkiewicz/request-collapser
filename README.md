

# Use cases
* collapse multiple, independent requests, into a single batch one
* batch GET requests, database inserts, message publishing
* fire-and-forget operations that are not time-sensitive
* batching user-activity on frontend to send single HTTP POST instead of multiple small ones (aka. throttling, debouncing)
* incrementing a counter in batches, rather than multiple `+1`
* fetching batch of database sequence values

# Features
* Supports array and map input
* Advanced testing capabilities with fake timers
* Optional deduplication
* Run immediately if necessary
* Built-in metrics (collapsed request size, queueing time)
* Custom queue implementation

# When not to use
* Caching works good
* You need fast response time and can't tolerate lag
* When your operations need to run sequentially (`await` after `await`)
* When your operation is part of transaction
* When operation must be part of larger trace/span

# Modes of operation
* Time-based
* Size-based
* Time-based with size cap (default)

# Configuration options
* Window length, default 100ms
* Window size, default 32

# API
* `flush()` - to force batch operation run
* `skipQueue` - to run operation immediately, without queuing
* `enableDeduplication` - same requests are run only once. May include additional comparison method
* `getQueueLength()`

# request-collapser

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Code Coverage][codecov-img]][codecov-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

> My awesome module

## Install

```bash
npm install request-collapser
```

[build-img]:https://github.com/nurkiewicz/request-collapser/actions/workflows/release.yml/badge.svg
[build-url]:https://github.com/nurkiewicz/request-collapser/actions/workflows/release.yml
[downloads-img]:https://img.shields.io/npm/dt/request-collapser
[downloads-url]:https://www.npmtrends.com/request-collapser
[npm-img]:https://img.shields.io/npm/v/request-collapser
[npm-url]:https://www.npmjs.com/package/request-collapser
[issues-img]:https://img.shields.io/github/issues/nurkiewicz/request-collapser
[issues-url]:https://github.com/nurkiewicz/request-collapser/issues
[codecov-img]:https://codecov.io/gh/nurkiewicz/request-collapser/branch/main/graph/badge.svg
[codecov-url]:https://codecov.io/gh/nurkiewicz/request-collapser
[semantic-release-img]:https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]:https://github.com/semantic-release/semantic-release
[commitizen-img]:https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]:http://commitizen.github.io/cz-cli/
