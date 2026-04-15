/** Raw event captured in the browser (before batching). */
export type DetectorEvent =
  | { type: "mouse"; x: number; y: number; t: number }
  /** deltaX/deltaY are scroll deltas since last sample (not absolute scroll offsets). */
  | { type: "scroll"; deltaX: number; deltaY: number; t: number }
  | { type: "click"; t: number }
  | { type: "keyboard"; t: number }
  | { type: "visibility"; state: "visible" | "hidden"; t: number };

/** Features derived from recent signals (sent with each batch). */
export interface DetectorFeatures {
  movementEntropy: number;
  avgActionDelay: number;
  eventFrequency: number;
  idleTime: number;
}

export interface InitConfig {
  apiKey: string;
  endpoint: string;
  debug?: boolean;
}

export interface ScoreResult {
  isHuman: boolean;
  confidence: number;
  score: number;
}

export interface HumanDetector {
  start(): void;
  stop(): void;
  getScore(): Promise<ScoreResult>;
}
