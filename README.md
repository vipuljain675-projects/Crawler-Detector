# Human Detector

Human Detector is a lightweight behavior-based detection project with:

- a browser SDK (`sdk`) that captures interaction signals
- an Express server (`server`) that stores sessions and scores human-likelihood

This repository is a good starting point for anti-bot experiments, prototypes, or interview/demo projects.

## Project Structure

- `sdk/`: publishable npm package (`human-detector-sdk`)
- `server/`: scoring API (Node + Express + TypeScript)
- `examples/`: browser demo files using the built SDK

## Prerequisites

- Node.js `>= 18`
- npm (comes with Node.js)

Check your version:

```bash
node -v
npm -v
```

## Quick Start

From the repository root:

```bash
# install dependencies
npm install --prefix sdk
npm install --prefix server

# build sdk + server
npm run build

# start server on http://localhost:3000
npm run start:server
```

Server health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"ok":true,"sessions":0}
```

## Development Mode

To run the server with auto-reload:

```bash
npm run dev:server
```

## Run the Browser Demo

1. Build once and start the server:

```bash
npm run build
npm run start:server
```

2. In a second terminal, serve the `examples` folder over HTTP:

```bash
npx serve examples
```

3. Open `browser-demo.html` from the local URL printed by `serve` (do not use `file://`).
4. Interact with the page for ~10 seconds.
5. The page prints the score response JSON.

## API Endpoints

Base URL: `http://localhost:3000`

### `POST /collect`

Stores session events/features.

Request body:

```json
{
  "apiKey": "demo_key",
  "sessionId": "session-123",
  "events": [
    {"type":"mouse","x":120,"y":220,"t":1000},
    {"type":"scroll","deltaX":0,"deltaY":120,"t":1300},
    {"type":"click","t":1600}
  ],
  "features": {
    "movementEntropy": 0.7,
    "avgActionDelay": 150,
    "eventFrequency": 3.3,
    "idleTime": 200
  }
}
```

Example:

```bash
curl -X POST http://localhost:3000/collect \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"demo_key","sessionId":"session-123","events":[{"type":"mouse","x":120,"y":220,"t":1000},{"type":"click","t":1600}]}'
```

### `POST /score`

Returns score for a session.

Request body:

```json
{
  "sessionId": "session-123"
}
```

Example:

```bash
curl -X POST http://localhost:3000/score \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session-123"}'
```

Response shape:

```json
{
  "isHuman": true,
  "confidence": 0.78,
  "score": 0.78
}
```

### `GET /health`

Basic health + session count.

## SDK Usage (Local Repo)

Build SDK first:

```bash
npm run build --prefix sdk
```

Then import from local build:

```js
import { initDetector } from "../sdk/dist/index.js";

const detector = initDetector({
  apiKey: "demo_key",
  endpoint: "http://localhost:3000",
  debug: true
});

detector.start();

setTimeout(async () => {
  const result = await detector.getScore();
  console.log(result);
  detector.stop();
}, 10000);
```

## Available Scripts

From root:

- `npm run build:sdk`
- `npm run build:server`
- `npm run build`
- `npm run dev:server`
- `npm run start:server`

## Notes

- Current session storage is in-memory (resets when server restarts).
- Current scoring is heuristic and intentionally simple for MVP iteration.
- For production use, add persistent storage and stronger model/rules.

## Troubleshooting

- **Port already in use**: set a custom port before start  
  `PORT=4000 npm run start:server`
- **No score returned**: ensure `collect` is called before `score` for the same `sessionId`.
- **Demo import fails**: rebuild SDK with `npm run build --prefix sdk`.

