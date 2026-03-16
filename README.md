# AI Chatbot Hub

Platform SaaS multi-tenant yang menghubungkan chatbot AI ke WhatsApp dan web widget, dirancang untuk UMKM Indonesia.

Setiap tenant (UMKM) mendapat chatbot sendiri dengan knowledge base, nomor WhatsApp, dan API key untuk embed di website mereka.

---

## Tech Stack

### Backend

| Teknologi | Peran |
|---|---|
| **Node.js + TypeScript** | Runtime dan bahasa utama |
| **Express** | HTTP server dan routing |
| **PostgreSQL** | Database utama (tenant data, messages, usage logs) |
| **Drizzle ORM** | Query builder + migrations untuk PostgreSQL |
| **Redis (ioredis)** | Cache conversation history, session WA, rate limiting |
| **Baileys** | WhatsApp client (self-hosted, unofficial API) |
| **Socket.io** | Real-time QR code display ke dashboard |
| **JSON Web Token (JWT)** | Auth dashboard — access token 15 menit + refresh 7 hari |
| **bcrypt** | Hashing password dan API key tenant |
| **PM2** | Process manager untuk production |

#### AI Provider (interface pattern)

| Provider | Digunakan saat | SDK |
|---|---|---|
| **Groq (LLaMA 3.3)** | Development / MVP (gratis) | `groq-sdk` |
| **Claude API (Anthropic)** | Production | `@anthropic-ai/sdk` |
| **OpenAI GPT-4o** | Fallback production | `openai` |
| **Google Gemini 2.0 Flash** | Fallback dev | `@google/generative-ai` |

> Semua provider dipanggil lewat satu `AIProvider` interface. Ganti provider = ubah env variable, tidak ubah kode.

#### Testing

| Teknologi | Peran |
|---|---|
| **Vitest** | Unit dan integration testing |
| **Supertest** | HTTP endpoint testing |
| **MSW (Mock Service Worker)** | Mock AI provider calls di tests |

---

### Frontend Dashboard

| Teknologi | Peran |
|---|---|
| **Nuxt.js 3** | SSR framework berbasis Vue 3 |
| **TypeScript** | Type safety di seluruh frontend |
| **Pinia** | State management |
| **Tailwind CSS** | Utility-first styling |

Halaman yang tersedia: login, manajemen chatbot, knowledge base editor, WhatsApp QR connect, conversation history, dan usage stats.

---

### Embed Widget

| Teknologi | Peran |
|---|---|
| **Vanilla TypeScript** | Zero-dependency embed script |

Widget di-build ke satu file `.js` yang bisa di-embed UMKM ke website manapun via tag `<script>`. Tidak ada dependency eksternal — ringan dan universally compatible.

---

## Arsitektur Singkat

```
Pelanggan WA / Pengunjung Web
         │
         ▼
   AI Chatbot Hub (Express)
         │
   ┌─────┴──────┐
   │  Baileys   │  REST API
   │  (WA)      │  (Widget)
   └─────┬──────┘
         │
    Chat Service ← load config + knowledge dari DB
         │
    AI Provider (Groq / Claude)
         │
   ┌─────┴──────┐
   │ PostgreSQL │  Redis
   └────────────┘
```

---

## Multi-Tenancy

- Setiap query ke DB **wajib** filter by `client_id`
- API key widget disimpan **hashed** (bcrypt) di tabel `clients`
- Session WhatsApp dienkripsi **AES-256** per tenant

---

## Development Phases

1. **Foundation** — Setup project, DB schema, migrations, basic CRUD
2. **AI Chat** — Integrasi Groq/Claude, knowledge injection, endpoint `/chat`
3. **WhatsApp** — Baileys, QR code flow, session encryption
4. **Dashboard** — Nuxt.js frontend, semua halaman manajemen
5. **Widget** — Vanilla TS embed script, CDN deployment
6. **Hardening** — Rate limiting, billing hooks, security audit

---

## Variabel Environment

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/chatbot_hub

# Redis
REDIS_URL=redis://localhost:6379

# AI Providers
GROQ_API_KEY=
ANTHROPIC_API_KEY=
AI_PROVIDER=groq   # groq | anthropic | openai | gemini

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=

# App
PORT=3000
NODE_ENV=development
```

---

## Lihat juga

- [`planning.md`](./planning.md) — Spesifikasi lengkap, schema DB, flow detail, seed data demo
- [`CLAUDE.md`](./CLAUDE.md) — Panduan untuk AI assistant (Claude Code)
