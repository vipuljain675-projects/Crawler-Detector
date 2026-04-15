import type { DetectorEvent, DetectorFeatures } from "./types";

const MS = 1;

/**
 * Shannon entropy over 8 directional bins of consecutive mouse moves.
 * Higher values suggest less predictable (more human-like) movement.
 */
export function computeMovementEntropy(mouseTrail: { x: number; y: number; t: number }[]): number {
  if (mouseTrail.length < 3) return 0;

  const bins = new Array<number>(8).fill(0);
  let total = 0;

  for (let i = 2; i < mouseTrail.length; i++) {
    const a = mouseTrail[i - 2];
    const b = mouseTrail[i - 1];
    const c = mouseTrail[i];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1 || len2 < 1) continue;

    // Turn angle between successive segments (-pi..pi)
    const ang = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);
    const norm = ((ang + Math.PI) % (2 * Math.PI)) - Math.PI;
    const bin = Math.floor(((norm + Math.PI) / (2 * Math.PI)) * 8) & 7;
    bins[bin]++;
    total++;
  }

  if (total === 0) return 0;

  let h = 0;
  for (const c of bins) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  // Normalize to 0..1 vs uniform 8-way (log2(8))
  return Math.min(1, h / Math.log2(8));
}

function sortedEventTimes(events: DetectorEvent[]): number[] {
  return events
    .map((e) => e.t)
    .sort((a, b) => a - b);
}

/** Mean delay between consecutive events (any type), in ms. */
export function computeAvgActionDelay(events: DetectorEvent[]): number {
  const times = sortedEventTimes(events);
  if (times.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
  return sum / (times.length - 1);
}

/** Events per second over the span of the provided buffer. */
export function computeEventFrequency(events: DetectorEvent[]): number {
  if (events.length === 0) return 0;
  const times = sortedEventTimes(events);
  const span = Math.max(MS, times[times.length - 1] - times[0]);
  return (events.length / span) * 1000;
}

/**
 * Total time spent "idle" (gaps > 2s between any two events), in ms.
 * Useful to distinguish tab-away patterns from bot micro-bursts.
 */
export function computeIdleTime(events: DetectorEvent[], idleThresholdMs = 2000): number {
  const times = sortedEventTimes(events);
  if (times.length < 2) return 0;
  let idle = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > idleThresholdMs) idle += gap;
  }
  return idle;
}

export function extractFeatures(
  events: DetectorEvent[],
  mouseTrail: { x: number; y: number; t: number }[],
): DetectorFeatures {
  const mouse = mouseTrail.slice(-50);
  return {
    movementEntropy: computeMovementEntropy(mouse),
    avgActionDelay: computeAvgActionDelay(events),
    eventFrequency: computeEventFrequency(events),
    idleTime: computeIdleTime(events),
  };
}
