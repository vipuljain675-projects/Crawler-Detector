/**
 * Server-side v1 heuristic scoring.
 * Designed to be replaced or augmented by ML later: keep inputs as structured session stats.
 */

export type StoredEvent =
  | { type: "mouse"; x: number; y: number; t: number }
  | { type: "scroll"; deltaX: number; deltaY: number; t: number }
  | { type: "click"; t: number }
  | { type: "keyboard"; t: number }
  | { type: "visibility"; state: "visible" | "hidden"; t: number };

export interface StoredFeatures {
  movementEntropy: number;
  avgActionDelay: number;
  eventFrequency: number;
  idleTime: number;
}

export interface SessionRecord {
  events: StoredEvent[];
  /** Latest client-computed features (optional, used when present). */
  features?: StoredFeatures;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** High entropy → more human-like (less predictable paths). */
export function entropyScore(entropy: number): number {
  // entropy is 0..1 from SDK; treat very flat movement as bot-like
  if (entropy < 0.12) return 0.15;
  return clamp01((entropy - 0.12) / 0.88);
}

/**
 * Extremely consistent, machine-like intervals → low score.
 * Humans usually show more jitter in inter-event times once volume is sufficient.
 */
export function timingRegularityPenalty(events: StoredEvent[]): number {
  if (events.length < 12) return 0;
  const times = events.map((e) => e.t).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean < 1e-3) return 1;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  // cv near 0 → robotic; healthy human interaction often > 0.15–0.2 for mixed events
  if (cv < 0.05) return 0.85;
  if (cv < 0.1) return 0.45;
  return 0;
}

/** Very low average delay with many events suggests scripted bursts. */
export function delayScore(avgDelayMs: number, eventCount: number): number {
  if (eventCount < 3) return 0.55;
  if (avgDelayMs < 8) return 0.1;
  if (avgDelayMs < 25) return 0.35;
  if (avgDelayMs < 120) return clamp01(0.35 + (avgDelayMs - 25) / 200);
  return 1;
}

/**
 * Real users typically produce some pointer motion and occasional scroll/keyboard.
 * Absence of both is a strong bot signal for interactive pages.
 */
export function interactionScore(events: StoredEvent[]): number {
  let mouse = 0;
  let scroll = 0;
  let keys = 0;
  for (const e of events) {
    if (e.type === "mouse") mouse++;
    if (e.type === "scroll") scroll++;
    if (e.type === "keyboard") keys++;
  }
  if (mouse === 0 && scroll === 0) return 0.05;
  let s = 0.2;
  if (mouse > 5) s += 0.35;
  else s += clamp01(mouse / 20) * 0.35;
  if (scroll > 0) s += 0.2;
  if (keys > 0) s += 0.1;
  return clamp01(s);
}

/**
 * Final 0..1 "human likelihood" used by the API.
 * Weights can later be learned; keep explicit for auditability.
 */
export function computeHumanScore(record: SessionRecord): number {
  const events = record.events;
  const feats = record.features;

  const ent = typeof feats?.movementEntropy === "number" ? feats.movementEntropy : 0;
  const avgDelay =
    typeof feats?.avgActionDelay === "number" && feats.avgActionDelay > 0
      ? feats.avgActionDelay
      : simpleAvgDelay(events);

  const eScore = entropyScore(ent);
  const dScore = delayScore(avgDelay, events.length);
  let iScore = interactionScore(events);

  // Penalize suspiciously metronomic timing even if other signals look fine
  const penalty = timingRegularityPenalty(events);
  iScore = clamp01(iScore * (1 - penalty * 0.85));

  const score = 0.4 * eScore + 0.3 * dScore + 0.3 * iScore;
  return clamp01(score);
}

function simpleAvgDelay(events: StoredEvent[]): number {
  if (events.length < 2) return 0;
  const times = events.map((e) => e.t).sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
  return sum / (times.length - 1);
}
