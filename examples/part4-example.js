/**
 * PART 4 example (browser / bundler with DOM).
 *
 * Published package form:
 *   import { initDetector } from "human-detector-sdk";
 *
 * This file uses a relative path so it runs from the repo without publishing.
 */
import { initDetector } from "../sdk/dist/index.js";

const detector = initDetector({
  apiKey: "demo_key",
  endpoint: "http://localhost:3000",
  debug: true,
});

detector.start();

setTimeout(async () => {
  const result = await detector.getScore();
  console.log(result);
}, 10000);
