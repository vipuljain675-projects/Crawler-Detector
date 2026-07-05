import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import type { SessionRecord, StoredEvent, StoredFeatures } from "./scoring.js";
import { computeHumanScore } from "./scoring.js";

const PORT = Number(process.env.PORT) || 3000;

// Extended type to keep track of lastActivity for garbage collection
type TrackedSessionRecord = SessionRecord & { lastActivity: number };

/** In-memory session store (MVP); swap for Redis/DB for production). */
const sessions = new Map<string, TrackedSessionRecord>();

const MAX_EVENTS = 4000;

// Real-time Traffic Log structure for Chart.js
interface TrafficPoint {
  timestamp: string; // HH:MM:SS
  score: number;
  isHuman: boolean;
}
const trafficHistory: TrafficPoint[] = [];

// Session Garbage Collector (RAM Protection)
// Clean up sessions older than 30 minutes, check every 2 minutes
const SESSION_TTL = 30 * 60 * 1000; 
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [sid, record] of sessions.entries()) {
    if (now - record.lastActivity > SESSION_TTL) {
      sessions.delete(sid);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 [Garbage Collector] Cleaned up ${cleaned} expired sessions from RAM.`);
  }
}, 2 * 60 * 1000);

function mergeEvents(existing: StoredEvent[], incoming: StoredEvent[]): StoredEvent[] {
  const merged = existing.concat(incoming);
  if (merged.length <= MAX_EVENTS) return merged;
  return merged.slice(merged.length - MAX_EVENTS);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));

app.post("/collect", (req, res) => {
  const { apiKey, sessionId, events, features } = req.body ?? {};
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "apiKey required" });
    return;
  }
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  if (!Array.isArray(events)) {
    res.status(400).json({ error: "events must be an array" });
    return;
  }

  const prev = sessions.get(sessionId) ?? { events: [], lastActivity: Date.now() };
  const next: TrackedSessionRecord = {
    events: mergeEvents(prev.events, events as StoredEvent[]),
    lastActivity: Date.now()
  };
  if (features && typeof features === "object") {
    next.features = features as StoredFeatures;
  }
  sessions.set(sessionId, next);
  res.json({ ok: true, stored: next.events.length });
});

app.post("/score", (req, res) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  const record = sessions.get(sessionId);
  if (!record || record.events.length === 0) {
    res.status(404).json({ error: "session not found or empty" });
    return;
  }
  const score = computeHumanScore(record);
  const isHuman = score > 0.5;
  
  // Update lastActivity timestamp
  record.lastActivity = Date.now();
  sessions.set(sessionId, record);

  // Push score point to traffic logs
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  trafficHistory.push({
    timestamp: timeString,
    score: Number(score.toFixed(3)),
    isHuman
  });
  if (trafficHistory.length > 30) {
    trafficHistory.shift(); // Keep last 30 requests to keep graph clean
  }

  // Print score details directly in the terminal logs
  console.log(`\n======================================================`);
  console.log(`🤖 [BOT DETECT SCORE]`);
  console.log(`   Session ID: ${sessionId}`);
  console.log(`   Events Count: ${record.events.length}`);
  console.log(`   Calculated Score: ${score.toFixed(3)} (0.0 = Bot, 1.0 = Human)`);
  console.log(`   Verification Result: ${isHuman ? "✅ HUMAN" : "❌ BOT / ROBOT"}`);
  console.log(`======================================================\n`);

  res.json({
    isHuman,
    confidence: score,
    score,
  });
});

app.get("/sessions-raw", (_req, res) => {
  const list = Array.from(sessions.entries()).map(([sessionId, record]) => {
    const score = computeHumanScore(record);
    const isHuman = score > 0.5;
    const mouseCount = record.events.filter(e => e.type === "mouse").length;
    const scrollCount = record.events.filter(e => e.type === "scroll").length;
    const keyCount = record.events.filter(e => e.type === "keyboard").length;
    const clickCount = record.events.filter(e => e.type === "click").length;
    
    return {
      sessionId,
      score: Number(score.toFixed(3)),
      isHuman,
      eventCount: record.events.length,
      breakdown: { mouse: mouseCount, scroll: scrollCount, keyboard: keyCount, click: clickCount },
      features: record.features || { movementEntropy: 0 }
    };
  });
  res.json({
    sessions: list,
    trafficHistory: trafficHistory
  });
});

app.get("/", (_req, res) => {
  try {
    const htmlPath = path.join(process.cwd(), "src/dashboard.html");
    res.sendFile(htmlPath);
  } catch (err) {
    res.status(500).send("Error loading dashboard HTML template");
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`human-detector server listening on http://localhost:${PORT}`);
  console.log(`Human Detector Dashboard live at: http://localhost:${PORT}/ 🖥️🛡️`);
});
