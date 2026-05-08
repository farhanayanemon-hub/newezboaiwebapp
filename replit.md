# EzboAI — Bangla AI Personal Assistant

## Project Overview

**EzboAI** is a Bengali-speaking AI personal assistant web app. It runs in any modern browser (desktop or mobile), installable as a PWA. Hosted at **ezboai.com** (user-owned domain).

### Core features (12 phases)
1. Foundation — React + Vite + PWA + EzboAI branding
2. Chat UI — message bubbles, sidebar, input, quick actions
3. AI backend — Replit AI Integration, streaming Bangla replies
4. Conversation memory — PostgreSQL, long-term memory
5. Quick actions — 8 one-click shortcuts
6. File handling — PDF, Word, Excel, Image upload
7. Voice — Bangla STT + TTS
8. Camera live stream — vision AI
9. Screen share — real-time screen help
10. Reminders — Web Push notifications
11. Browser automation — Playwright, AI does web tasks
12. Polish + deploy — ezboai.com

### Phase 11 status (in-progress, multi-session)
- ✅ Done so far: DB schemas (automations, site_credentials), Playwright + Chromium + system libs (glib/nss/nspr/atk/cups/dbus/libgbm/etc), browser session manager (max 3 concurrent, 15min idle sweep, --no-sandbox), URL guard (blocks file://, chrome://, private IPs), 9 tools (navigate/click/type/press_key/screenshot/extract/read_page/wait/scroll), OpenAI tool-loop agent (`runAgent.ts`, max 30 steps, Bangla system prompt), REST endpoints (POST/DELETE/run/abort sessions), WebSocket `/ws/browser/:id` with per-session pub/sub + 50-event backlog, frontend `BrowserPreviewPanel` (live screenshot + action log + Stop/Close), Web Task button in InputBar (auto-detect /web prefix or Banglish keywords).
- ✅ Hardening pass: WS upgrade now requires admin session cookie (single-tenant), `requireAdmin()` gate on all `/api/browser/*` routes, screenshot backlog deduped to last-1 (was ~10MB → ~200KB per session), runAgent breaks immediately on `page.isClosed()` or "Target closed" tool errors (no zombie loops), unhandled-rejection in `runAgent` now publishes `error+done` so UI never hangs, `/sessions/:id/end` POST + `pagehide` `sendBeacon` from panel frees server session on tab close.
- ⏳ Remaining: confirmation tool for destructive actions (HIGH — model still relies on prompt only), DNS-rebinding mitigation in urlGuard (re-validate IP after Playwright resolves; HIGH), per-IP rate-limit on POST /sessions, get_credentials tool + vault UI, /automations CRUD page + scheduler integration with Phase 10, allow/block list UI in admin, agent → conversation message bridge so the final answer lands in chat.
- Requires: OpenAI key in `/admin` for the agent to actually run (others can be added but only OpenAI provider has tool-calling wired).

### Future tasks (deferred)
- Windows Desktop App (Electron + Python, full PC control)
- Android app (Flutter or Expo)

## Tech Stack
- Frontend: React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui
- Backend: Express 5 (existing api-server)
- DB: PostgreSQL (heliumdb) via Drizzle
- AI: Replit AI Integration (OpenAI-compatible, vision)
- Voice: Web Speech API
- Browser automation: Playwright (server-side)
- Hosting: Replit Deployments → ezboai.com

## Repo Structure (pnpm monorepo)
- `artifacts/api-server/` — Express backend (exists)
- `artifacts/web-app/` — React frontend (to be created in Phase 1)
- `lib/api-spec/` — shared OpenAPI spec

## Full Build Guide
See `.local/tasks/ezboai-full-build-guide.md` for complete phase-by-phase implementation details. This is the authoritative blueprint — any agent on any account can resume work by following it.

## User preferences
- User communicates in **Banglish** (Bengali in Latin script). Respond in Bangla or Banglish.
- Be honest about technical limitations (browser sandbox, OS restrictions). Do not promise impossible features.
- Build phase by phase; test each phase before moving to the next.
- Domain: ezboai.com (user-owned). Custom domain connected at Phase 12 (deploy).
- Database is live PostgreSQL — work directly on it, no mock data.
