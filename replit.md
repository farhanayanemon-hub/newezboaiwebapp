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
