# Planning: AI Chatbot Hub untuk UMKM
> Platform SaaS multi-tenant yang menghubungkan WhatsApp dan Web Chat berbasis AI, dapat digunakan oleh banyak UMKM sekaligus.

---

## Daftar Isi
1. [Gambaran Umum](#gambaran-umum)
2. [Tech Stack & AI Provider](#tech-stack)
3. [Arsitektur Sistem](#arsitektur-sistem)
4. [Flow Lengkap](#flow-lengkap)
5. [Database Model (PostgreSQL)](#database-model)
6. [Seed Data — Toko Kue (Demo)](#seed-data)
7. [Panduan Chatbot Humanis](#panduan-chatbot-humanis)
8. [Backend (Node.js + TypeScript)](#backend)
   - Stack & Library
   - Struktur Direktori
   - Core Logic: Chat Service
   - Unit Testing (Vitest)
9. [Frontend (Nuxt.js + TypeScript)](#frontend)
10. [API Endpoints](#api-endpoints)
11. [Fase Development](#fase-development)
    - Phase 1–6 (selesai)
    - Phase 9–12: AI Capabilities
    - Phase 13–16: Billing, Invoice & Payment
    - Phase 17: Auth UMKM & Multi-portal
    - Phase 18: Landing Page & Halaman Publik
12. [Pricing & Billing Model](#pricing--billing-model)
13. [Database Model Tambahan — Billing](#database-model-tambahan--billing)
14. [Auth UMKM — Sistem Login & Registrasi](#auth-umkm--sistem-login--registrasi)
15. [Landing Page & Halaman Publik](#landing-page--halaman-publik)
16. [Catatan Penting](#catatan-penting)

---

## Gambaran Umum

**AI Chatbot Hub** adalah platform yang memungkinkan UMKM menggunakan chatbot AI pada:
- **WhatsApp** — Pelanggan UMKM chat ke nomor WA milik UMKM, dijawab otomatis oleh AI
- **Web Widget** — UMKM embed widget chat di website mereka via script/API key

Setiap UMKM adalah **tenant** yang punya:
- Konfigurasi chatbot sendiri (nama, persona, instruksi AI)
- Knowledge base sendiri (info produk, FAQ, dll)
- Nomor WhatsApp sendiri yang dihubungkan ke hub
- API Key untuk embed widget di web

---

## Tech Stack & AI Provider

### Stack Utama

| Layer | Teknologi | Alasan |
|---|---|---|
| **Backend / Hub** | Node.js + TypeScript + Express | Familiar, Baileys native, ekosistem kaya |
| **WhatsApp Gateway** | Baileys (built-in di backend) | Native Node.js, self-hosted, satu service |
| **Database** | PostgreSQL | Robust, JSON support, full-text search |
| **Cache / Session** | Redis | Session WA, rate limiting, conversation cache |
| **AI Provider** | Groq (dev) / Claude API (prod) | Lihat tabel di bawah |
| **Frontend Dashboard** | Nuxt.js + TypeScript | SSR, familiar, ekosistem Vue |
| **Embed Widget** | Vanilla TypeScript | Ringan, tidak ada dependency, universally embeddable |
| **Process Manager** | PM2 | Production-ready, auto-restart |

### Perbandingan AI Provider

| Provider | Biaya | Kualitas B. Indonesia | Rekomendasi |
|---|---|---|---|
| **Groq (LLaMA 3.3)** | ✅ **Gratis** (rate limited) | ⭐⭐⭐ Cukup baik | **Development & MVP** |
| **Google Gemini 2.0 Flash** | ✅ **Gratis** tier tersedia | ⭐⭐⭐⭐ Baik | Dev alternatif |
| **Claude API (Anthropic)** | 💰 ~$3/1M token | ⭐⭐⭐⭐⭐ Terbaik | **Produksi** |
| **OpenAI GPT-4o** | 💰 ~$5/1M token | ⭐⭐⭐⭐ Baik | Produksi alternatif |
| **Ollama (lokal)** | ✅ **Gratis** sepenuhnya | ⭐⭐⭐ Tergantung model | Dev tanpa internet |

> **Strategi:** Mulai dengan **Groq gratis** untuk testing. Saat siap produksi, ganti ke **Claude API** — tinggal ubah env variable, tidak perlu ubah kode karena pakai interface pattern.

### Cara Daftar AI Provider Gratis
- **Groq:** Daftar di [console.groq.com](https://console.groq.com) → dapat API key gratis
- **Gemini:** Daftar di [aistudio.google.com](https://aistudio.google.com) → dapat API key gratis

---

## Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                               │
│                                                                  │
│  [Pelanggan WA]         [Pengunjung Web UMKM]                    │
│       │                        │                                 │
│       │ WhatsApp               │ Chat Widget (JS Embed)          │
│       ▼                        ▼                                 │
└───────┼────────────────────────┼─────────────────────────────────┘
        │                        │
        │                        │ HTTPS + API Key
        ▼                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    AI CHATBOT HUB (Node.js)                      │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  Baileys (WA)   │    │   REST API        │                    │
│  │  Session Mgmt   │    │   Express Router  │                    │
│  └────────┬────────┘    └────────┬──────────┘                   │
│           │                      │                               │
│           └──────────┬───────────┘                              │
│                      ▼                                           │
│           ┌──────────────────────┐                              │
│           │   Chat Service       │                               │
│           │  - Load config       │                               │
│           │  - Load knowledge    │                               │
│           │  - Build prompt      │                               │
│           │  - Save messages     │                               │
│           └──────────┬───────────┘                              │
│                      │                                           │
│           ┌──────────▼───────────┐                              │
│           │   AI Provider        │                               │
│           │  Claude API wrapper  │                               │
│           └──────────────────────┘                              │
└───────────────┬──────────────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
  ┌──────────┐    ┌──────────┐
  │PostgreSQL│    │  Redis   │
  └──────────┘    └──────────┘
```

---

## Flow Lengkap

### Flow A: WhatsApp → AI → Balas ke Pelanggan

```
[Pelanggan]
    │
    │  1. Chat ke nomor WA milik UMKM "Toko Batik Sari"
    ▼
[WhatsApp Server Meta]
    │
    │  2. Event message masuk ke Baileys session UMKM tersebut
    ▼
[Hub — Baileys Event Handler]
    │
    │  3. Identifikasi client dari nomor WA tujuan
    │  4. Cek apakah nomor pengirim dalam blacklist / rate limit
    ▼
[Chat Service]
    │
    │  5. Load chatbot config (system_prompt, model, temperature)
    │  6. Load knowledge base milik client dari PostgreSQL
    │  7. Load conversation history dari Redis / DB
    │  8. Build full prompt:
    │       - system: persona + knowledge base
    │       - history: pesan-pesan sebelumnya
    │       - user: pesan baru dari pelanggan
    ▼
[Claude API]
    │
    │  9. Generate response
    ▼
[Chat Service]
    │
    │  10. Simpan pesan user + response ke tabel messages
    │  11. Update usage_logs (billing)
    ▼
[Baileys]
    │
    │  12. Kirim response ke nomor pelanggan via WA
    ▼
[Pelanggan]
    ✅ Mendapat balasan otomatis dari "Toko Batik Sari"
```

---

### Flow B: Web Widget → AI → Response ke Browser

```
[Pengunjung Web UMKM]
    │
    │  1. Buka website UMKM, muncul chat bubble widget
    │  2. Ketik pesan dan kirim
    ▼
[Widget JS (browser)]
    │
    │  3. POST /v1/chat/message
    │     Header: X-Api-Key: <api_key_umkm>
    │     Body: { session_id, message }
    ▼
[Hub — API Middleware]
    │
    │  4. Validasi API key → identifikasi client
    │  5. Rate limit check
    ▼
[Chat Service]
    │
    │  6-10. Sama seperti Flow WA (load config, knowledge, history, call Claude)
    ▼
[Response JSON]
    │
    │  11. Return { session_id, reply, timestamp }
    ▼
[Widget JS]
    ✅ Tampilkan pesan balasan di chat bubble
```

---

### Flow C: UMKM Connect WhatsApp (Onboarding)

```
[UMKM / Admin]
    │
    │  1. Login ke Dashboard Hub
    │  2. Klik "Hubungkan WhatsApp"
    ▼
[Dashboard (Nuxt.js)]
    │
    │  3. GET /api/clients/:id/wa/connect
    ▼
[Hub — WA Service]
    │
    │  4. Inisiasi Baileys session baru untuk client ini
    │  5. Generate QR code
    │  6. Emit QR via WebSocket ke dashboard
    ▼
[Dashboard]
    │
    │  7. Tampilkan QR code
    ▼
[UMKM]
    │
    │  8. Scan QR dengan HP menggunakan WA nomor mereka
    ▼
[Baileys]
    │
    │  9. Session authenticated → simpan auth state ke DB
    │  10. Update status wa_sessions → 'connected'
    │  11. Emit event 'connected' ke dashboard via WebSocket
    ▼
[Dashboard]
    ✅ Status berubah → "WhatsApp Terhubung ✓"
    ✅ Chatbot mulai aktif menerima pesan WA
```

---

## Database Model

### PostgreSQL Schema

```sql
-- =============================================================
-- EXTENSIONS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- untuk full-text search knowledge base

-- =============================================================
-- 1. CLIENTS (Multi-tenant: setiap UMKM adalah 1 client)
-- =============================================================
CREATE TABLE clients (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,       -- identifier unik, misal: "toko-batik-sari"
  email         VARCHAR(255) UNIQUE NOT NULL,
  api_key       VARCHAR(64) UNIQUE NOT NULL,        -- untuk auth embed widget (generate UUID)
  webhook_url   VARCHAR(500) NULL,                  -- notifikasi ke sistem UMKM (opsional)
  plan          VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_api_key ON clients(api_key);
CREATE INDEX idx_clients_slug ON clients(slug);

-- =============================================================
-- 2. CHATBOT CONFIG (1 client bisa punya 1 active chatbot)
-- =============================================================
CREATE TABLE chatbots (
  id              BIGSERIAL PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,             -- nama bot, misal: "Sari Assistant"
  system_prompt   TEXT NOT NULL,                     -- persona + instruksi AI
  welcome_message TEXT NULL,                         -- pesan pembuka
  language        VARCHAR(10) DEFAULT 'id',
  ai_provider     VARCHAR(20) DEFAULT 'claude' CHECK (ai_provider IN ('claude', 'openai', 'gemini')),
  ai_model        VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
  temperature     NUMERIC(3,2) DEFAULT 0.70,
  max_tokens      INT DEFAULT 1000,
  channel         VARCHAR(20) DEFAULT 'both' CHECK (channel IN ('web', 'whatsapp', 'both')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id)                                 -- 1 client 1 chatbot (bisa diubah nanti)
);

-- =============================================================
-- 3. KNOWLEDGE BASE (data yang diinjeksikan ke prompt AI)
-- =============================================================
CREATE TABLE knowledge_bases (
  id          BIGSERIAL PRIMARY KEY,
  client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,                 -- misal: "Daftar Produk", "FAQ Pengiriman"
  content     TEXT NOT NULL,                         -- isi knowledge (Q&A, deskripsi, dll)
  category    VARCHAR(100) NULL,                     -- grouping: "produk", "pengiriman", "pembayaran"
  priority    SMALLINT DEFAULT 0,                    -- urutan injeksi ke prompt (semakin besar = lebih penting)
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_client ON knowledge_bases(client_id, is_active);
CREATE INDEX idx_knowledge_search ON knowledge_bases USING gin(to_tsvector('indonesian', content));

-- =============================================================
-- 4. WHATSAPP SESSIONS (auth state per client)
-- =============================================================
CREATE TABLE wa_sessions (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  wa_number     VARCHAR(30) NOT NULL,                -- nomor WA yang terhubung (format intl: 628xxx)
  session_data  TEXT NULL,                           -- Baileys auth state (JSON encrypted)
  status        VARCHAR(20) DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'banned')),
  connected_at  TIMESTAMPTZ NULL,
  disconnected_at TIMESTAMPTZ NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- 5. CONVERSATIONS (satu sesi percakapan)
-- =============================================================
CREATE TABLE conversations (
  id              BIGSERIAL PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES clients(id),
  chatbot_id      BIGINT NOT NULL REFERENCES chatbots(id),
  session_id      UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
  channel         VARCHAR(20) NOT NULL CHECK (channel IN ('web', 'whatsapp')),
  user_identifier VARCHAR(100) NULL,                 -- nomor WA / browser fingerprint
  user_name       VARCHAR(255) NULL,
  status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'escalated')),
  metadata        JSONB NULL,                        -- data tambahan (browser, OS, dll)
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NULL,
  closed_at       TIMESTAMPTZ NULL
);

CREATE INDEX idx_conv_client ON conversations(client_id);
CREATE INDEX idx_conv_session ON conversations(session_id);
CREATE INDEX idx_conv_user ON conversations(client_id, user_identifier);
CREATE INDEX idx_conv_status ON conversations(status, last_message_at DESC);

-- =============================================================
-- 6. MESSAGES (isi percakapan)
-- =============================================================
CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  tokens_used     INT NULL,                          -- total tokens (prompt + completion)
  wa_message_id   VARCHAR(100) NULL,                 -- ID pesan asli dari WhatsApp
  is_error        BOOLEAN DEFAULT FALSE,             -- apakah AI gagal merespons
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at ASC);

-- =============================================================
-- 7. USAGE LOGS (untuk billing & monitoring)
-- =============================================================
CREATE TABLE usage_logs (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id),
  log_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  channel       VARCHAR(20) NOT NULL CHECK (channel IN ('web', 'whatsapp')),
  message_count INT DEFAULT 0,
  token_count   INT DEFAULT 0,
  UNIQUE (client_id, log_date, channel)
);

CREATE INDEX idx_usage_client_date ON usage_logs(client_id, log_date DESC);

-- =============================================================
-- 8. ADMIN USERS (pengelola hub)
-- =============================================================
CREATE TABLE admin_users (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- TRIGGER: auto update updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chatbots_updated BEFORE UPDATE ON chatbots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_knowledge_updated BEFORE UPDATE ON knowledge_bases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Seed Data

> Data uji coba untuk **Toko Kue Laris Manis** — UMKM fiktif untuk testing semua fitur hub.

### SQL Seed

```sql
-- =============================================================
-- SEED: Admin User
-- =============================================================
INSERT INTO admin_users (name, email, password_hash, role) VALUES
('Super Admin', 'admin@hub.com', '$2b$10$examplehashedpassword', 'superadmin');
-- Password plain: Admin@12345 (hash dengan bcrypt sebelum insert)

-- =============================================================
-- SEED: Client — Toko Kue Laris Manis
-- =============================================================
INSERT INTO clients (name, slug, email, api_key, plan, is_active) VALUES
(
  'Toko Kue Laris Manis',
  'toko-kue-laris-manis',
  'larismanis@gmail.com',
  'ck_laris_manis_demo_key_2024',
  'basic',
  TRUE
);

-- =============================================================
-- SEED: Chatbot Config
-- =============================================================
INSERT INTO chatbots (
  client_id, name, system_prompt, welcome_message,
  language, ai_provider, ai_model, temperature, channel, is_active
) VALUES (
  1,
  'Kiki - CS Toko Kue Laris Manis',

  -- SYSTEM PROMPT (lihat bagian Panduan Chatbot Humanis untuk detail)
  'Kamu adalah Kiki, customer service dari Toko Kue Laris Manis yang ramah dan hangat.
Kamu berbicara seperti teman yang menyenangkan — tidak kaku, tidak terlalu formal, tapi tetap sopan.
Sesekali pakai kata seperti "yuk", "kak", "lho", "dong", "nih" agar terasa natural.
Kamu suka rekomendasikan produk sesuai kebutuhan pelanggan, dan selalu semangat kalau ngomongin kue!
Kalau ada pertanyaan yang tidak kamu tahu, jujur aja dan arahkan ke admin: 0812-3456-7890.',

  'Haii kak! 👋 Selamat datang di Toko Kue Laris Manis~ Aku Kiki, siap bantu kakak hari ini! 🎂
Mau cari kue buat acara spesial, atau sekedar pengen tau produk kita? Tanya aja yuk! 😊',

  'id',
  'groq',
  'llama-3.3-70b-versatile',
  0.85,   -- temperature tinggi = lebih kreatif & natural
  'both',
  TRUE
);

-- =============================================================
-- SEED: Knowledge Base — Toko Kue Laris Manis
-- =============================================================

-- 1. Profil Toko
INSERT INTO knowledge_bases (client_id, title, content, category, priority) VALUES
(1,
'Profil Toko Kue Laris Manis',
'Toko Kue Laris Manis adalah toko kue rumahan yang berdiri sejak 2018 di Bandung.
Kami menyediakan berbagai kue custom untuk berbagai acara: ulang tahun, pernikahan, wisuda, dan acara kantor.
Semua kue dibuat fresh to order tanpa bahan pengawet.
Lokasi: Jl. Kopo Permai No. 45, Bandung.
Jam operasional: Senin-Sabtu pukul 08.00-20.00 WIB, Minggu 09.00-17.00 WIB.
Kontak admin: 0812-3456-7890 (WhatsApp).',
'profil', 10);

-- 2. Daftar Produk & Harga
INSERT INTO knowledge_bases (client_id, title, content, category, priority) VALUES
(1,
'Daftar Produk dan Harga',
'KUE ULANG TAHUN:
- Kue Ulang Tahun Bulat 18cm (6 porsi): Rp 185.000
- Kue Ulang Tahun Bulat 22cm (12 porsi): Rp 285.000
- Kue Ulang Tahun Bulat 26cm (20 porsi): Rp 385.000
- Kue Tier 2 Susun (untuk pesta): mulai Rp 650.000

KUE PERNIKAHAN & WISUDA:
- Wedding Cake Tier 2: mulai Rp 1.200.000
- Wedding Cake Tier 3: mulai Rp 1.800.000
- Kue Wisuda Custom: mulai Rp 350.000

HAMPERS & BOX KECIL:
- Brownies Box (isi 9): Rp 65.000
- Cookies Toples 300gr: Rp 75.000
- Hampers Gift Box (mix kue): mulai Rp 150.000

RASA TERSEDIA:
Coklat, Vanilla, Red Velvet, Pandan, Taro, Strawberry, Tiramisu, Matcha.

TOPPING TERSEDIA:
Fresh fruit, Fondant custom, Buttercream, Chocolate ganache, Whipped cream.',
'produk', 9);

-- 3. Cara Order
INSERT INTO knowledge_bases (client_id, title, content, category, priority) VALUES
(1,
'Cara Order dan Ketentuan',
'CARA ORDER:
1. Chat ke WhatsApp ini dan ceritakan kebutuhan kue kakak
2. Tentukan ukuran, rasa, topping, dan desain
3. Admin akan kirimkan estimasi harga dan foto referensi
4. Konfirmasi order dengan DP 50%
5. Sisa pembayaran dilunasi saat pengambilan / sebelum pengiriman

KETENTUAN ORDER:
- Minimum order custom cake: H-3 (3 hari sebelum acara)
- Untuk wedding cake: minimum H-14 (2 minggu sebelum acara)
- Brownies & cookies ready stock, bisa ambil hari itu

PEMBAYARAN:
- Transfer BCA: 1234567890 a.n. Sari Dewi
- Transfer BRI: 0987654321 a.n. Sari Dewi
- GoPay / OVO / Dana: 0812-3456-7890
- COD tersedia untuk area Bandung kota (order minimal Rp 200.000)',
'order', 8);

-- 4. Pengiriman
INSERT INTO knowledge_bases (client_id, title, content, category, priority) VALUES
(1,
'Informasi Pengiriman',
'PENGIRIMAN:
- Area Bandung kota: Rp 15.000 - Rp 30.000 (tergantung jarak)
- Luar Bandung: bisa via JNE/J&T khusus untuk produk kering (brownies, cookies)
- Kue custom (kue basah) TIDAK bisa dikirim via ekspedisi, hanya antar kota Bandung

PENGAMBILAN SENDIRI (Pick Up):
- Gratis, bisa langsung ke toko
- Lokasi: Jl. Kopo Permai No. 45, Bandung
- Parkir tersedia

CATATAN PENGIRIMAN KUE:
Kue custom sebaiknya diambil maksimal 2 jam sebelum acara agar tetap segar.
Simpan di kulkas jika belum digunakan, tahan 2 hari.',
'pengiriman', 7);

-- 5. FAQ
INSERT INTO knowledge_bases (client_id, title, content, category, priority) VALUES
(1,
'Pertanyaan yang Sering Ditanya (FAQ)',
'T: Apakah bisa request desain sendiri?
J: Tentu bisa! Kakak tinggal kirim foto referensi desain yang diinginkan, kami akan usahakan semirip mungkin.

T: Apakah ada tulisan di kue?
J: Ada, tulisan di kue sudah termasuk dalam harga. Bisa pilih warna sesuai tema.

T: Bisa minta rasa yang tidak ada di menu?
J: Untuk rasa custom bisa dikonsultasikan dulu ke admin ya, kami terbuka untuk request khusus.

T: Apakah bisa tanpa gluten (gluten free)?
J: Saat ini kami belum menyediakan opsi gluten free, mohon maaf ya.

T: Apakah ada promo atau diskon?
J: Sesekali ada promo di Instagram kami @larismaniscake. Follow ya biar tidak ketinggalan!

T: Bisa lihat portofolio kue?
J: Bisa! Cek Instagram kami @larismaniscake atau minta kakak kirimkan foto langsung di chat ini.',
'faq', 6);

-- =============================================================
-- SEED: WA Session (simulasi belum terhubung)
-- =============================================================
INSERT INTO wa_sessions (client_id, wa_number, status) VALUES
(1, '6281234567890', 'disconnected');
```

---

## Panduan Chatbot Humanis

> Panduan ini digunakan sebagai acuan saat menulis `system_prompt` untuk setiap chatbot UMKM agar terasa seperti orang sungguhan, bukan robot.

### Prinsip Utama

**1. Punya Nama & Identitas**
Chatbot harus punya nama, bukan "Bot" atau "Asisten". Nama membuat interaksi terasa personal.
```
✅ "Kamu adalah Kiki, CS dari Toko Kue Laris Manis..."
❌ "Kamu adalah asisten virtual toko ini..."
```

**2. Gaya Bicara Santai tapi Tetap Sopan**
Gunakan gaya bahasa percakapan sehari-hari. Boleh singkat, tidak harus selalu kalimat lengkap.
```
✅ "Wah, pilihan yang bagus tuh kak! Rasa Red Velvet emang favorit banyak orang 😊"
❌ "Terima kasih atas pertanyaan Anda. Rasa Red Velvet merupakan pilihan yang populer."
```

**3. Gunakan Kata Ganti yang Natural**
```
✅ Pakai: "kak", "yuk", "nih", "lho", "dong", "sih", "deh"
❌ Hindari: "Anda", "Bapak/Ibu" (kecuali konteks formal), "dengan ini kami memberitahukan"
```

**4. Emoji Secukupnya**
Emoji membuat chat terasa lebih hidup — tapi jangan berlebihan.
```
✅ 1-2 emoji per pesan, di posisi yang relevan
❌ "Halo!!! 🎂🎉🥳🎊🎁✨💖🌟 Selamat datang!!!"
```

**5. Empati & Respons Kontekstual**
Respons harus terasa seperti bot "mendengarkan", bukan hanya menjawab mekanis.
```
User: "Mau pesan kue buat ulang tahun mama saya besok"
✅ "Wah ulang tahun mama! Spesial banget nih 🥰 Biar kami bantu supaya hadiahnya sempurna ya — 
   ukuran berapa kira-kira kak? Dan ada rasa favorit mamanya?"
❌ "Untuk order kue, minimum H-3. Order Anda tidak bisa diproses."
```

**6. Jujur Kalau Tidak Tahu**
Jangan mengarang jawaban. Arahkan ke manusia / admin.
```
✅ "Untuk yang satu ini aku kurang yakin kak, mending tanya langsung ke admin di 0812-xxxx 
   biar lebih akurat ya!"
❌ "Ya, kami menyediakan layanan tersebut." (padahal tidak tahu)
```

**7. Proaktif Tapi Tidak Memaksa**
Tawarkan bantuan lebih, tapi jangan seperti sales agresif.
```
✅ "Kalau kakak mau lihat contoh desain kuenya, aku bisa kirimin beberapa foto referensi lho!"
❌ "PROMO SPESIAL! ORDER SEKARANG SEBELUM KEHABISAN!!!"
```

### Template System Prompt Humanis

```
Kamu adalah [NAMA], customer service dari [NAMA TOKO] yang ramah, hangat, dan menyenangkan.

KEPRIBADIAN:
- Bicara seperti teman yang helpful, tidak kaku dan tidak terlalu formal
- Antusias tapi tidak lebay — terutama saat ngomongin produk
- Empati tinggi: pahami kebutuhan pelanggan sebelum langsung jawab
- Jujur: kalau tidak tahu, akui dan arahkan ke admin

GAYA BAHASA:
- Gunakan "kak" untuk memanggil pelanggan
- Boleh pakai kata: yuk, nih, lho, dong, sih, deh — secukupnya
- Kalimat tidak harus panjang, yang penting jelas dan hangat
- Gunakan 1-2 emoji per pesan kalau relevan

BATASAN:
- Jawab hanya berdasarkan informasi toko yang diberikan
- Jika ditanya hal di luar konteks toko, arahkan kembali ke topik
- Jika tidak tahu jawaban pasti, arahkan ke admin: [NOMOR ADMIN]
- Jangan pernah mengarang informasi harga atau ketersediaan produk

INGAT: Kamu bukan robot. Kamu Kiki — dan pelanggan harus merasa seperti chat sama orang beneran!
```

### Contoh Percakapan yang Baik

```
Pelanggan : "harga kue ultah berapa?"
Kiki (✅)  : "Haii kak! 😊 Tergantung ukurannya nih:
              • 18cm (6 porsi): Rp 185rb
              • 22cm (12 porsi): Rp 285rb  
              • 26cm (20 porsi): Rp 385rb
              Acaranya buat berapa orang kak? Biar aku bantu rekomendasiin ukuran yang pas!"

Pelanggan : "ada yang gluten free ga?"
Kiki (✅)  : "Aduh sayang banget kak, untuk saat ini kami belum ada yang gluten free 😔
              Tapi untuk alergi lainnya bisa dikonsultasiin ke admin kami lho, siapa tau ada 
              solusinya! Hubungi di 0812-3456-7890 ya kak 🙏"

Pelanggan : "kapan bisa jadi kalau order sekarang?"
Kiki (✅)  : "Tergantung jenis kuenya kak! Kalau brownies atau cookies, bisa ambil hari ini 
              atau besok. Tapi kalau kue custom (kue ulang tahun yang didekorasi), minimal 
              3 hari sebelum acara ya. Kakak butuhnya untuk tanggal berapa? Aku cekkan dulu!"
```

### Parameter AI untuk Chatbot Humanis

```typescript
// Setting yang direkomendasikan untuk chatbot humanis
{
  temperature: 0.85,    // lebih tinggi = lebih kreatif & bervariasi (range: 0.7 - 0.9)
  max_tokens: 300,      // jawaban tidak terlalu panjang, seperti chat WA asli
  top_p: 0.9,           // menjaga kualitas tapi tetap ada variasi
}
```



### Stack & Library

```
Node.js + TypeScript + Express
├── @whiskeysockets/baileys  — WhatsApp connection
├── @anthropic-ai/sdk        — Claude AI
├── pg + drizzle-orm         — PostgreSQL ORM
├── ioredis                  — Redis client
├── socket.io                — WebSocket (QR code, live status)
├── jsonwebtoken             — JWT auth dashboard
├── bcrypt                   — Password hashing
├── zod                      — Request validation
├── winston                  — Logging
├── pino-http                — HTTP request logger
│
├── vitest                   — Unit test runner (fast, native TS)
├── @vitest/coverage-v8      — Code coverage report
├── supertest                — HTTP integration testing
└── msw (mock service worker)— Mock external API (AI provider, dll)
```

### Struktur Direktori Backend

```
chatbot-hub-api/
├── src/
│   ├── config/
│   │   ├── database.ts          # PostgreSQL connection (drizzle)
│   │   ├── redis.ts             # Redis connection
│   │   └── env.ts               # Environment variables (zod validated)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.service.ts
│   │   │
│   │   ├── client/
│   │   │   ├── client.routes.ts
│   │   │   ├── client.controller.ts
│   │   │   ├── client.service.ts
│   │   │   └── client.repository.ts
│   │   │
│   │   ├── chatbot/
│   │   │   ├── chatbot.routes.ts
│   │   │   ├── chatbot.controller.ts
│   │   │   └── chatbot.service.ts
│   │   │
│   │   ├── knowledge/
│   │   │   ├── knowledge.routes.ts
│   │   │   ├── knowledge.controller.ts
│   │   │   └── knowledge.repository.ts
│   │   │
│   │   ├── chat/                # Core: handle pesan masuk
│   │   │   ├── chat.routes.ts   # POST /v1/chat/message (public)
│   │   │   ├── chat.controller.ts
│   │   │   ├── chat.service.ts  # Orchestrate: load config → AI → save
│   │   │   └── conversation.repository.ts
│   │   │
│   │   └── whatsapp/
│   │       ├── wa.routes.ts     # connect, status, disconnect
│   │       ├── wa.controller.ts
│   │       ├── wa.service.ts    # Baileys session management
│   │       └── wa.handler.ts    # Incoming WA message handler
│   │
│   ├── providers/
│   │   ├── ai/
│   │   │   ├── ai.interface.ts  # AIProvider interface
│   │   │   └── claude.provider.ts
│   │   └── cache/
│   │       └── cache.service.ts # Redis abstraction
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT verify (dashboard)
│   │   ├── apikey.middleware.ts # API Key verify (widget)
│   │   └── ratelimit.middleware.ts
│   │
│   ├── db/
│   │   ├── schema/              # Drizzle schema (mirror dari SQL)
│   │   └── migrations/
│   │
│   ├── socket/
│   │   └── socket.gateway.ts   # Socket.io: QR code emit, WA status
│   │
│   ├── utils/
│   │   ├── prompt-builder.ts   # Build Claude prompt dari config + knowledge
│   │   └── logger.ts
│   │
│   └── app.ts                  # Express app setup
│
├── tests/
│   ├── unit/                   # Unit test — isolasi per fungsi/service
│   │   ├── utils/
│   │   │   └── prompt-builder.test.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.test.ts
│   │   │   └── apikey.middleware.test.ts
│   │   ├── modules/
│   │   │   ├── chat/
│   │   │   │   └── chat.service.test.ts
│   │   │   ├── client/
│   │   │   │   └── client.service.test.ts
│   │   │   └── knowledge/
│   │   │       └── knowledge.service.test.ts
│   │   └── providers/
│   │       └── ai/
│   │           └── claude.provider.test.ts
│   │
│   ├── integration/            # Integration test — endpoint HTTP nyata
│   │   ├── chat.api.test.ts    # POST /v1/chat/message
│   │   ├── auth.api.test.ts    # POST /api/auth/login
│   │   └── client.api.test.ts  # CRUD /api/clients
│   │
│   ├── fixtures/               # Data dummy reusable untuk test
│   │   ├── client.fixture.ts
│   │   ├── chatbot.fixture.ts
│   │   └── knowledge.fixture.ts
│   │
│   └── setup.ts                # Global setup (DB test, env mock)
│
├── vitest.config.ts
├── .env
├── .env.test                   # Env khusus testing
├── package.json
└── tsconfig.json
```

### Contoh Core Logic: Chat Service

```typescript
// src/modules/chat/chat.service.ts

export class ChatService {
  async processMessage(params: {
    clientId: number;
    sessionId: string;
    channel: 'web' | 'whatsapp';
    userMessage: string;
    userIdentifier: string;
  }): Promise<string> {

    // 1. Load chatbot config
    const chatbot = await chatbotRepo.findByClientId(params.clientId);

    // 2. Load knowledge base
    const knowledge = await knowledgeRepo.findActiveByClient(params.clientId);

    // 3. Load atau buat conversation
    const conversation = await this.getOrCreateConversation(params);

    // 4. Load history (max 10 pesan terakhir dari Redis/DB)
    const history = await this.loadHistory(conversation.id);

    // 5. Build prompt
    const systemPrompt = buildSystemPrompt(chatbot.systemPrompt, knowledge);

    // 6. Call Claude API
    const aiProvider = new ClaudeProvider();
    const reply = await aiProvider.chat({
      model: chatbot.aiModel,
      temperature: chatbot.temperature,
      maxTokens: chatbot.maxTokens,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: params.userMessage }],
    });

    // 7. Simpan pesan ke DB
    await messageRepo.saveUserMessage(conversation.id, params.userMessage);
    await messageRepo.saveAssistantMessage(conversation.id, reply.content, reply.tokensUsed);

    // 8. Update usage log
    await usageRepo.increment(params.clientId, params.channel);

    return reply.content;
  }
}
```

### Contoh: Prompt Builder

```typescript
// src/utils/prompt-builder.ts

export function buildSystemPrompt(
  botPrompt: string,
  knowledgeBases: KnowledgeBase[]
): string {
  const knowledgeSection = knowledgeBases
    .sort((a, b) => b.priority - a.priority)
    .map(kb => `## ${kb.title}\n${kb.content}`)
    .join('\n\n');

  return `
${botPrompt}

---
INFORMASI YANG KAMU KETAHUI:
${knowledgeSection}
---

INSTRUKSI TAMBAHAN:
- Jawab hanya berdasarkan informasi di atas.
- Jika tidak tahu, arahkan pelanggan ke admin/CS.
- Gunakan bahasa yang sopan dan ramah.
- Jawab dalam Bahasa Indonesia kecuali pelanggan menggunakan bahasa lain.
`.trim();
}
```

---

### Unit Testing

#### Framework & Pendekatan

```
Vitest       — test runner utama (native TypeScript, sangat cepat)
supertest    — simulasi HTTP request untuk integration test
vi.fn()      — mock function bawaan Vitest (pengganti jest.fn())
msw          — mock HTTP eksternal (AI provider API, dll)
```

**Strategi testing per layer:**

| Layer | Jenis Test | Yang Di-mock |
|---|---|---|
| `utils/` (prompt-builder, dll) | Unit | Tidak ada, pure function |
| `service/` | Unit | Repository, AI provider |
| `middleware/` | Unit | DB query, Redis |
| `controller/` | Integration | Service layer |
| `API endpoints` | Integration | DB pakai test DB nyata |

---

#### Konfigurasi Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/db/migrations/**', 'src/app.ts'],
      thresholds: {
        lines: 70,       // minimal 70% line coverage
        functions: 70,
        branches: 65,
      },
    },
    // Pisah unit dan integration agar bisa jalan terpisah
    include: ['tests/**/*.test.ts'],
  },
});
```

```typescript
// tests/setup.ts
import { vi, beforeAll, afterAll } from 'vitest';

// Set env test
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

beforeAll(async () => {
  // Setup koneksi DB test jika perlu
});

afterAll(async () => {
  // Cleanup koneksi
});
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

#### Contoh Unit Test: Prompt Builder

```typescript
// tests/unit/utils/prompt-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../../src/utils/prompt-builder';

const mockKnowledge = [
  { id: 1, title: 'Produk', content: 'Kue ulang tahun Rp 185.000', priority: 9, isActive: true },
  { id: 2, title: 'Profil', content: 'Toko buka jam 08.00-20.00', priority: 10, isActive: true },
];

describe('buildSystemPrompt', () => {
  it('harus menyertakan system prompt dari chatbot', () => {
    const result = buildSystemPrompt('Kamu adalah Kiki', mockKnowledge);
    expect(result).toContain('Kamu adalah Kiki');
  });

  it('harus menyertakan semua knowledge base', () => {
    const result = buildSystemPrompt('Kiki', mockKnowledge);
    expect(result).toContain('Kue ulang tahun Rp 185.000');
    expect(result).toContain('Toko buka jam 08.00-20.00');
  });

  it('knowledge dengan priority lebih tinggi harus muncul lebih dulu', () => {
    const result = buildSystemPrompt('Kiki', mockKnowledge);
    const idxProfil = result.indexOf('Toko buka jam 08.00');  // priority 10
    const idxProduk = result.indexOf('Kue ulang tahun');       // priority 9
    expect(idxProfil).toBeLessThan(idxProduk);
  });

  it('harus return string tidak kosong', () => {
    const result = buildSystemPrompt('Kiki', []);
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('harus mengandung instruksi tambahan', () => {
    const result = buildSystemPrompt('Kiki', mockKnowledge);
    expect(result).toContain('INSTRUKSI TAMBAHAN');
  });
});
```

---

#### Contoh Unit Test: Chat Service (dengan mock)

```typescript
// tests/unit/modules/chat/chat.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../../../src/modules/chat/chat.service';

// Mock semua dependency
const mockChatbotRepo = {
  findByClientId: vi.fn(),
};
const mockKnowledgeRepo = {
  findActiveByClient: vi.fn(),
};
const mockMessageRepo = {
  saveUserMessage: vi.fn(),
  saveAssistantMessage: vi.fn(),
};
const mockUsageRepo = {
  increment: vi.fn(),
};
const mockAiProvider = {
  chat: vi.fn(),
};

// Fixture data
const fakeChatbot = {
  id: 1, clientId: 1,
  name: 'Kiki', systemPrompt: 'Kamu adalah Kiki',
  aiModel: 'llama-3.3-70b-versatile',
  temperature: 0.85, maxTokens: 300,
};
const fakeKnowledge = [
  { id: 1, title: 'Produk', content: 'Kue Rp 185.000', priority: 9 },
];
const fakeConversation = { id: 10, sessionId: 'session-abc' };

describe('ChatService.processMessage', () => {
  let chatService: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChatbotRepo.findByClientId.mockResolvedValue(fakeChatbot);
    mockKnowledgeRepo.findActiveByClient.mockResolvedValue(fakeKnowledge);
    mockAiProvider.chat.mockResolvedValue({
      content: 'Halo kak! Kue kami mulai dari Rp 185.000 ya 😊',
      tokensUsed: 120,
    });
    mockMessageRepo.saveUserMessage.mockResolvedValue(undefined);
    mockMessageRepo.saveAssistantMessage.mockResolvedValue(undefined);
    mockUsageRepo.increment.mockResolvedValue(undefined);

    chatService = new ChatService(
      mockChatbotRepo as any,
      mockKnowledgeRepo as any,
      mockMessageRepo as any,
      mockUsageRepo as any,
      mockAiProvider as any,
    );

    // Mock internal getOrCreateConversation & loadHistory
    vi.spyOn(chatService as any, 'getOrCreateConversation')
      .mockResolvedValue(fakeConversation);
    vi.spyOn(chatService as any, 'loadHistory')
      .mockResolvedValue([]);
  });

  it('harus memanggil AI provider dengan prompt yang benar', async () => {
    await chatService.processMessage({
      clientId: 1,
      sessionId: 'session-abc',
      channel: 'web',
      userMessage: 'harga kue berapa?',
      userIdentifier: 'browser-xyz',
    });

    expect(mockAiProvider.chat).toHaveBeenCalledOnce();
    const callArgs = mockAiProvider.chat.mock.calls[0][0];
    expect(callArgs.system).toContain('Kamu adalah Kiki');
    expect(callArgs.messages.at(-1).content).toBe('harga kue berapa?');
  });

  it('harus mengembalikan balasan dari AI', async () => {
    const result = await chatService.processMessage({
      clientId: 1, sessionId: 'session-abc', channel: 'web',
      userMessage: 'harga?', userIdentifier: 'browser-xyz',
    });
    expect(result).toBe('Halo kak! Kue kami mulai dari Rp 185.000 ya 😊');
  });

  it('harus menyimpan pesan user dan response ke DB', async () => {
    await chatService.processMessage({
      clientId: 1, sessionId: 'session-abc', channel: 'whatsapp',
      userMessage: 'harga?', userIdentifier: '6281234567890',
    });

    expect(mockMessageRepo.saveUserMessage).toHaveBeenCalledWith(10, 'harga?');
    expect(mockMessageRepo.saveAssistantMessage).toHaveBeenCalledWith(
      10,
      'Halo kak! Kue kami mulai dari Rp 185.000 ya 😊',
      120,
    );
  });

  it('harus update usage log setelah proses pesan', async () => {
    await chatService.processMessage({
      clientId: 1, sessionId: 'session-abc', channel: 'whatsapp',
      userMessage: 'harga?', userIdentifier: '6281234567890',
    });

    expect(mockUsageRepo.increment).toHaveBeenCalledWith(1, 'whatsapp');
  });

  it('harus throw error jika chatbot tidak ditemukan', async () => {
    mockChatbotRepo.findByClientId.mockResolvedValue(null);

    await expect(
      chatService.processMessage({
        clientId: 999, sessionId: 'session-abc', channel: 'web',
        userMessage: 'halo', userIdentifier: 'browser-xyz',
      })
    ).rejects.toThrow('Chatbot not found for client 999');
  });

  it('harus throw error jika AI provider gagal', async () => {
    mockAiProvider.chat.mockRejectedValue(new Error('AI service timeout'));

    await expect(
      chatService.processMessage({
        clientId: 1, sessionId: 'session-abc', channel: 'web',
        userMessage: 'halo', userIdentifier: 'browser-xyz',
      })
    ).rejects.toThrow('AI service timeout');
  });
});
```

---

#### Contoh Unit Test: API Key Middleware

```typescript
// tests/unit/middleware/apikey.middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { apiKeyMiddleware } from '../../../src/middleware/apikey.middleware';

const mockClientRepo = {
  findByApiKey: vi.fn(),
};

const makeReq = (apiKey?: string) => ({
  headers: { 'x-api-key': apiKey },
}) as unknown as Request;

const makeRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const next: NextFunction = vi.fn();

describe('apiKeyMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('harus lanjut (next) jika API key valid', async () => {
    mockClientRepo.findByApiKey.mockResolvedValue({ id: 1, isActive: true });
    const middleware = apiKeyMiddleware(mockClientRepo as any);

    await middleware(makeReq('ck_valid_key'), makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('harus return 401 jika API key tidak dikirim', async () => {
    const middleware = apiKeyMiddleware(mockClientRepo as any);
    const res = makeRes();

    await middleware(makeReq(undefined), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus return 401 jika API key tidak ditemukan di DB', async () => {
    mockClientRepo.findByApiKey.mockResolvedValue(null);
    const middleware = apiKeyMiddleware(mockClientRepo as any);
    const res = makeRes();

    await middleware(makeReq('ck_invalid'), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('harus return 403 jika client tidak aktif', async () => {
    mockClientRepo.findByApiKey.mockResolvedValue({ id: 1, isActive: false });
    const middleware = apiKeyMiddleware(mockClientRepo as any);
    const res = makeRes();

    await middleware(makeReq('ck_inactive'), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

---

#### Contoh Integration Test: Chat Endpoint

```typescript
// tests/integration/chat.api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

// Gunakan database test terpisah (.env.test)
// AI provider di-mock via msw agar tidak hit API sungguhan

describe('POST /v1/chat/message', () => {
  it('harus return 401 jika api key tidak ada', async () => {
    const res = await request(app)
      .post('/v1/chat/message')
      .send({ session_id: 'test', message: 'halo' });

    expect(res.status).toBe(401);
  });

  it('harus return 400 jika body tidak lengkap', async () => {
    const res = await request(app)
      .post('/v1/chat/message')
      .set('X-Api-Key', 'ck_laris_manis_demo_key_2024')
      .send({});  // missing message

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('harus return 200 dan reply dari AI jika request valid', async () => {
    const res = await request(app)
      .post('/v1/chat/message')
      .set('X-Api-Key', 'ck_laris_manis_demo_key_2024')
      .send({ session_id: 'integration-test-session', message: 'harga kue berapa?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('session_id');
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
  });
});
```

---

#### Target Coverage

```
Minimal coverage yang harus dicapai sebelum deploy:

┌─────────────────────────────────────┬──────────┐
│ Area                                │ Target   │
├─────────────────────────────────────┼──────────┤
│ src/utils/                          │ 90%+     │
│ src/middleware/                     │ 85%+     │
│ src/modules/chat/chat.service.ts    │ 85%+     │
│ src/modules/client/                 │ 75%+     │
│ src/providers/ai/                   │ 75%+     │
│ Overall                             │ 70%+     │
└─────────────────────────────────────┴──────────┘

Jalankan: npm run test:coverage
Laporan HTML tersedia di: coverage/index.html
```

---

## Frontend

### Stack Dashboard (Nuxt.js)

```
Nuxt.js 3 + TypeScript
├── @nuxtjs/tailwindcss     — Styling
├── pinia                   — State management
├── @vueuse/core            — Composables
├── socket.io-client        — WebSocket (QR live)
├── chart.js + vue-chartjs  — Analytics chart
└── @headlessui/vue         — UI components
```

### Halaman Dashboard

```
/login                    → Login admin/superadmin
/dashboard                → Overview statistik semua client
/clients                  → Daftar semua UMKM client
/clients/new              → Tambah client baru
/clients/:id              → Detail client
/clients/:id/chatbot      → Konfigurasi chatbot (system prompt, model, dll)
/clients/:id/knowledge    → Manage knowledge base (CRUD)
/clients/:id/whatsapp     → Connect/disconnect WA, lihat status, QR code
/clients/:id/conversations → Riwayat percakapan
/clients/:id/analytics    → Grafik usage, message count, dll
```

### Embed Widget (Vanilla TypeScript)

```typescript
// Cara penggunaan oleh UMKM di website mereka:
<script>
  window.ChatbotHubConfig = {
    apiKey: 'ck_xxxxxxxxxxxxx',
    position: 'bottom-right',
    primaryColor: '#25D366',
    welcomeText: 'Halo! Ada yang bisa kami bantu?',
  };
</script>
<script src="https://hub.domain.com/widget.js" async></script>
```

Widget akan:
- Inject chat bubble ke DOM
- Manage `session_id` di `localStorage`
- POST ke `/v1/chat/message` dengan API key
- Tampilkan loading indicator saat menunggu respons AI

---

## API Endpoints

### Public Endpoints (Embed Widget — auth: `X-Api-Key` header)

```
POST   /v1/chat/message              # Kirim pesan, terima balasan AI
GET    /v1/chat/history/:session_id  # Load history percakapan
```

### Dashboard Endpoints (auth: Bearer JWT)

```
# Auth
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

# Clients (UMKM)
GET    /api/clients                  # List semua client
POST   /api/clients                  # Buat client baru
GET    /api/clients/:id              # Detail client
PUT    /api/clients/:id              # Update client
DELETE /api/clients/:id              # Hapus client

# Chatbot Config
GET    /api/clients/:id/chatbot      # Get config chatbot
POST   /api/clients/:id/chatbot      # Buat chatbot
PUT    /api/clients/:id/chatbot      # Update chatbot config

# Knowledge Base
GET    /api/clients/:id/knowledge           # List knowledge
POST   /api/clients/:id/knowledge           # Tambah knowledge
PUT    /api/clients/:id/knowledge/:kid      # Update knowledge
DELETE /api/clients/:id/knowledge/:kid      # Hapus knowledge

# WhatsApp Management
POST   /api/clients/:id/wa/connect         # Init session & generate QR
GET    /api/clients/:id/wa/status          # Get status koneksi WA
POST   /api/clients/:id/wa/disconnect      # Putuskan koneksi WA

# Conversations & Messages
GET    /api/clients/:id/conversations             # List semua conversation
GET    /api/clients/:id/conversations/:cid/messages  # Detail pesan

# Analytics
GET    /api/clients/:id/analytics?from=&to=      # Usage stats per periode
```

---

## Fase Development

### Phase 1–8 ✅ Selesai

| Fase | Scope | Detail |
|---|---|---|
| **Fase 1** | Foundation | Setup project Node.js/TS, koneksi PostgreSQL + Redis, schema migration, CRUD client & chatbot |
| **Fase 2** | AI Chat | Integrasi Claude API, knowledge base injection, prompt builder, endpoint `/v1/chat/message` |
| **Fase 3** | WhatsApp | Integrasi Baileys, session management per client, QR code via WebSocket, incoming message handler |
| **Fase 4** | Dashboard | Nuxt.js admin dashboard, semua halaman manajemen, QR display realtime |
| **Fase 5** | Embed Widget | Vanilla TS widget, deploy widget.js, dokumentasi cara embed untuk UMKM |
| **Fase 6** | Hardening | Rate limiting, usage billing, error handling, monitoring (PM2 + log), security audit |
| **Fase 7–8** | *(selesai)* | *(detail di dokumen terpisah)* |

---

### Phase 9–12: AI Capabilities

> Urutan berdasarkan ROI tertinggi. Kerjakan Phase 9 & 10 back-to-back karena keduanya langsung mengubah UX secara signifikan.

| Fase | Scope | Prioritas | Detail |
|---|---|---|---|
| **Phase 9** | Streaming Responses | 🔴 Tinggi | Backend SSE + update widget real-time. Respons muncul word-by-word. Modifikasi `chat.service.ts` untuk stream Claude API, update embed widget pakai `EventSource`, Baileys kirim via `sendMessage` incremental |
| **Phase 10** | Tool Use / Function Calling | 🔴 Tinggi | Per-tenant custom tools. AI bisa bertindak, bukan hanya menjawab. Contoh tools: `check_order_status(order_id)`, `get_product_availability(product_name)`, `get_store_hours()`, `create_reservation(date, time, party_size)`. Schema tool definition disimpan per-tenant di DB |
| **Phase 11** | Prompt Caching | 🟡 Medium | System prompt + knowledge base di-cache di Anthropic. Hemat token & turunkan latency. Tambah `cache_control` di `prompt-builder.ts`. Cocok setelah traffic mulai naik |
| **Phase 12** | Vision / Multimodal | 🟡 Medium | Handle gambar dari WhatsApp. Baileys sudah support terima media. Customer kirim foto produk → AI analisa & jawab. Tambah image handler di `wa.handler.ts`, encode base64, kirim ke Claude vision endpoint |

**Bonus Phase — Dashboard AI Assistant** *(dikerjakan saat ada bandwidth, cocok sebagai fitur plan Pro)*
- Auto-generate knowledge base entries dari deskripsi produk yang diketik UMKM
- Suggest perbaikan system prompt chatbot berdasarkan log percakapan
- Summarize conversation logs & analytics harian
- Implementasi via "Claude-in-Claude" di Nuxt dashboard

---

### Phase 13–16: Billing, Invoice & Payment

> Fitur lengkap pengelolaan tagihan UMKM. Kerjakan setelah Phase 9–10 selesai agar platform sudah stabil sebelum masuk ke domain keuangan.

| Fase | Scope | Estimasi | Detail |
|---|---|---|---|
| **Phase 13** | Usage Dashboard + Threshold Notifikasi | 2–3 minggu | Halaman usage per-tenant di dashboard Nuxt (grafik pemakaian harian, running total bulan berjalan, % quota terpakai). Threshold notif 80% / 95% / 100%. Notif web via Socket.io (banner di dashboard) + email via Resend.com. Tambah tabel `quota_alerts` untuk cegah double notif |
| **Phase 14** | Invoice Generation + PDF + Email | 2–3 minggu | Cron job tanggal 1 setiap bulan. Hitung subtotal + overage + PPN 11%. Generate PDF via Puppeteer (render HTML template → PDF). Simpan ke storage (`/storage/invoices/`). Insert tabel `invoices` + `invoice_items`. Kirim email ke tenant dengan PDF attachment. Tenant bisa download PDF dari dashboard |
| **Phase 15** | Payment Gateway (Midtrans) | 2–3 minggu | Integrasi Midtrans Snap API. Metode pembayaran: QRIS, Virtual Account (BCA/BNI/BRI/Mandiri), GoPay, OVO, Dana, ShopeePay. Halaman invoice di dashboard + tombol Bayar. Webhook handler `/api/payments/webhook` untuk konfirmasi otomatis. Update invoice → `paid`. Kirim email receipt setelah pembayaran berhasil |
| **Phase 16** | Grace Period + Quota Enforcement | 1 minggu | Logic suspend chatbot saat quota 100% + 3 hari grace period. Cron harian cek `grace_period_end`. Chatbot status → `suspended` jika tidak bayar. Reaktivasi otomatis setelah webhook payment confirmed. Notif email final sebelum suspend |
| **Phase 17** | Auth UMKM & Multi-portal | 2–3 minggu | Sistem login/register terpisah untuk UMKM. Self-register + verifikasi email. Google OAuth. Onboarding wizard 3 langkah. Dashboard UMKM ter-scope ke `client_id` masing-masing. Lihat detail di section [Auth UMKM](#auth-umkm--sistem-login--registrasi) |
| **Phase 18** | Landing Page & Halaman Publik | 2–3 minggu | Halaman komersial untuk akuisisi UMKM baru. Landing page utama, halaman cara kerja, pricing, dan FAQ. Satu repo Nuxt.js dengan dashboard. Lihat detail di section [Landing Page](#landing-page--halaman-publik) |

---

## Pricing & Billing Model

### Struktur Plan

| Plan | Harga/bulan | Quota pesan | Overage | Behavior saat habis |
|---|---|---|---|---|
| **Free** | Rp 0 | 100 pesan | Tidak ada | Chatbot berhenti, grace period 3 hari |
| **Basic** | Rp 99.000 | 1.000 pesan | Rp 150/pesan | Tetap jalan (overage ditagih), grace period 3 hari |
| **Pro** | Rp 299.000 | 5.000 pesan | Rp 120/pesan | Tetap jalan (overage ditagih), grace period 3 hari |

### Dasar Estimasi Harga Overage

Rata-rata 1 pesan = ~800 input token + ~300 output token (termasuk system prompt + knowledge base injection).

| Komponen | Harga Anthropic | Estimasi per pesan |
|---|---|---|
| Input tokens (800) | $3 / 1M token | ~$0.0024 |
| Output tokens (300) | $15 / 1M token | ~$0.0045 |
| **Total biaya AI** | | **~$0.007 ≈ Rp 115** (kurs 16.500) |

Overage Basic Rp 150/pesan → margin ~23% setelah biaya AI.
Overage Pro Rp 120/pesan → margin ~4% (volume discount, acceptable).

> **Catatan:** Harga overage harus di-review jika rata-rata panjang percakapan meningkat (knowledge base besar + history panjang = lebih banyak input token).

### Grace Period

- Saat quota 100% habis → chatbot masih jalan selama **3 hari**
- Hari ke-4 tanpa pembayaran → chatbot di-**suspend** (status `grace_expired`)
- Setelah pembayaran dikonfirmasi Midtrans → chatbot **reaktivasi otomatis**
- Plan **Free** tidak ada overage — chatbot langsung berhenti saat 100%, grace period tetap 3 hari sebelum suspend permanen

### Threshold Notifikasi Quota

| Threshold | Aksi |
|---|---|
| 80% | Notif web (banner dashboard) + email: "Sisa 20% quota bulan ini" |
| 95% | Notif urgent + saran upgrade plan |
| 100% | Notif: chatbot masuk grace period, sisa 3 hari |
| Grace hari ke-3 | Email peringatan final sebelum suspend |

### Format Nomor Invoice

```
INV-[TAHUN]-[BULAN]-[SEQUENCE 5 DIGIT]
Contoh: INV-2025-01-00042
```

Sequence tidak reset per tahun agar nomor invoice selalu unik dan mudah dilacak.

### Struktur Invoice

```
INV-2025-01-00042 | Diterbitkan: 1 Februari 2025
Kepada  : Toko Kue Laris Manis
Email   : larismanis@gmail.com
Periode : 1 Januari 2025 – 31 Januari 2025
Plan    : Basic

Langganan Basic (Jan 2025)          Rp  99.000
Overage: 150 pesan × Rp 150        Rp  22.500
                                   ──────────
Subtotal                            Rp 121.500
PPN 11%                             Rp  13.365
                                   ──────────
TOTAL                               Rp 134.865
```

### Payment Gateway — Midtrans

Semua metode pembayaran ditangani Midtrans Snap (satu integrasi, semua metode):
- QRIS (semua e-wallet & m-banking)
- Virtual Account: BCA, BNI, BRI, Mandiri, Permata
- E-wallet: GoPay, OVO, Dana, ShopeePay
- Package: `midtrans-client` (Node.js SDK)

---

## Database Model Tambahan — Billing

```sql
-- =============================================================
-- 9. PLANS (master data paket berlangganan)
-- =============================================================
CREATE TABLE plans (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(50) NOT NULL,               -- 'free', 'basic', 'pro'
  price_idr           INT NOT NULL DEFAULT 0,             -- harga bulanan dalam Rupiah
  quota_messages      INT NOT NULL,                       -- jumlah pesan per bulan
  overage_price_idr   INT NOT NULL DEFAULT 0,             -- harga per pesan overage (Rupiah)
  is_active           BOOLEAN DEFAULT TRUE
);

INSERT INTO plans (name, price_idr, quota_messages, overage_price_idr) VALUES
('free',  0,       100,   0),
('basic', 99000,   1000,  150),
('pro',   299000,  5000,  120);

-- Tambah kolom plan_id ke tabel clients (relasi ke plans)
ALTER TABLE clients ADD COLUMN plan_id INT REFERENCES plans(id) DEFAULT 1;
ALTER TABLE clients ADD COLUMN grace_period_end TIMESTAMPTZ NULL;
ALTER TABLE clients ADD COLUMN chatbot_status VARCHAR(20) DEFAULT 'active'
  CHECK (chatbot_status IN ('active', 'grace', 'suspended'));

-- =============================================================
-- 10. QUOTA ALERTS (track notifikasi yang sudah dikirim)
-- =============================================================
CREATE TABLE quota_alerts (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id),
  period        DATE NOT NULL,                            -- bulan-tahun periode (hari selalu 1)
  threshold_pct SMALLINT NOT NULL,                        -- 80, 95, 100
  notif_web_sent  BOOLEAN DEFAULT FALSE,
  notif_email_sent BOOLEAN DEFAULT FALSE,
  sent_at       TIMESTAMPTZ NULL,
  UNIQUE (client_id, period, threshold_pct)
);

-- =============================================================
-- 11. INVOICES (header invoice bulanan)
-- =============================================================
CREATE TABLE invoices (
  id              BIGSERIAL PRIMARY KEY,
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,            -- INV-2025-01-00042
  client_id       BIGINT NOT NULL REFERENCES clients(id),
  plan_id         INT NOT NULL REFERENCES plans(id),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  subtotal_idr    INT NOT NULL DEFAULT 0,
  ppn_idr         INT NOT NULL DEFAULT 0,                 -- PPN 11%
  total_idr       INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'paid', 'overdue', 'void')),
  pdf_path        VARCHAR(500) NULL,                      -- path file PDF di storage
  due_date        DATE NOT NULL,                          -- biasanya H+7 dari tanggal terbit
  paid_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_client ON invoices(client_id, period_start DESC);
CREATE INDEX idx_invoices_status ON invoices(status, due_date);

-- =============================================================
-- 12. INVOICE ITEMS (line item per invoice)
-- =============================================================
CREATE TABLE invoice_items (
  id            BIGSERIAL PRIMARY KEY,
  invoice_id    BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   VARCHAR(255) NOT NULL,                    -- 'Langganan Basic', 'Overage 150 pesan'
  quantity      INT NOT NULL DEFAULT 1,
  unit_price_idr INT NOT NULL,
  amount_idr    INT NOT NULL
);

-- =============================================================
-- 13. PAYMENT TRANSACTIONS (record setiap attempt pembayaran)
-- =============================================================
CREATE TABLE payment_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  invoice_id          BIGINT NOT NULL REFERENCES invoices(id),
  midtrans_order_id   VARCHAR(100) UNIQUE NOT NULL,       -- order_id yang dikirim ke Midtrans
  midtrans_txn_id     VARCHAR(100) NULL,                  -- transaction_id dari Midtrans
  payment_method      VARCHAR(50) NULL,                   -- 'qris', 'bank_transfer', 'gopay', dll
  bank                VARCHAR(20) NULL,                   -- 'bca', 'bni', dll (jika VA)
  amount_idr          INT NOT NULL,
  status              VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'settlement', 'expire', 'cancel', 'deny')),
  midtrans_response   JSONB NULL,                         -- raw response dari Midtrans webhook
  paid_at             TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_order ON payment_transactions(midtrans_order_id);

-- =============================================================
-- 14. EMAIL LOGS (audit trail semua email yang dikirim)
-- =============================================================
CREATE TABLE email_logs (
  id          BIGSERIAL PRIMARY KEY,
  client_id   BIGINT NOT NULL REFERENCES clients(id),
  type        VARCHAR(50) NOT NULL,
    -- 'quota_alert_80', 'quota_alert_95', 'quota_alert_100',
    -- 'grace_warning', 'invoice_generated', 'payment_confirmed', 'chatbot_suspended'
  subject     VARCHAR(255) NOT NULL,
  recipient   VARCHAR(255) NOT NULL,
  status      VARCHAR(20) DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'bounced')),
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_logs_client ON email_logs(client_id, sent_at DESC);

-- Trigger updated_at untuk payment_transactions
CREATE TRIGGER trg_payment_updated
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Library Tambahan untuk Billing

```
Backend:
├── puppeteer              — HTML template → PDF invoice
├── node-cron              — Cron job (generate invoice, cek grace period, threshold notif)
├── midtrans-client        — Midtrans Snap & webhook verification
├── nodemailer             — SMTP email (atau gunakan Resend SDK)
└── resend                 — Email service modern dengan free tier 3.000 email/bulan

Storage invoice PDF:
└── Local disk /storage/invoices/  (development)
    atau MinIO / S3-compatible     (production)
```

### Endpoint API Tambahan — Billing

```
# Usage & Quota (tenant dashboard)
GET    /api/clients/:id/usage                    # Usage bulan berjalan + history
GET    /api/clients/:id/usage/summary            # % quota, sisa pesan, estimasi overage

# Invoices
GET    /api/clients/:id/invoices                 # List semua invoice
GET    /api/clients/:id/invoices/:iid            # Detail invoice
GET    /api/clients/:id/invoices/:iid/pdf        # Download PDF invoice
POST   /api/clients/:id/invoices/:iid/pay        # Buat Midtrans payment link

# Payment webhook (public, no auth — verifikasi via Midtrans signature)
POST   /api/payments/webhook                     # Callback dari Midtrans

# Admin only
GET    /api/admin/invoices                       # List semua invoice semua tenant
POST   /api/admin/invoices/generate              # Manual trigger generate invoice
GET    /api/admin/revenue?from=&to=              # Revenue report
```

### Halaman Dashboard Tambahan (Nuxt.js)

```
/clients/:id/usage          → Grafik pemakaian harian, progress bar quota, alert threshold
/clients/:id/invoices       → List invoice dengan status (unpaid/paid/overdue)
/clients/:id/invoices/:id   → Detail invoice + tombol Download PDF + tombol Bayar
/admin/revenue              → Revenue dashboard semua tenant (superadmin only)
```

---

## Auth UMKM — Sistem Login & Registrasi

### Dua Portal Terpisah

| Portal | URL | Untuk siapa |
|---|---|---|
| **Admin Hub** | `/admin/login` | Pengelola platform (superadmin, admin) |
| **Dashboard UMKM** | `/login` atau `/app/login` | Pemilik & operator toko |

Kedua portal menggunakan JWT, tapi token-nya berbeda dan tidak saling bisa dipakai. Middleware membedakan via `user_type: 'admin' | 'client'` di dalam JWT payload.

### Cara Buat Akun UMKM

**Jalur 1 — Self-register (UMKM daftar sendiri)**
```
1. Buka /register
2. Isi: nama toko, nama pemilik, email, password (min 8 karakter)
   — atau klik "Daftar dengan Google" → Google OAuth flow
3. Sistem kirim email verifikasi (link berlaku 24 jam)
4. Klik link → status akun: active, plan: free
5. Redirect ke onboarding wizard
```

**Jalur 2 — Admin buatkan akun**
```
1. Admin login ke /admin
2. Buka menu Clients → Tambah Client Baru
3. Isi data toko + email UMKM
4. Sistem generate password sementara + kirim email undangan
5. UMKM klik link di email → set password baru → masuk dashboard
```

### Onboarding Wizard (setelah register berhasil)

3 langkah yang memandu UMKM baru sebelum masuk dashboard utama:

```
Step 1 — Profil Toko
  Nama toko, deskripsi singkat, nomor HP admin toko

Step 2 — Setup Chatbot Dasar
  Nama chatbot, bahasa, pesan sambutan
  (bisa skip, bisa edit nanti)

Step 3 — Connect WhatsApp
  Tampilkan QR code untuk scan
  (bisa skip, WhatsApp bisa dihubungkan nanti dari dashboard)
```

Setelah wizard selesai → masuk dashboard UMKM. Status onboarding disimpan di kolom `onboarding_completed_at`.

### Fitur Auth Lengkap

| Fitur | Keterangan |
|---|---|
| Register email + password | Wajib verifikasi email dulu |
| Login Google OAuth | Passport.js strategy `google-oauth20` |
| Lupa password | Kirim link reset ke email, berlaku 1 jam |
| Ganti password | Dari halaman profil, perlu konfirmasi password lama |
| Logout | Revoke refresh token di DB |
| Remember me | Refresh token 30 hari (default 7 hari) |
| Multiple user per toko | Owner bisa invite operator/viewer (fase lanjutan) |

### Role dalam Satu Akun UMKM

Kolom `role` di `client_users` — bisa dikembangkan di fase lanjutan:

| Role | Akses |
|---|---|
| `owner` | Akses penuh: chatbot, WA, knowledge base, usage, invoice, billing |
| `operator` | Manage chatbot, WA, knowledge base — tidak bisa lihat invoice & billing |
| `viewer` | Read-only: hanya lihat conversation history & analytics |

> Untuk Phase 17, implementasi dulu `owner` saja. Role `operator` dan `viewer` bisa ditambah di fase berikutnya.

### Database Model — Auth UMKM

```sql
-- =============================================================
-- 15. CLIENT USERS (akun login UMKM — terpisah dari admin_users)
-- =============================================================
CREATE TABLE client_users (
  id                      BIGSERIAL PRIMARY KEY,
  client_id               BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) UNIQUE NOT NULL,
  password_hash           VARCHAR(255) NULL,              -- NULL jika login via Google OAuth
  google_id               VARCHAR(100) UNIQUE NULL,       -- Google OAuth subject ID
  google_avatar_url       VARCHAR(500) NULL,
  role                    VARCHAR(20) DEFAULT 'owner'
    CHECK (role IN ('owner', 'operator', 'viewer')),
  status                  VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  email_verified_at       TIMESTAMPTZ NULL,
  onboarding_completed_at TIMESTAMPTZ NULL,
  last_login_at           TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_users_email  ON client_users(email);
CREATE INDEX idx_client_users_client ON client_users(client_id);

-- =============================================================
-- 16. EMAIL VERIFICATIONS (token verifikasi email & reset password)
-- =============================================================
CREATE TABLE email_verifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL
    CHECK (type IN ('verify_email', 'reset_password', 'invite')),
  token_hash  VARCHAR(255) UNIQUE NOT NULL,           -- hash dari token yang dikirim ke email
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_verif_token ON email_verifications(token_hash);

-- =============================================================
-- 17. REFRESH TOKENS (untuk kedua jenis user: UMKM + admin)
-- =============================================================
CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  user_type   VARCHAR(10) NOT NULL CHECK (user_type IN ('client', 'admin')),
  token_hash  VARCHAR(255) UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, user_type);

-- Trigger updated_at untuk client_users
CREATE TRIGGER trg_client_users_updated
  BEFORE UPDATE ON client_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Endpoint API Tambahan — Auth UMKM

```
# Auth UMKM (public)
POST   /api/auth/register                  # Daftar akun baru (email + password)
POST   /api/auth/login                     # Login email + password
POST   /api/auth/logout                    # Revoke refresh token
POST   /api/auth/refresh                   # Refresh access token
GET    /api/auth/google                    # Redirect ke Google OAuth
GET    /api/auth/google/callback           # Callback dari Google
POST   /api/auth/verify-email              # Verifikasi token dari email
POST   /api/auth/forgot-password           # Request reset password
POST   /api/auth/reset-password            # Submit password baru dengan token

# Profil UMKM (auth: Bearer JWT client)
GET    /api/me                             # Data user yang sedang login
PUT    /api/me                             # Update nama, avatar
PUT    /api/me/password                    # Ganti password

# Onboarding
GET    /api/me/onboarding                  # Status onboarding
PUT    /api/me/onboarding                  # Update progress wizard
```

### Halaman Nuxt.js Tambahan — Auth & Onboarding

```
/register                 → Form registrasi UMKM baru
/login                    → Login UMKM (email/password + Google OAuth)
/verify-email             → Halaman konfirmasi setelah klik link email
/forgot-password          → Form request reset password
/reset-password           → Form input password baru
/onboarding               → Wizard 3 langkah (profil → chatbot → WA)
/app/profile              → Halaman profil & ganti password
/admin/login              → Login khusus admin hub (terpisah)
```

### Library Tambahan untuk Auth

```
Backend:
├── passport                — Auth middleware (strategy pattern)
├── passport-local          — Email + password strategy
├── passport-google-oauth20 — Google OAuth strategy
└── crypto (built-in Node)  — Generate & hash token verifikasi email
```

---

## Landing Page & Halaman Publik

### Struktur Repo Nuxt.js (satu repo, tiga area)

```
Satu repo Nuxt.js menangani tiga area berbeda via route groups:

/                          → Halaman publik (landing, pricing, cara kerja, FAQ)
/login, /register          → Auth UMKM
/app/...                   → Dashboard UMKM (protected, perlu login)
/admin/...                 → Dashboard admin hub (protected, role admin)
```

Middleware Nuxt membedakan akses:
- Route `/app/*` → cek JWT client, redirect ke `/login` jika belum login
- Route `/admin/*` → cek JWT admin, redirect ke `/admin/login` jika belum login
- Route publik `/`, `/pricing`, dst → bebas akses

---

### Daftar Halaman Publik

#### 1. Landing Page Utama — `/`

Halaman utama yang menjadi wajah produk. Tujuan utama: UMKM paham nilai produk dalam 10 detik dan tertarik klik "Coba Gratis".

**Struktur section (dari atas ke bawah):**

```
┌─────────────────────────────────────────────┐
│  NAVBAR                                     │
│  Logo | Fitur | Cara Kerja | Harga | FAQ    │
│  [Masuk]  [Coba Gratis →]                   │
├─────────────────────────────────────────────┤
│  HERO                                       │
│  Headline: "Chatbot AI untuk Toko Anda,     │
│  Siap dalam 5 Menit"                        │
│  Subheadline: Otomatis balas pesan WA &     │
│  website 24 jam tanpa biaya karyawan        │
│  [Mulai Gratis] [Lihat Demo →]              │
│  Visual: mockup chat WA + web widget        │
├─────────────────────────────────────────────┤
│  SOCIAL PROOF                               │
│  "Dipercaya X+ UMKM di Indonesia"           │
│  Logo / nama toko yang sudah pakai          │
├─────────────────────────────────────────────┤
│  MASALAH → SOLUSI                           │
│  3 pain point UMKM + solusi platform ini    │
│  ① Kewalahan balas WA → Chatbot 24/7       │
│  ② Susah kelola CS → Semua terpusat        │
│  ③ Biaya mahal → Mulai gratis              │
├─────────────────────────────────────────────┤
│  FITUR UNGGULAN (6 kartu)                   │
│  WhatsApp otomatis | Web widget             │
│  Knowledge base | Humanis & natural         │
│  Multi-channel | Analitik percakapan        │
├─────────────────────────────────────────────┤
│  CARA KERJA (ringkasan 3 langkah)           │
│  Daftar → Setup chatbot → Chatbot aktif     │
│  [Lihat detail cara kerja →]                │
├─────────────────────────────────────────────┤
│  PRICING RINGKAS (3 kolom)                  │
│  Free | Basic Rp 99rb | Pro Rp 299rb        │
│  [Lihat perbandingan lengkap →]             │
├─────────────────────────────────────────────┤
│  TESTIMONI                                  │
│  2–3 kutipan dari UMKM yang sudah pakai     │
├─────────────────────────────────────────────┤
│  CTA FINAL                                  │
│  "Mulai sekarang, gratis selamanya"         │
│  [Buat Akun Gratis]                         │
├─────────────────────────────────────────────┤
│  FOOTER                                     │
│  Link halaman | Kontak | Syarat & Kebijakan │
└─────────────────────────────────────────────┘
```

**Copywriting arah pesan:**
- Bahasa Indonesia kasual, hangat, tidak korporat
- Fokus pada manfaat nyata untuk UMKM: hemat waktu, hemat biaya, tidak perlu teknis
- Hindari jargon AI/tech yang membingungkan pemilik toko

---

#### 2. Halaman Cara Kerja — `/cara-kerja`

Penjelasan visual step-by-step bagaimana platform bekerja. Target: UMKM yang penasaran tapi belum yakin.

**Struktur section:**

```
┌─────────────────────────────────────────────┐
│  HERO MINI                                  │
│  "Dari daftar sampai chatbot aktif,         │
│   hanya butuh 5 menit"                      │
├─────────────────────────────────────────────┤
│  FLOW ONBOARDING (timeline vertikal)        │
│                                             │
│  Step 1 — Daftar akun (30 detik)            │
│    Masukkan nama toko & email               │
│    Langsung dapat akun gratis               │
│                                             │
│  Step 2 — Setup chatbot (2 menit)           │
│    Beri nama chatbot & tulis persona-nya    │
│    Isi info produk, FAQ, jam buka           │
│                                             │
│  Step 3 — Hubungkan WhatsApp (1 menit)      │
│    Scan QR code sekali saja                 │
│    Chatbot langsung aktif di nomor WA Anda  │
│                                             │
│  Step 4 — Pasang di website (opsional)      │
│    Copy-paste 1 baris kode ke website       │
│    Muncul chat bubble otomatis              │
│                                             │
│  Step 5 — Pantau dari dashboard             │
│    Lihat semua percakapan                   │
│    Monitor usage & performa chatbot         │
├─────────────────────────────────────────────┤
│  FLOW PERCAKAPAN (diagram visual)           │
│  Pelanggan chat WA →                        │
│  AI baca knowledge base toko →             │
│  Balas otomatis dalam hitungan detik        │
├─────────────────────────────────────────────┤
│  DEMO INTERAKTIF (opsional, fase lanjutan)  │
│  Widget chat langsung di halaman ini        │
│  Bisa dicoba tanpa daftar                   │
├─────────────────────────────────────────────┤
│  CTA                                        │
│  [Coba Sekarang — Gratis]                   │
└─────────────────────────────────────────────┘
```

---

#### 3. Halaman Pricing — `/harga`

Perbandingan plan lengkap dengan semua fitur. Target: UMKM yang sudah tertarik, tinggal memilih plan.

**Struktur section:**

```
┌─────────────────────────────────────────────┐
│  HEADLINE                                   │
│  "Mulai gratis, upgrade kapan saja"         │
│  Toggle: Bayar Bulanan (aktif)              │
├─────────────────────────────────────────────┤
│  3 KARTU PLAN                               │
│                                             │
│  FREE          BASIC ★        PRO           │
│  Rp 0          Rp 99.000      Rp 299.000    │
│  100 pesan/bln 1.000 pesan    5.000 pesan   │
│                +Rp150/overage +Rp120/overage│
│  [Mulai Gratis][Pilih Basic]  [Pilih Pro]   │
├─────────────────────────────────────────────┤
│  TABEL PERBANDINGAN FITUR LENGKAP           │
│  Checklist semua fitur per plan             │
│  (WhatsApp, web widget, knowledge base,     │
│   jumlah pesan, support, dll)               │
├─────────────────────────────────────────────┤
│  KALKULATOR ESTIMASI BIAYA                  │
│  "Kira-kira toko saya butuh plan apa?"      │
│  Input: rata-rata pesan per hari →          │
│  Output: rekomendasi plan + estimasi biaya  │
├─────────────────────────────────────────────┤
│  FAQ PRICING                                │
│  - Apakah bisa upgrade/downgrade kapan saja?│
│  - Bagaimana perhitungan overage?           │
│  - Metode pembayaran apa saja?              │
│  - Apakah ada kontrak jangka panjang?       │
├─────────────────────────────────────────────┤
│  CTA                                        │
│  [Mulai dengan Free] [Hubungi Kami]         │
└─────────────────────────────────────────────┘
```

**Tabel perbandingan fitur lengkap:**

| Fitur | Free | Basic | Pro |
|---|---|---|---|
| Pesan per bulan | 100 | 1.000 | 5.000 |
| Overage | — | Rp 150/pesan | Rp 120/pesan |
| Chatbot WhatsApp | ✓ | ✓ | ✓ |
| Web widget embed | ✓ | ✓ | ✓ |
| Knowledge base | 3 entri | 20 entri | Unlimited |
| History percakapan | 7 hari | 30 hari | 90 hari |
| Analitik usage | Basic | Lengkap | Lengkap + export |
| Email notifikasi | ✓ | ✓ | ✓ |
| Invoice & billing | — | ✓ | ✓ |
| Support | Email | Email + WA | Priority |
| Grace period | 3 hari | 3 hari | 3 hari |

> Batas knowledge base (3/20/unlimited) perlu dikonfirmasi dan ditambahkan ke skema `plans` sebagai kolom `max_knowledge_entries`.

---

#### 4. Halaman FAQ — `/faq`

Pertanyaan umum yang muncul sebelum UMKM memutuskan daftar.

**Kategori & pertanyaan:**

```
UMUM
- Apa itu [Nama Produk]?
- Apakah perlu keahlian teknis untuk pakai ini?
- Apakah chatbot bisa berbahasa Indonesia?
- Apakah data percakapan pelanggan saya aman?

WHATSAPP
- Apakah menggunakan WhatsApp resmi atau unofficial?
- Apakah nomor WA saya bisa di-banned?
- Bagaimana jika WA terputus?
- Bisakah satu nomor WA untuk beberapa chatbot?

CHATBOT & AI
- Seberapa pintar chatbot-nya?
- Apakah bisa menjawab pertanyaan di luar knowledge base?
- Bagaimana cara update info produk di chatbot?
- Apakah chatbot bisa ambil alih ke manusia (human takeover)?

BILLING & PEMBAYARAN
- Bagaimana cara hitung overage?
- Metode pembayaran apa saja?
- Apakah ada refund jika batal di tengah bulan?
- Apakah ada kontrak atau bisa berhenti kapan saja?

TEKNIS
- Apakah bisa dipakai di website selain WordPress?
- Apakah ada API untuk integrasi sistem saya?
- Berapa lama waktu setup sampai chatbot aktif?
```

---

### Struktur Route Nuxt.js — Halaman Publik

```
pages/
├── index.vue                  → Landing page utama (/)
├── cara-kerja.vue             → Halaman cara kerja (/cara-kerja)
├── harga.vue                  → Halaman pricing (/harga)
├── faq.vue                    → Halaman FAQ (/faq)
├── login.vue                  → Login UMKM (/login)
├── register.vue               → Register UMKM (/register)
├── verify-email.vue           → Verifikasi email (/verify-email)
├── forgot-password.vue        → Lupa password
├── reset-password.vue         → Reset password
│
├── onboarding/
│   └── index.vue              → Wizard onboarding (/onboarding)
│
├── app/                       → Dashboard UMKM (protected)
│   ├── index.vue              → Overview (/app)
│   ├── chatbot.vue            → Config chatbot
│   ├── knowledge.vue          → Knowledge base
│   ├── whatsapp.vue           → Connect WA
│   ├── conversations.vue      → Riwayat chat
│   ├── usage.vue              → Usage & quota
│   ├── invoices/
│   │   ├── index.vue          → List invoice
│   │   └── [id].vue           → Detail invoice
│   └── profile.vue            → Profil akun
│
└── admin/                     → Dashboard admin hub (protected)
    ├── login.vue              → Login admin
    ├── index.vue              → Overview semua tenant
    ├── clients/
    │   ├── index.vue          → List semua UMKM
    │   ├── new.vue            → Tambah UMKM baru
    │   └── [id]/
    │       ├── index.vue      → Detail UMKM
    │       ├── chatbot.vue
    │       ├── knowledge.vue
    │       ├── whatsapp.vue
    │       ├── conversations.vue
    │       ├── usage.vue
    │       └── invoices.vue
    └── revenue.vue            → Revenue report
```

---

### Komponen Reusable untuk Halaman Publik

```
components/public/
├── PublicNavbar.vue           → Navbar dengan link + CTA button
├── PublicFooter.vue           → Footer dengan link & kontak
├── HeroSection.vue            → Hero utama dengan headline & CTA
├── FeatureCard.vue            → Kartu fitur (icon + judul + deskripsi)
├── PricingCard.vue            → Kartu plan (Free/Basic/Pro)
├── PricingTable.vue           → Tabel perbandingan fitur lengkap
├── PricingCalculator.vue      → Kalkulator estimasi biaya interaktif
├── HowItWorkStep.vue          → Step di halaman cara kerja
├── FaqAccordion.vue           → Accordion untuk FAQ
├── TestimonialCard.vue        → Kartu testimoni UMKM
└── ChatDemoWidget.vue         → Demo widget chat interaktif (opsional)
```

---

### SEO & Meta — Halaman Publik

Setiap halaman publik perlu `useHead()` di Nuxt dengan:

```typescript
// Contoh untuk landing page
useHead({
  title: '[Nama Produk] — Chatbot AI untuk UMKM Indonesia',
  meta: [
    { name: 'description', content: 'Otomatis balas pesan WhatsApp dan website 24 jam. Setup 5 menit, mulai gratis.' },
    { property: 'og:title', content: '...' },
    { property: 'og:description', content: '...' },
    { property: 'og:image', content: '/og-image.png' },  // 1200x630px
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
})
```

Target keyword per halaman:
- `/` → "chatbot WhatsApp UMKM", "chatbot otomatis toko online"
- `/cara-kerja` → "cara buat chatbot WhatsApp", "chatbot AI toko"
- `/harga` → "harga chatbot WhatsApp", "chatbot murah untuk UMKM"
- `/faq` → long-tail questions dari UMKM

---

### Catatan Desain & UX

- **Brand name belum ditentukan** — semua copy menggunakan placeholder `[Nama Produk]`. Ganti setelah nama diputuskan.
- **Warna & identitas visual** — belum ditentukan. Disarankan pakai warna yang relate ke WhatsApp (hijau) atau nuansa modern & terpercaya.
- **Bahasa** — Indonesia kasual. Hindari kata "solusi", "inovatif", "terdepan". Pakai kata yang spesifik dan konkret.
- **Mobile-first** — mayoritas UMKM akses dari HP. Semua halaman harus responsif sempurna di layar 375px ke atas.
- **Page speed** — Nuxt SSG (static generation) untuk halaman publik agar load cepat dan SEO optimal. Dashboard tetap SSR/SPA.
- **Demo widget** — pertimbangkan tambahkan chatbot demo live di halaman `/cara-kerja` yang bisa dicoba tanpa daftar, menggunakan tenant demo "Toko Kue Laris Manis" dari seed data.

---



## Catatan Penting

### AI Provider
- Untuk **development & testing** → gunakan **Groq** (gratis, daftar di console.groq.com)
- Untuk **produksi** → upgrade ke **Claude API** atau **OpenAI** — tinggal ganti `.env`, kode tidak berubah
- Implementasi pakai **interface pattern** (`AIProvider`) agar mudah ganti provider kapanpun
- Groq model yang disarankan: `llama-3.3-70b-versatile` — paling bagus untuk Bahasa Indonesia di tier gratis

### WhatsApp (Baileys)
- Baileys adalah **unofficial API** — rawan banned jika digunakan abusif (spam, broadcast massal)
- Gunakan untuk **chatbot responsif**, bukan untuk kirim pesan massal/broadcast
- Setiap UMKM punya **session terpisah** di server, scan QR sekali saja
- Auth state disimpan ke DB (terenkripsi) agar tidak perlu scan ulang setelah restart
- Untuk skala produksi besar → pertimbangkan **WhatsApp Business API (WABA)** resmi via provider seperti Fonnte, Wablas, atau langsung ke Meta

### Keamanan
- API Key widget di-hash sebelum disimpan ke DB
- Session Baileys dienkripsi (AES-256) sebelum disimpan
- Rate limiting per API key: max 30 pesan/menit/client
- JWT untuk dashboard: access token 15 menit, refresh token 7 hari
- Semua input divalidasi dengan Zod sebelum diproses

### Multi-tenant Isolation
- Setiap query ke DB selalu di-filter dengan `client_id`
- Middleware `apikey.middleware.ts` inject `req.clientId` setelah validasi
- Knowledge base hanya bisa diakses oleh client pemiliknya

### Scaling ke Depan
- Baileys sessions bisa dipindah ke service terpisah jika load tinggi
- Knowledge base bisa ditambah vector search (pgvector) untuk RAG yang lebih akurat
- Bisa tambah provider AI lain (OpenAI, Gemini) dengan implementasi `AIProvider` interface
