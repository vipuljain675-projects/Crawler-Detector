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
  res.json(list);
});

app.get("/", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sensei Bot-Detector | Real-time Shield</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Fira+Code&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background: #090B11;
        }
        .glass {
          background: rgba(17, 22, 35, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .glow {
          box-shadow: 0 0 40px rgba(99, 102, 241, 0.15);
        }
        .font-code {
          font-family: 'Fira Code', monospace;
        }
      </style>
    </head>
    <body class="text-slate-100 min-h-screen relative overflow-x-hidden">
      <!-- Glow effects -->
      <div class="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div class="max-w-6xl mx-auto px-6 py-10 relative z-10">
        <!-- Header -->
        <header class="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 class="text-xl font-extrabold tracking-tight text-white">Sensei Shield</h1>
              <p class="text-xs text-indigo-400 font-semibold tracking-wider uppercase">Invisible Bot Detection Hub</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-xs font-semibold text-slate-400 font-code uppercase">Live Monitor Active</span>
          </div>
        </header>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div class="glass p-5 rounded-2xl glow">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Sessions</p>
            <h3 id="stat-total" class="text-3xl font-extrabold text-white">0</h3>
          </div>
          <div class="glass p-5 rounded-2xl">
            <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Humans Verified</p>
            <h3 id="stat-humans" class="text-3xl font-extrabold text-emerald-400">0</h3>
          </div>
          <div class="glass p-5 rounded-2xl">
            <p class="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">Bots Blocked</p>
            <h3 id="stat-bots" class="text-3xl font-extrabold text-rose-400">0</h3>
          </div>
          <div class="glass p-5 rounded-2xl">
            <p class="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">Avg Human Confidence</p>
            <h3 id="stat-confidence" class="text-3xl font-extrabold text-indigo-400">0.0%</h3>
          </div>
        </div>

        <!-- Session Records -->
        <h2 class="text-lg font-bold text-white mb-5 flex items-center gap-2">
          <span>Active Sessions Log</span>
          <span class="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono font-code" id="session-count-badge">0</span>
        </h2>

        <div id="no-sessions" class="glass rounded-2xl py-16 text-center text-slate-400 border border-white/5 flex flex-col items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-slate-500 mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p class="text-base font-semibold text-slate-300">Awaiting incoming signals...</p>
          <p class="text-xs text-slate-500 mt-1">Open the login or signup page on EduVault and move your mouse to trigger events!</p>
        </div>

        <div id="sessions-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6 hidden">
          <!-- Dynamically populated cards go here -->
        </div>
      </div>

      <!-- Live Polling Script -->
      <script>
        async function fetchSessions() {
          try {
            const res = await fetch("/sessions-raw");
            if (!res.ok) throw new Error("HTTP error");
            const data = await res.json();
            updateUI(data);
          } catch (err) {
            console.error("Failed to poll sessions", err);
          }
        }

        function updateUI(sessions) {
          // Stats Calculations
          const total = sessions.length;
          const humans = sessions.filter(s => s.isHuman).length;
          const bots = total - humans;
          
          let avgConfidence = 0;
          if (humans > 0) {
            const humanConfidenceSum = sessions.filter(s => s.isHuman).reduce((sum, s) => sum + s.score, 0);
            avgConfidence = (humanConfidenceSum / humans) * 100;
          }

          // Update Stat Displays
          document.getElementById("stat-total").innerText = total;
          document.getElementById("stat-humans").innerText = humans;
          document.getElementById("stat-bots").innerText = bots;
          document.getElementById("stat-confidence").innerText = avgConfidence.toFixed(1) + "%";
          document.getElementById("session-count-badge").innerText = total;

          const noSessionsDiv = document.getElementById("no-sessions");
          const sessionsGrid = document.getElementById("sessions-grid");

          if (total === 0) {
            noSessionsDiv.classList.remove("hidden");
            sessionsGrid.classList.add("hidden");
            return;
          }

          noSessionsDiv.classList.add("hidden");
          sessionsGrid.classList.remove("hidden");

          // Build Card Grid
          sessionsGrid.innerHTML = sessions.map(s => {
            const shortId = s.sessionId.length > 24 ? s.sessionId.slice(0, 8) + '...' + s.sessionId.slice(-8) : s.sessionId;
            
            const badgeClass = s.isHuman 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20";
              
            const statusLabel = s.isHuman ? "Human Verified" : "Bot Detected";

            return \`
              <div class="glass p-6 rounded-2xl flex flex-col justify-between transition-all hover:scale-[1.01] hover:border-white/10">
                <div>
                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Session Reference</span>
                      <code class="font-code text-xs font-semibold text-slate-300 break-all bg-white/5 px-2 py-0.5 rounded">\${shortId}</code>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold \${badgeClass}">
                      \${statusLabel}
                    </span>
                  </div>

                  <!-- Confidence Meter -->
                  <div class="mb-4">
                    <div class="flex justify-between text-xs font-semibold mb-1">
                      <span class="text-slate-400">Human Likelihood</span>
                      <span class="\${s.isHuman ? 'text-emerald-400' : 'text-rose-400'} font-bold">\${(s.score * 100).toFixed(1)}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div class="h-full rounded-full \${s.isHuman ? 'bg-emerald-500' : 'bg-rose-505 bg-rose-500'}" style="width: \${s.score * 100}%"></div>
                    </div>
                  </div>

                  <!-- Details Breakdown Grid -->
                  <div class="grid grid-cols-2 gap-3 text-xs border-t border-white/5 pt-4">
                    <div>
                      <span class="text-slate-500 block mb-0.5">Entropy (Movement Randomness)</span>
                      <span class="font-bold text-slate-300 font-code">\${s.features.movementEntropy.toFixed(3)}</span>
                    </div>
                    <div>
                      <span class="text-slate-500 block mb-0.5">Action Delay Pattern</span>
                      <span class="font-bold text-slate-300 font-code">\${s.eventCount > 2 ? 'Normal' : 'Analyzing...'}</span>
                    </div>
                  </div>
                </div>

                <!-- Event Breakdown Bubbles -->
                <div class="flex flex-wrap gap-1.5 mt-5 pt-3 border-t border-white/5">
                  <span class="bg-white/5 text-slate-400 px-2 py-0.5 rounded text-[10px] font-medium font-code">🖱️ \${s.breakdown.mouse} mouse</span>
                  <span class="bg-white/5 text-slate-400 px-2 py-0.5 rounded text-[10px] font-medium font-code">📜 \${s.breakdown.scroll} scroll</span>
                  <span class="bg-white/5 text-slate-400 px-2 py-0.5 rounded text-[10px] font-medium font-code">⌨️ \${s.breakdown.keyboard} keys</span>
                  <span class="bg-white/5 text-slate-400 px-2 py-0.5 rounded text-[10px] font-medium font-code">🎯 \${s.breakdown.click} clicks</span>
                </div>
              </div>
            \`;
          }).join("");
        }

        // Poll every 3 seconds
        fetchSessions();
        setInterval(fetchSessions, 3000);
      </script>
    </body>
    </html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`human-detector server listening on http://localhost:${PORT}`);
  console.log(`Human Detector Dashboard live at: http://localhost:${PORT}/dashboard 🖥️🛡️`);
});
