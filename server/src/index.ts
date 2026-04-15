import cors from "cors";
import express from "express";
import type { SessionRecord, StoredEvent, StoredFeatures } from "./scoring.js";
import { computeHumanScore } from "./scoring.js";

const PORT = Number(process.env.PORT) || 3000;

/** In-memory session store (MVP); swap for Redis/DB for production). */
const sessions = new Map<string, SessionRecord>();

const MAX_EVENTS = 4000;

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

  const prev = sessions.get(sessionId) ?? { events: [] };
  const next: SessionRecord = {
    events: mergeEvents(prev.events, events as StoredEvent[]),
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
  res.json({
    isHuman,
    confidence: score,
    score,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`human-detector server listening on http://localhost:${PORT}`);
});
