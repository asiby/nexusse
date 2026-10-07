[![CI](https://github.com/asiby/nexusse/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/asiby/nexusse/actions/workflows/ci.yml?query=branch%3Amain)
[![npm](https://img.shields.io/npm/v/nexusse)](https://www.npmjs.com/package/nexusse)
[![last commit](https://img.shields.io/github/last-commit/asiby/nexusse)](https://github.com/asiby/nexusse/commits/main)
[![license](https://img.shields.io/github/license/asiby/nexusse)](LICENSE)

# Nexusse

A small publish/subscribe hub for [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), built on Express and written in TypeScript. Its name is _Nexus_ + _SSE_, and it is inspired by [Mercure](https://mercure.rocks/).

Clients subscribe to one or more **topics** over a long-lived HTTP connection. Your backend publishes **events** to topics with a plain `POST` request, and Nexusse pushes each event to every client listening on those topics.

```ts
import Nexusse from 'nexusse'

const hub = new Nexusse()
hub.listen() // Nexusse server listening on port 3000
```

> **Status:** Nexusse is a lightweight hub for learning, development and small deployments. It has no authentication yet. See the [roadmap](#roadmap) before exposing it to the public internet.

## Features

- Subscribe to several topics on one connection; an event sent to several of them is delivered once.
- Publish from any language with a JSON `POST` request.
- Keep-alive comments so idle connections survive proxies and load balancers.
- `/status` endpoint with connection, subscription and per-topic counts.
- Typed, validated options per hub; several hubs can run in one process.
- Ships CommonJS, ES modules and TypeScript declarations.

## Installation

Requires Node.js 22 or later.

```sh
npm install nexusse
```

## Quick start

Start a hub:

```ts
import Nexusse from 'nexusse'

const hub = new Nexusse({ port: 3000 })

hub.listen(null, () => {
    console.log(`Hub ready on port ${hub.get('port')}`)
})
```

CommonJS works too:

```js
const Nexusse = require('nexusse')
// or: const { Nexusse } = require('nexusse')
```

Subscribe from a browser:

```js
const events = new EventSource('http://localhost:3000/subscribe?topics=news&topics=sports')

events.addEventListener('headline', (event) => {
    console.log(JSON.parse(event.data)) // { title: 'Hello' }
})
```

Publish from anywhere:

```sh
curl -X POST http://localhost:3000/publish \
  -H 'Content-Type: application/json' \
  -d '{"event": "headline", "topics": ["news"], "data": {"title": "Hello"}}'
```

## HTTP API

All endpoints allow cross-origin requests from any origin.

### `GET /subscribe?topics=<topic>[&topics=<topic>...]`

Opens an event stream (`text/event-stream`). Pass `topics` once per topic. Up to `maxSubscriptionTopics` topics are allowed (default 20).

The stream starts with a `data:connected` message. It then carries each published event, plus a `: Stay alive` comment every `keepAliveInterval` seconds. When the client disconnects, it is unsubscribed from all its topics.

| Status | When |
| --- | --- |
| `200` | Subscribed; the stream stays open. |
| `400` | No topic, or too many topics. The body is `{"error": "..."}`. |

### `POST /publish`

Sends an event to every subscriber of the given topics. Body (JSON):

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event` | string | yes | Event name. Browser clients listen for it with `addEventListener(event, ...)`. |
| `topics` | string or string[] | yes | Target topic(s), up to `maxPublishingTopics` (default 2). |
| `data` | any JSON value except `null` | yes | Payload. Sent as JSON, so clients read it with `JSON.parse(event.data)`. |

| Status | When |
| --- | --- |
| `200` | Delivered to all current subscribers. The body is `{"ok": true}`. |
| `400` | Invalid payload (missing field, too many topics, body is not a JSON object). The body is `{"error": "..."}`. |

### `GET /status`

Returns the hub's current state:

```json
{
  "connections": 2,
  "subscriptions": 3,
  "topics": 2,
  "summary": { "news": 2, "sports": 1 }
}
```

`connections` counts clients, `subscriptions` counts client and topic pairs, and `summary` gives the number of subscribers per topic. Topics disappear once their last subscriber disconnects.

## Options

Pass options to the constructor, or change them later with `set()`. Invalid values throw a `RangeError`, and unknown option names a `TypeError`.

| Option | Default | Description |
| --- | --- | --- |
| `port` | `3000` | Port used by `listen()` when none is given. `0` picks a free port. |
| `keepAliveInterval` | `40` | Seconds between keep-alive comments. Minimum `5`. |
| `maxPublishingTopics` | `2` | Maximum topics a single publish can target. |
| `maxSubscriptionTopics` | `20` | Maximum topics a single subscription can listen to. |

The defaults are exported as `defaultOptions`, and the type as `NexusseOptions`.

## JavaScript API

### `new Nexusse(options?)`

Creates a hub. The keep-alive timer starts right away; it does not keep the process alive on its own.

### `hub.listen(port?, callback?)`

Starts accepting connections and returns the underlying `http.Server`.

- `port`: overrides the `port` option. `null` or omitted uses the option.
- `callback`: called once the server is listening. Without one, Nexusse logs `Nexusse server listening on port <port>`. Binding errors such as `EADDRINUSE` are emitted as `error` events on the returned server.

### `hub.close()`

Stops the keep-alive timer, closes all open event streams and stops the server. Returns a promise.

### `hub.get(option)` / `hub.set(option, value)`

Reads or changes an option. `set()` returns the hub, so calls can be chained. Setting `keepAliveInterval` restarts the timer with the new interval.

### `hub.startKeepAliveTimer()` / `hub.stopKeepAliveTimer()`

Starts or stops the keep-alive timer. It starts automatically, so you only need these to pause keep-alives. Both return the hub.

## Migrating from 1.x

- Options are typed and validated per hub. `max_publishing_topics_counts` is now `maxPublishingTopics`, and `max_subscription_topics_counts` is now `maxSubscriptionTopics`. Invalid values throw instead of being ignored.
- Options are no longer read from command-line arguments, environment variables or `config.json`. Pass them to the constructor.
- `listen(port, callback)` takes a callback (it used to be documented as Express options), returns the `http.Server`, and only calls the callback once the server is listening.
- `set()`, `startKeepAliveTimer()` and `stopKeepAliveTimer()` return the hub.
- `/publish` responds with JSON bodies, and its `topics` field can be a single string.
- `/status` returns a JSON object instead of a JSON-encoded string.
- Node.js 22 or later is required.

## Development

```sh
npm ci              # install dependencies and build
npm test            # run the test suite (Vitest)
npm run typecheck   # type-check sources and tests
npm run build       # build dist/ (CommonJS, ESM and type declarations)
npm start           # build and run a hub on port 3000
npm run build-and-start-demo   # run the demo app in demo/
```

CI runs the type check, tests and build on Node.js 22 and 24 for every push and pull request.

### Releasing

1. Bump `version` in `package.json` (for example with `npm version minor`) and commit.
2. Push a matching tag, such as `v2.1.0`.
3. The Release workflow runs CI, builds and packs the package in a job without npm rights, then a separate job stages that tarball on npm with provenance using npm trusted publishing.
4. Approve the staged release in the **Staged Packages** tab on npmjs.com, or with `npm stage approve <stage-id>` (see `npm stage list nexusse`). Approval requires 2FA; nothing is public until then. To check exactly what will be published first, run `npm stage download <stage-id>`.

## Roadmap

- Authentication and access control for publishers and subscribers
- Configurable CORS, including per-endpoint settings
- Multiple endpoints ("channels") with their own limits and topics; see [docs/channels-config-sketch.json](docs/channels-config-sketch.json)
- Event IDs and `Last-Event-ID` replay for reconnecting clients
- HTML and SSE versions of the status endpoint
- A Docker image

## License

[MIT](LICENSE)
