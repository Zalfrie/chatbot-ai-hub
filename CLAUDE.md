# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Chatbot Hub** — a multi-tenant SaaS platform for Indonesian SMEs (UMKM) that connects AI-powered chatbots to WhatsApp and embeddable web widgets. Each tenant (UMKM) gets their own chatbot config, knowledge base, WhatsApp number, and embed API key.

> This repository is currently in the **planning phase**. The spec lives in `planning.md`. No source code exists yet — implementation starts with Phase 1 (see Phases below).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + TypeScript + Express |
| WhatsApp | Baileys (self-hosted, built into backend) |
| Database | PostgreSQL + Drizzle ORM |
| Cache/Sessions | Redis (ioredis) |
| AI Providers | Groq LLaMA 3.3 (dev) / Claude API Anthropic (prod) |
| Frontend Dashboard | Nuxt.js 3 + TypeScript + Pinia + Tailwind CSS |
| Embed Widget | Vanilla TypeScript (zero dependencies) |
| Testing | Vitest + Supertest + MSW |
| Process Manager | PM2 |

### AI Provider Strategy

Use the **interface pattern** so switching providers only requires changing an env variable:
- **Development/MVP:** Groq (free, rate-limited) — `GROQ_API_KEY`
- **Production:** Claude API (Anthropic) — `ANTHROPIC_API_KEY`
- Fallbacks: OpenAI GPT-4o, Google Gemini 2.0 Flash, Ollama (local)

Temperature is set to **0.85** for human-like responses. The AI persona system prompt is built from the tenant's chatbot config + knowledge base entries.

---

## Planned Directory Structure

```
chatbot-ai-hub/
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/           # JWT auth + refresh tokens
│   │   │   ├── client/         # UMKM tenant management
│   │   │   ├── chatbot/        # Chatbot config CRUD
│   │   │   ├── knowledge/      # Knowledge base CRUD
│   │   │   ├── chat/           # Core chat logic (the orchestrator)
│   │   │   └── whatsapp/       # Baileys session + QR code management
│   │   ├── shared/             # Middleware, utils, db, redis, ai-provider
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── package.json
├── frontend/                   # Nuxt.js 3 dashboard
│   └── ...
├── widget/                     # Vanilla TS embed script
│   └── ...
└── planning.md                 # Full specification (read this first)
```

---

## Core Architecture: Chat Service Flow

The `chat` module is the central orchestrator. Both WhatsApp (Baileys) and the web widget route messages through it:

```
Incoming Message (WhatsApp or Web Widget)
  → Validate tenant (API key or WA session)
  → Load chatbot config + knowledge base entries from DB
  → Retrieve recent conversation history (Redis → DB fallback)
  → Build system prompt (persona + knowledge + history)
  → Call AI provider (abstract interface)
  → Save message + log usage (for billing)
  → Return response
```

**Multi-tenancy:** Every DB query must filter by `client_id`. Row-level isolation is enforced in service layer, not just routes.

---

## Database Schema (Key Tables)

- `admin_users` — superadmin and per-client admin accounts
- `clients` — UMKM tenants (api_key hashed with bcrypt)
- `chatbots` — one per client (persona, instructions, AI model config)
- `knowledge_bases` — many per client (product info, FAQs)
- `wa_sessions` — Baileys session state (encrypted AES-256) per client
- `conversations` — chat sessions (WA number or web visitor)
- `messages` — individual messages with role (user/assistant)
- `usage_logs` — token usage per message (basis for billing)

Full schema with seed data for a demo bakery ("Toko Kue Laris Manis") is in `planning.md`.

---

## Planned Commands

Once implementation begins, expected commands:

```bash
# Backend
npm run dev          # Development server with hot reload
npm run build        # TypeScript compile
npm run test         # Vitest (all tests)
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage     # With coverage report

# Database
npm run db:migrate   # Run Drizzle migrations
npm run db:seed      # Seed demo data

# Frontend (inside /frontend)
npm run dev          # Nuxt dev server
npm run build        # Production build
```

---

## Authentication

- **Dashboard (admin):** JWT — 15-minute access token + 7-day refresh token
- **Web Widget:** API Key in `X-Api-Key` header (stored hashed in DB)
- **WhatsApp:** Session managed by Baileys, linked via `wa_sessions` table

---

## Development Phases

1. **Foundation** — Node.js/TS setup, DB schema + migrations, basic CRUD modules
2. **AI Chat** — Claude/Groq integration, knowledge injection, `/chat` endpoint
3. **WhatsApp** — Baileys integration, QR code flow via Socket.io, session encryption
4. **Dashboard** — Nuxt.js frontend, all management pages, real-time QR display
5. **Widget** — Vanilla TS embed script, CDN deployment
6. **Hardening** — Rate limiting (30 msg/min/client), billing hooks, security audit

---

## Key Constraints

- **Baileys** is an unofficial WhatsApp API. For production scale, plan to migrate to official WhatsApp Business API (Meta/Fonnte/Wablas).
- Rate limit: 30 messages/minute per client (Redis-based).
- The embed widget must be **zero-dependency vanilla TypeScript** — no React/Vue.
- All AI provider calls go through a shared `AIProvider` interface — never call SDK directly from chat service.
