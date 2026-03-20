# AI Chatbot Hub

Platform SaaS multi-tenant yang menghubungkan chatbot AI ke WhatsApp dan web widget, dirancang untuk UMKM Indonesia.

Setiap tenant (UMKM) mendapat chatbot sendiri dengan knowledge base, nomor WhatsApp, dan API key untuk embed di website mereka.

---

## Screenshots

### Login
![Login](./screenshot/login.png)

### Dashboard
![Dashboard](./screenshot/dashboard.png)

### Manajemen Klien
![Clients](./screenshot/clients.png)

### Detail Klien
![Detail Client](./screenshot/detail-client.png)

### Koneksi WhatsApp
![Detail Client WhatsApp](./screenshot/detail-client-wa.png)

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

#### RAG + Vector Search (Phase 8)

| Komponen | Teknologi | Peran |
|---|---|---|
| **Pinecone** | Vector database (cloud) | Simpan dan cari embedding knowledge base |
| **Integrated Embedding** | `multilingual-e5-large` via Pinecone | Konversi teks → vector, tanpa API embedding terpisah |
| **Chunker** | Sliding window 400 kata, overlap 50 | Pecah dokumen panjang jadi chunk optimal |
| **Importer** | pdf-parse, mammoth | Import knowledge dari PDF, DOCX, plain text |
| **Crawler** | cheerio | Crawl URL dan ekstrak konten bersih |

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
    Chat Service ← load config dari DB
         │
    RAG: Pinecone similarity search → top-K chunks
         │
    AI Provider (Groq / Claude)
         │
   ┌─────┴──────┐
   │ PostgreSQL │  Redis  │  Pinecone
   └────────────┘
```

---

## Multi-Tenancy

- Setiap query ke DB **wajib** filter by `client_id`
- API key widget disimpan **hashed** (bcrypt) di tabel `clients`
- Session WhatsApp dienkripsi **AES-256** per tenant

---

## Development Phases

| Fase | Nama | Status |
|---|---|---|
| 1 | **Foundation** — Setup project, DB schema, migrations, basic CRUD | Selesai |
| 2 | **AI Chat** — Integrasi Groq/Claude, knowledge injection, endpoint `/chat` | Selesai |
| 3 | **WhatsApp** — Baileys, QR code flow, session encryption | Selesai |
| 4 | **Dashboard** — Nuxt.js frontend, semua halaman manajemen | Selesai |
| 5 | **Widget** — Vanilla TS embed script, CDN deployment | Selesai |
| 6 | **Hardening** — Rate limiting, billing hooks, security audit | Selesai |
| 7 | **Production-Ready** — Winston logger, PM2 config, JWT refresh, error handling | Selesai |
| 8 | **RAG + Vector Search** — Pinecone embedding, chunking, import PDF/URL/DOCX | Selesai |
| 9 | **SSE Streaming** — Real-time streaming response via Server-Sent Events (widget + dashboard) | Selesai |
| 10 | **Tool Use / Function Calling** — AI bisa panggil webhook UMKM secara real-time (agentic loop) | Selesai |

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

# RAG / Vector Search (Phase 8)
PINECONE_API_KEY=
PINECONE_INDEX_NAME=chatbot-hub-knowledge
```

---

## Phase 9 — SSE Streaming

Semua response AI kini bisa di-stream secara real-time ke browser menggunakan **Server-Sent Events (SSE)**.

### Endpoint Streaming

| Endpoint | Auth | Keterangan |
|---|---|---|
| `POST /v1/chat/stream` | API Key | Widget embed — stream ke pengunjung web |
| `POST /api/clients/:id/conversations/stream/preview` | JWT | Dashboard — uji bot secara live |

### SSE Event Format

```
data: {"type":"session","session_id":"<uuid>"}
data: {"type":"chunk","content":"Halo kak!"}
data: {"type":"tool_call","tool_name":"cek_stok","args":{...}}
data: {"type":"tool_result","tool_name":"cek_stok","result":"Stok: 3 loyang"}
data: {"type":"done","tokens_used":85}
data: {"type":"error","message":"..."}
```

---

## Phase 10 — Tool Use / Function Calling

Setiap tenant (UMKM) bisa mendaftarkan **tools** — fungsi yang dipanggil AI secara otomatis saat menjawab pelanggan. Hub berperan sebagai **orchestrator**: AI request tool call → hub eksekusi via HTTP ke sistem UMKM → hasil dikirim balik ke AI.

### Contoh Use Case

| UMKM | Tool | Fungsi |
|---|---|---|
| Toko Kue | `cek_stok_kue(nama_produk)` | Cek stok real-time dari sistem toko |
| Toko Online | `cek_status_order(nomor_order)` | Cek status pengiriman |
| Restoran | `cek_meja_tersedia(tanggal, jam)` | Cek ketersediaan meja |

### Agentic Loop Flow

```
User Message
     │
     ▼
[Chat Service] — load config, knowledge, tools
     │
     ▼
[AI Provider] ← messages + toolDefinitions
     │
     ├─ response.toolCalls? → YES → [Tool Executor]
     │                                     │
     │                               HTTP ke webhook UMKM
     │                                     │
     │                              append tool_result ke messages
     │                                     │
     │                              loop balik ke AI (max 5 iterasi)
     │
     └─ response.content (text) → NO → Final Answer → Return to user
```

### Fitur

- **Tool Registry** — CRUD tools per tenant via dashboard (`/clients/:id/tools`)
- **Test Panel** — uji tool dengan input manual langsung dari dashboard
- **Kill switch** — toggle `tools_enabled` per chatbot (off = perilaku normal seperti sebelumnya)
- **Timeout 10 detik** — jika webhook tidak respons, AI diberi tahu dan menjawab berdasarkan pengetahuan yang ada
- **Max 5 iterasi** — mencegah infinite agentic loop
- **Multi-provider** — Claude (native `tool_use` blocks) dan Groq (OpenAI-compatible `tool_calls`)
- **SSE events baru** — dashboard tampilkan "thinking steps" saat AI memanggil tool

### API Endpoints Tool

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/clients/:id/tools` | List semua tools tenant |
| `POST` | `/api/clients/:id/tools` | Buat tool baru |
| `PUT` | `/api/clients/:id/tools/:tid` | Update tool |
| `DELETE` | `/api/clients/:id/tools/:tid` | Hapus tool |
| `POST` | `/api/clients/:id/tools/:tid/test` | Test eksekusi tool (dari dashboard) |

### Payload Webhook (dikirim hub ke sistem UMKM)

```json
POST https://your-system.com/webhook/tool
Content-Type: application/json

{
  "tool_name": "cek_stok_kue",
  "args": { "nama_produk": "Red Velvet" },
  "client_id": 1,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

Expected response dari sistem UMKM:
```json
{ "result": "Stok Red Velvet tersedia: 3 loyang. Bisa dipesan untuk hari ini." }
```

---

## Phase 8 — RAG + Vector Search

Knowledge base kini menggunakan **Retrieval-Augmented Generation (RAG)** berbasis Pinecone, sehingga chatbot bisa menjawab lebih akurat dari dokumen yang relevan.

### Alur RAG

```
User Message
     │
     ▼
Pinecone similarity search (multilingual-e5-large)
     │
     ▼
Top-K chunks relevan → inject ke system prompt
     │
     ▼
AI Provider (Groq / Claude) → response kontekstual
```

### Fitur yang Tersedia

- **Import file** (`POST /knowledge/import/file`) — upload PDF, DOCX, atau TXT
- **Import URL** (`POST /knowledge/import/url`) — crawl halaman web secara otomatis
- **Import teks** (`POST /knowledge/import/text`) — paste teks langsung
- **Reindex** (`POST /knowledge/reindex`) — embed ulang semua knowledge base ke Pinecone
- **Search** (`GET /knowledge/search?q=...`) — uji coba similarity search
- Create/update/delete knowledge base otomatis sync ke Pinecone
- Fallback ke full knowledge base jika Pinecone tidak tersedia

### Manfaat

- Chatbot bisa memproses dokumen panjang (katalog produk, FAQ lengkap, SOP)
- Jawaban lebih relevan karena hanya inject context yang diperlukan
- Mengurangi token usage → lebih hemat biaya AI provider

---

## Security

Berikut adalah langkah-langkah keamanan yang sudah diterapkan pada codebase ini.

### SSRF Protection pada Webhook Tool

Setiap URL webhook yang didaftarkan tenant melalui Tool Registry divalidasi untuk mencegah **Server-Side Request Forgery (SSRF)**. URL yang mengarah ke alamat internal atau privat akan ditolak.

Yang diblokir:
- `localhost`, `127.x.x.x`, `0.0.0.0` (loopback)
- `10.x.x.x`, `192.168.x.x`, `172.16–31.x.x` (private network)
- `169.254.x.x` (link-local / AWS metadata endpoint)
- `metadata.google.internal`, `metadata.gcp.internal` (cloud metadata)
- Protocol selain `http` / `https` (mis. `file://`, `ftp://`)

Validator ada di `backend/src/utils/ssrf.ts`, diterapkan via Zod `superRefine` di `tool.routes.ts`.

---

### Superadmin-Only untuk Client Management

Operasi sensitif pada data tenant hanya bisa dilakukan oleh role `superadmin`:

| Method | Endpoint | Akses |
|---|---|---|
| `GET` | `/api/clients` | Superadmin only |
| `POST` | `/api/clients` | Superadmin only |
| `DELETE` | `/api/clients/:id` | Superadmin only |
| `GET` | `/api/clients/:id` | Semua admin |
| `PUT` | `/api/clients/:id` | Semua admin |

Admin biasa yang mencoba akses endpoint terbatas akan mendapat `403 Forbidden`.

---

### Rate Limiter — In-Memory Fallback

Rate limiter berbasis Redis menggunakan **in-memory fallback** jika Redis tidak tersedia, sehingga pembatasan request tetap aktif dalam kondisi apapun.

- Redis tersedia → counter disimpan di Redis (akurat, terdistribusi)
- Redis mati → counter disimpan di memory proses (tetap membatasi, dengan log warning)
- Sebelumnya: jika Redis mati → rate limit dinonaktifkan total (fail-open)

---

### Socket.io CORS dari Environment Variable

Origin yang diizinkan untuk koneksi Socket.io (real-time QR code WhatsApp) dikonfigurasi via env variable, bukan hardcoded `*`.

```env
# .env
SOCKET_CORS_ORIGIN=http://localhost:3001          # development
SOCKET_CORS_ORIGIN=https://dashboard.yourdomain.com  # production
```

Koneksi dari origin lain akan ditolak secara otomatis.

---

### Credential Tidak Dicetak ke Log

Script `seed.ts` tidak lagi mencetak plaintext password atau API key ke console output. Informasi login dicek langsung dari environment variable atau database.

---

## Lihat juga

- [`planning.md`](./planning.md) — Spesifikasi lengkap, schema DB, flow detail, seed data demo
- [`CLAUDE.md`](./CLAUDE.md) — Panduan untuk AI assistant (Claude Code)
