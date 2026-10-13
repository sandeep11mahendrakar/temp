# MCP + API Dual-Way Setup — Vision Architecture (Review-3)

One pipeline, two brains. Everything runs on THIS machine (Windows) —
no hosting, no server to deploy, no credit card required for the free lanes.

## 1. The idea in 30 seconds

| | API way | MCP way |
|---|---|---|
| Brain (decides actions) | An LLM called over HTTPS (`lib/llmProvider.js`) | The agent inside your editor (Claude/Codex/opencode), free subscription |
| Hands (sees + clicks) | Same local pipeline: Playwright + YOLO + OCR | Same local pipeline, exposed as MCP tools |
| Contract | Strict JSON (visual DOM, actions, test cases) | SAME JSON shapes — brains are interchangeable |
| Cost | Free-tier quotas (~50 req/day OpenRouter) | Near-unlimited (your editor subscription) |

Switching brains = changing `vision/.env` (API) or starting the MCP server
instead of `runVision.js` (MCP). No code changes. Verified 2026-10-11.

## 2. Prerequisites (already done on this machine)

- Node 18+ (`node --version`), Python 3.10+ with torch/ultralytics/pytesseract/flask
- Tesseract at `C:\Program Files\Tesseract-OCR\tesseract.exe`
- Playwright Chromium (`npx playwright install chromium` inside `vision/`)
- `vision/node_modules` installed (`npm install` inside `vision/`)
- YOLO weights: `vision/services/yolo-service/screenparser_best.pt` (~153 MB,
  from HuggingFace `docling-project/ScreenParser`, file `best.pt`)
- `vision/.env` created from `vision/.env.example` (keys live ONLY there;
  never commit, never paste into docs or chat)

## 3. API way (default, works today)

```bat
cd "C:\Users\sandeep\pes\CAPSTONE\sem 6 reivew 3\code\vision"
node runVision.js https://example.com              :: one-shot: perceive + generate (1-2 LLM calls)
node runVision.js --explore https://example.com    :: autonomous explore (many calls; set EXPLORE_MAX_STEPS=25)
node runVision.js --explore <url> --goal "test the login"   :: goal runs (R3-T3; needs goalPlanner)
node src/executeTests.js storage\outputs\<test_cases...>.json <url>   :: replay, zero LLM calls
```

- Headed browser is default (`VISION_HEADED=true` in `.env`); set
  `VISION_HEADED=false` for headless.
- Model lanes in `.env` (primary first): Nemotron 3 Super `:free` (proven),
  Gemma 4 31B `:free` (retry when upstream 429 clears), Google AI Studio lane
  (biggest free quota). Qwen3.8-27B `:free` was withdrawn 2026-10-11 — skip it.
- Free-tier reality: ~50 req/day per OpenRouter key; one explore ≈ 60-100
  calls. Pace sites or add a second key (stacking keys multiplies quota).

## 4. MCP way (local server, R3-T5)

The server speaks newline-delimited JSON-RPC 2.0 over stdio — the standard
every client below accepts. It spawns the same local services on demand
(ports 5000-5004, localhost only).

Start it manually to smoke-test (it idles until a client connects):

```bat
cd "C:\Users\sandeep\pes\CAPSTONE\sem 6 reivew 3\code\vision"
node mcp\server.js
```

Tools (final contract, all live since R3-T5 builder landing, verified 8/8):
`status` (service health, no browser), `perceive` (url → compact visual
DOM, SAME shape as API path), `act` (one grounded action in the persistent
headed session with live re-detect; stale targets FAIL explicitly, never
clicked), `evidence` (screenshots + history), `reset` (close session,
services stay up).

### 4a. Claude Code

`.mcp.json` in the project root (or `claude mcp add`):

```json
{ "mcpServers": { "vision-test": {
  "command": "node",
  "args": ["C:\\Users\\sandeep\\pes\\CAPSTONE\\sem 6 reivew 3\\code\\vision\\mcp\\server.js"],
  "env": { "VISION_HEADED": "true" }
} } }
```

### 4b. Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.vision-test]
command = "node"
args = ["C:\\Users\\sandeep\\pes\\CAPSTONE\\sem 6 reivew 3\\code\\vision\\mcp\\server.js"]
env = { "VISION_HEADED" = "true" }
```

### 4c. opencode (`opencode.json`)

```json
{ "mcp": { "vision-test": {
  "type": "local",
  "command": ["node", "C:\\Users\\sandeep\\pes\\CAPSTONE\\sem 6 reivew 3\\code\\vision\\mcp\\server.js"],
  "environment": { "VISION_HEADED": "true" }
} } }
```

### 4d. Claude Desktop / Cursor / Windsurf / Cline

Same `mcpServers` JSON as 4a in each client's MCP config file
(`claude_desktop_config.json`, Cursor `.cursor/mcp.json`, etc.).

### 4e. Local-only notes (no hosting needed)

- MCP itself uses stdio (no network port at all). The 5 pipeline services
  bind localhost ports 5000-5004; run ONE client session at a time.
- The gateway listens on all interfaces: on shared networks set Windows
  Firewall to block inbound TCP 5000-5004, or bind-only follow-up later.
- Screenshots/evidence stay in `vision/storage/` on this disk.

### 4f. Streamable-HTTP fallback (R3-T13; use when stdio wedges)

Under heavy machine load the stdio pipe can wedge (replies unreadable) —
seen live 2026-10-11. The same server speaks plain JSON-RPC over localhost
HTTP with zero new dependencies. Default stays stdio; HTTP starts only
with the flag (default port 5123, override `MCP_HTTP_PORT`):

```bat
cd "C:\Users\sandeep\pes\CAPSTONE\sem 6 reivew 3\code\vision"
node mcp\server.js --transport http
set MCP_HTTP_PORT=5123 && node mcp\server.js --transport http
```

Smoke test (no browser needed — `status` only reads health endpoints):

```bat
curl http://127.0.0.1:5123/health
curl -X POST http://127.0.0.1:5123/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}"
```

Claude Code HTTP (`url`-type server — no `command` spawn, no pipe to wedge):

```json
{ "mcpServers": { "vision-test-http": {
  "type": "http",
  "url": "http://127.0.0.1:5123/mcp"
} } }
```

Notes: POST one `{jsonrpc,id,method,params}` object per request, reply is
the same object stdio would print per line; `notifications/*` returns
`202` + `null` (no reply); bad JSON returns `400` + `-32700`; anything but
POST /mcp (except GET /health) returns `404`. The HTTP listener binds
127.0.0.1 only — never exposed off-machine.

## 5. Switching brains (demo-day procedure)

1. MCP demo: connect client (section 4) → ask it to `perceive` the site →
   it reasons step by step with `act`. Unlimited, impressive live.
2. API fallback (if MCP misbehaves): close the client session, run
   `node runVision.js <url>` — the exact same pipeline, LLM key from `.env`.
3. If the free model 429s mid-demo: switch the two `.env` lines to the next
   documented lane and re-run (60 seconds). Pre-record one headed run as
   backup for demos that must not fail live.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Executable doesn't exist ... ms-playwright` | `npx playwright install chromium` in `vision/` |
| LLM 429 upstream | Wait or switch `.env` lane; retries are automatic (6x backoff) |
| LLM 404 "unavailable for free" | That `:free` variant was withdrawn; use a documented lane |
| Ports 5000-5004 busy | Only one live run at a time; taskkill stray node/python, re-run |
| YOLO UnpicklingError | `screenparser_best.pt` is an LFS pointer; download the real ~153 MB file |
| MCP client sees no tools | `node --check vision\mcp\server.js`, then `node --test "mcp/*.test.js"` in `vision/` (8 tests, offline) |
| `FreeTierError` (opencode key) | Free oc keys work ONLY inside OpenCode sessions — use the MCP way instead |
