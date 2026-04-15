import { extractFeatures } from "./features";
import type { DetectorEvent, HumanDetector, InitConfig, ScoreResult } from "./types";

const STORAGE_KEY = "human_detector_session_id";
const BATCH_MS = 5000;
const MOUSE_CAP = 50;
/** Ignore near-duplicate bursts (same bucket / tiny deltas) within this window. */
const ANTI_SPAM_MS = 40;
const SCORE_PATH = "/score";
const COLLECT_PATH = "/collect";

function log(debug: boolean, ...args: unknown[]) {
  if (debug) console.log("[human-detector-sdk]", ...args);
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = createSessionId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return createSessionId();
  }
}

/**
 * Fingerprint a rapid event for de-duplication: same "slot" within ANTI_SPAM_MS is dropped.
 */
function eventSpamKey(e: DetectorEvent): string {
  switch (e.type) {
    case "mouse":
      return `mouse:${Math.round(e.x / 4)}:${Math.round(e.y / 4)}`;
    case "scroll":
      return `scroll:${Math.sign(e.deltaX)}:${Math.sign(e.deltaY)}`;
    case "click":
      return "click";
    case "keyboard":
      return "key";
    case "visibility":
      return `vis:${e.state}`;
    default:
      return "unknown";
  }
}

export function initDetector(config: InitConfig): HumanDetector {
  const { apiKey, endpoint, debug = false } = config;
  const base = endpoint.replace(/\/$/, "");
  const sessionId = getOrCreateSessionId();

  const events: DetectorEvent[] = [];
  const mouseTrail: { x: number; y: number; t: number }[] = [];
  let running = false;
  let batchTimer: ReturnType<typeof setInterval> | null = null;
  let lastSpamKey = "";
  let lastSpamAt = 0;

  const ts = () => Date.now();

  const pushEvent = (e: DetectorEvent) => {
    const t = e.t;
    const key = `${eventSpamKey(e)}`;
    if (key === lastSpamKey && t - lastSpamAt < ANTI_SPAM_MS) {
      log(debug, "anti-spam: skipped duplicate burst", e.type);
      return;
    }
    lastSpamKey = key;
    lastSpamAt = t;
    events.push(e);
  };

  const onMouseMove = (ev: MouseEvent) => {
    const t = ts();
    const point = { x: ev.clientX, y: ev.clientY, t };
    mouseTrail.push(point);
    if (mouseTrail.length > MOUSE_CAP) mouseTrail.splice(0, mouseTrail.length - MOUSE_CAP);
    pushEvent({ type: "mouse", x: ev.clientX, y: ev.clientY, t });
  };

  let lastScrollX = 0;
  let lastScrollY = 0;

  const onScroll = () => {
    const t = ts();
    const dx = window.scrollX - lastScrollX;
    const dy = window.scrollY - lastScrollY;
    lastScrollX = window.scrollX;
    lastScrollY = window.scrollY;
    if (dx === 0 && dy === 0) return;
    pushEvent({ type: "scroll", deltaX: dx, deltaY: dy, t });
  };

  const onClick = () => {
    pushEvent({ type: "click", t: ts() });
  };

  const onKeyDown = () => {
    pushEvent({ type: "keyboard", t: ts() });
  };

  const onVisibility = () => {
    pushEvent({
      type: "visibility",
      state: document.visibilityState === "visible" ? "visible" : "hidden",
      t: ts(),
    });
  };

  const flush = async () => {
    if (events.length === 0) {
      log(debug, "flush: no events");
      return;
    }
    const slice = events.splice(0, events.length);
    const features = extractFeatures(slice, mouseTrail);
    const body = JSON.stringify({
      apiKey,
      sessionId,
      events: slice,
      features,
    });
    try {
      const res = await fetch(`${base}${COLLECT_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
      if (!res.ok) log(debug, "collect non-OK", res.status);
      else log(debug, "collect OK", slice.length, "events");
    } catch (err) {
      log(debug, "collect failed (network)", err);
      // Re-queue a shallow copy so data isn't lost on transient failures
      events.unshift(...slice);
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    lastScrollX = window.scrollX;
    lastScrollY = window.scrollY;
    log(debug, "start", { sessionId, base });

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibility);

    batchTimer = setInterval(() => {
      void flush();
    }, BATCH_MS);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    log(debug, "stop");

    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("visibilitychange", onVisibility);

    if (batchTimer) {
      clearInterval(batchTimer);
      batchTimer = null;
    }
    void flush();
  };

  const getScore = async (): Promise<ScoreResult> => {
    const fallback: ScoreResult = {
      isHuman: true,
      confidence: 0.5,
      score: 0.5,
    };
    try {
      const res = await fetch(`${base}${SCORE_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, sessionId }),
      });
      if (!res.ok) {
        log(debug, "score HTTP error", res.status);
        return fallback;
      }
      const data = (await res.json()) as Partial<ScoreResult>;
      const score = typeof data.score === "number" ? data.score : fallback.score;
      const confidence = typeof data.confidence === "number" ? data.confidence : score;
      const isHuman = typeof data.isHuman === "boolean" ? data.isHuman : score > 0.5;
      return { isHuman, confidence, score };
    } catch (err) {
      log(debug, "score request failed, using fallback", err);
      return fallback;
    }
  };

  return { start, stop, getScore };
}
