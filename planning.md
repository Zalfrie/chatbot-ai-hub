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
12. [RAG + Vector Search (Fase 8)](#rag--vector-search-fase-8)
13. [Catatan Penting](#catatan-penting)

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

| Fase | Scope | Detail |
|---|---|---|
| **Fase 1** | Foundation | Setup project Node.js/TS, koneksi PostgreSQL + Redis, schema migration, CRUD client & chatbot |
| **Fase 2** | AI Chat | Integrasi Claude API, knowledge base injection, prompt builder, endpoint `/v1/chat/message` |
| **Fase 3** | WhatsApp | Integrasi Baileys, session management per client, QR code via WebSocket, incoming message handler |
| **Fase 4** | Dashboard | Nuxt.js admin dashboard, semua halaman manajemen, QR display realtime |
| **Fase 5** | Embed Widget | Vanilla TS widget, deploy widget.js, dokumentasi cara embed untuk UMKM |
| **Fase 6** | Unit Testing | Vitest setup, unit test semua layer, integration test endpoint, coverage minimal 70% |
| **Fase 7** | Hardening | Rate limiting, usage billing, error handling, monitoring (PM2 + log), security audit |
| **Fase 8** | RAG + Vector Search | pgvector setup, chunking, embedding service, vector search, import file, crawling URL, AI-assisted input |

---

## RAG + Vector Search (Fase 8)

> Implementasi Retrieval Augmented Generation menggunakan **Pinecone** (cloud vector database) — tidak perlu install apapun di lokal, cukup API key.

### Mengapa RAG?

| Kondisi | Tanpa RAG | Dengan RAG |
|---|---|---|
| Knowledge base kecil (< 50KB) | ✅ Cukup | ✅ Cukup |
| Knowledge base besar (ratusan produk) | ❌ Token boros, lambat | ✅ Efisien |
| Banyak UMKM sekaligus | ❌ Prompt membengkak | ✅ Hanya ambil yang relevan |
| Akurasi jawaban | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

### Arsitektur RAG dengan Pinecone

```
┌─────────────────────────────────────────────────────┐
│                   KNOWLEDGE INPUT                    │
│                                                      │
│  Manual / Upload File / Crawl URL / Paste Teks       │
│                      ↓                              │
│              Chunker Service                         │
│          (pecah jadi ~400 kata)                      │
│                      ↓                              │
│            Embedding Service                         │
│         (Gemini text-embedding-004)                  │
│                      ↓                              │
│  ┌────────────┐    ┌──────────────────────────┐     │
│  │ PostgreSQL │    │  Pinecone (Cloud Vector)  │     │
│  │ (metadata) │    │  (vector embeddings)      │     │
│  └────────────┘    └──────────────────────────┘     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   CHAT FLOW (RAG)                    │
│                                                      │
│  User tanya: "harga kue berapa?"                     │
│                      ↓                              │
│         Embed pertanyaan (Gemini)                    │
│                      ↓                              │
│      Vector Search di Pinecone                       │
│      (cari top 3 chunk paling mirip)                 │
│                      ↓                              │
│      Inject chunk relevan ke prompt                  │
│                      ↓                              │
│         AI jawab dengan akurat ✅                    │
└─────────────────────────────────────────────────────┘
```

---

### Setup Pinecone

#### 1. Daftar & Buat Index
```
1. Login ke app.pinecone.io
2. Create Index:
   - Name    : chatbot-hub
   - Model   : text-embedding-004 (Google)
   - Metric  : cosine
   - Dimension: 768
3. Copy API Key dari dashboard
```

#### 2. Environment Variables
```env
# .env
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=chatbot-hub
GEMINI_API_KEY=your_gemini_api_key    # untuk generate embedding (gratis)
```

#### 3. Install Library
```bash
npm install @pinecone-database/pinecone @google/generative-ai
npm install pdf-parse mammoth csv-parser cheerio
npm install node-cron
```

---

### Perubahan Database PostgreSQL

Tidak perlu pgvector! Hanya tambah kolom untuk tracking:

```sql
-- Tambah kolom di knowledge_bases (tracking status embedding)
ALTER TABLE knowledge_bases
ADD COLUMN is_embedded   BOOLEAN DEFAULT FALSE,
ADD COLUMN embedded_at   TIMESTAMPTZ NULL,
ADD COLUMN chunk_count   SMALLINT DEFAULT 0;

-- Tambah tabel untuk tracking sumber crawl
CREATE TABLE knowledge_sources (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  knowledge_id  BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  source_type   VARCHAR(20) CHECK (source_type IN ('manual', 'file', 'url', 'text')),
  source_url    VARCHAR(500) NULL,        -- jika dari crawling
  last_content  TEXT NULL,               -- untuk deteksi perubahan saat re-crawl
  last_crawled_at TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Struktur Direktori Tambahan

```
src/
├── modules/
│   └── knowledge/
│       ├── knowledge.routes.ts       ← tambah endpoint import & crawl
│       ├── knowledge.controller.ts   ← tambah handler baru
│       ├── knowledge.repository.ts   ← tambah updateEmbedStatus()
│       ├── chunker.service.ts        ← BARU: pecah teks jadi chunks
│       ├── crawler.service.ts        ← BARU: crawl URL & parse file
│       └── importer.service.ts       ← BARU: handle upload file
│
├── providers/
│   └── ai/
│       ├── ai.interface.ts           ← tidak berubah
│       ├── claude.provider.ts        ← tidak berubah
│       ├── groq.provider.ts          ← tidak berubah
│       ├── embedding.service.ts      ← BARU: Gemini embedding
│       └── pinecone.service.ts       ← BARU: vector store & search
│
└── jobs/
    └── reindex.job.ts                ← BARU: auto re-crawl scheduler
```

---

### Core Logic RAG

#### 1. Embedding Service (Gemini — Gratis)

```typescript
// src/providers/ai/embedding.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async embed(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({
      model: 'text-embedding-004',
    });
    const result = await model.embedContent(text);
    return result.embedding.values; // 768 dimensi
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

---

#### 2. Pinecone Service — Simpan & Cari Vector

```typescript
// src/providers/ai/pinecone.service.ts
import { Pinecone } from '@pinecone-database/pinecone';

export class PineconeService {
  private client: Pinecone;
  private indexName: string;

  constructor() {
    this.client = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    this.indexName = process.env.PINECONE_INDEX!;
  }

  private get index() {
    return this.client.index(this.indexName);
  }

  // Simpan chunks ke Pinecone
  async upsertChunks(params: {
    clientId: number;
    knowledgeId: number;
    chunks: { content: string; embedding: number[]; chunkIndex: number }[];
  }) {
    const vectors = params.chunks.map((chunk, i) => ({
      id: `client_${params.clientId}_kb_${params.knowledgeId}_chunk_${chunk.chunkIndex}`,
      values: chunk.embedding,
      metadata: {
        clientId: params.clientId,
        knowledgeId: params.knowledgeId,
        content: chunk.content,        // simpan konten di metadata
        chunkIndex: chunk.chunkIndex,
      },
    }));

    await this.index.upsert(vectors);
  }

  // Cari chunk paling relevan berdasarkan query
  async search(params: {
    clientId: number;
    queryEmbedding: number[];
    topK?: number;
  }): Promise<{ content: string; score: number }[]> {
    const result = await this.index.query({
      vector: params.queryEmbedding,
      topK: params.topK ?? 3,
      filter: { clientId: params.clientId },  // isolasi per UMKM
      includeMetadata: true,
    });

    return result.matches
      .filter(m => (m.score ?? 0) > 0.7)     // threshold similarity
      .map(m => ({
        content: m.metadata?.content as string,
        score: m.score ?? 0,
      }));
  }

  // Hapus semua chunk milik 1 knowledge (saat update)
  async deleteByKnowledge(clientId: number, knowledgeId: number) {
    await this.index.deleteMany({
      filter: { clientId, knowledgeId },
    });
  }
}
```

---

#### 3. Chunker Service

```typescript
// src/modules/knowledge/chunker.service.ts

export class ChunkerService {
  chunk(text: string, chunkSize = 400, overlap = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    let i = 0;
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk);
      i += chunkSize - overlap;
    }

    return chunks.filter(c => c.trim().length > 50);
  }
}
```

---

#### 4. Update Chat Service — Minimal Change

```typescript
// src/modules/chat/chat.service.ts
// Hanya bagian load knowledge yang berubah:

// SEBELUMNYA (tanpa RAG):
const knowledge = await knowledgeRepo.findActiveByClient(params.clientId);

// SESUDAH RAG:
const queryEmbedding = await embeddingService.embed(params.userMessage);
const relevantChunks = await pineconeService.search({
  clientId: params.clientId,
  queryEmbedding,
  topK: 3,
});

// Sisanya SAMA PERSIS ✅
// buildSystemPrompt terima relevantChunks instead of all knowledge
```

---

#### 5. Flow Saat UMKM Simpan Knowledge Baru

```typescript
// src/modules/knowledge/knowledge.controller.ts

async createKnowledge(clientId: number, data: CreateKnowledgeDto) {
  // 1. Simpan ke PostgreSQL seperti biasa
  const knowledge = await knowledgeRepo.create(clientId, data);

  // 2. Chunking
  const chunks = chunkerService.chunk(data.content);

  // 3. Generate embedding (Gemini — gratis)
  const embeddings = await embeddingService.embedBatch(chunks);

  // 4. Simpan ke Pinecone
  await pineconeService.upsertChunks({
    clientId,
    knowledgeId: knowledge.id,
    chunks: chunks.map((content, i) => ({
      content,
      embedding: embeddings[i],
      chunkIndex: i,
    })),
  });

  // 5. Update status di PostgreSQL
  await knowledgeRepo.updateEmbedStatus(knowledge.id, chunks.length);

  return knowledge;
}
```

---

### Cara Import Knowledge (Selain Manual)

#### Upload File (PDF / DOCX / CSV)

```typescript
// src/modules/knowledge/importer.service.ts
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export class ImporterService {
  async fromPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
  }

  async fromDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
```

#### Crawling URL Website UMKM

```typescript
// src/modules/knowledge/crawler.service.ts
import * as cheerio from 'cheerio';

export class CrawlerService {
  async crawlUrl(url: string): Promise<string> {
    const html = await fetch(url).then(r => r.text());
    const $ = cheerio.load(html);

    $('nav, footer, script, style, iframe, .ads').remove();

    return $('main, article, .content, body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```

#### AI-Assisted dari Teks Mentah (Caption IG, dll)

```typescript
async structureRawText(rawText: string): Promise<string> {
  const prompt = `
    Strukturkan teks mentah ini menjadi knowledge base yang rapi:
    "${rawText}"
    Format: nama info, detail, harga jika ada, kontak jika ada.
    Kembalikan hanya teks terstruktur tanpa penjelasan tambahan.
  `;
  const result = await aiProvider.chat({
    messages: [{ role: 'user', content: prompt }],
  });
  return result.content;
}
```

---

### Endpoint Baru (Fase 8)

```
POST   /api/clients/:id/knowledge/import/file     # Upload PDF/DOCX/CSV
POST   /api/clients/:id/knowledge/import/url      # Crawl dari URL
POST   /api/clients/:id/knowledge/import/text     # AI-assisted dari teks mentah
POST   /api/clients/:id/knowledge/reindex         # Re-generate semua embedding
GET    /api/clients/:id/knowledge/search?q=       # Test vector search (debug)
```

---

### Fase 8 di Terminal (Claude Code)

```
baca file planning.md section "RAG + Vector Search (Fase 8)", lalu implementasikan:
1. Install library: @pinecone-database/pinecone @google/generative-ai pdf-parse mammoth cheerio node-cron
2. Tambah migration: kolom is_embedded, embedded_at, chunk_count di knowledge_bases, dan tabel knowledge_sources
3. Buat embedding.service.ts menggunakan Gemini text-embedding-004
4. Buat pinecone.service.ts dengan fungsi upsertChunks, search, dan deleteByKnowledge
5. Buat chunker.service.ts dengan chunk size 400 kata dan overlap 50 kata
6. Buat crawler.service.ts menggunakan cheerio untuk crawl URL statis
7. Buat importer.service.ts untuk handle upload PDF dan DOCX
8. Update knowledge.controller.ts: saat create/update knowledge otomatis chunk + embed + upsert ke Pinecone
9. Update chat.service.ts: ganti findActiveByClient dengan embed query + pineconeService.search
10. Tambah endpoint import/file, import/url, import/text, dan reindex
11. Buat unit test untuk chunker.service dan pinecone.service (dengan mock)
```

### Mengapa RAG?

| Kondisi | Tanpa RAG | Dengan RAG |
|---|---|---|
| Knowledge base kecil (< 50KB) | ✅ Cukup | ✅ Cukup |
| Knowledge base besar (ratusan produk) | ❌ Token boros, lambat | ✅ Efisien |
| Banyak UMKM sekaligus | ❌ Prompt membengkak | ✅ Hanya ambil yang relevan |
| Akurasi jawaban | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

### Perubahan Database

```sql
-- 1. Aktifkan extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tambah kolom embedding ke knowledge_bases
ALTER TABLE knowledge_bases
ADD COLUMN embedding vector(768) NULL;     -- 768 dimensi untuk Gemini embedding
                                           -- ganti 1536 jika pakai OpenAI

-- 3. Tambah tabel chunks (pecahan knowledge untuk RAG)
CREATE TABLE knowledge_chunks (
  id            BIGSERIAL PRIMARY KEY,
  knowledge_id  BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chunk_index   SMALLINT NOT NULL,           -- urutan chunk dalam 1 knowledge
  content       TEXT NOT NULL,               -- isi chunk (max ~500 kata)
  embedding     vector(768) NOT NULL,        -- vector embedding chunk ini
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index untuk vector search (cosine similarity)
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_chunks_client ON knowledge_chunks(client_id);
```

---

### Library Baru yang Dibutuhkan

```
pgvector          — PostgreSQL vector extension client untuk Node.js
@google/generative-ai — Gemini embedding (gratis)
cheerio           — crawling website statis
playwright        — crawling website dinamis (JS-heavy)
pdf-parse         — parse PDF
mammoth           — parse DOCX
csv-parser        — parse CSV
node-cron         — jadwal auto re-crawl
```

---

### Struktur Direktori Tambahan

```
src/
├── modules/
│   └── knowledge/
│       ├── knowledge.routes.ts       ← tambah endpoint import & crawl
│       ├── knowledge.controller.ts   ← tambah handler baru
│       ├── knowledge.repository.ts   ← tambah findRelevantChunks()
│       ├── chunker.service.ts        ← BARU: pecah teks jadi chunks
│       ├── crawler.service.ts        ← BARU: crawl URL & parse file
│       └── importer.service.ts       ← BARU: handle upload file
│
├── providers/
│   └── ai/
│       ├── ai.interface.ts           ← tidak berubah
│       ├── claude.provider.ts        ← tidak berubah
│       ├── groq.provider.ts          ← tidak berubah
│       └── embedding.service.ts      ← BARU: generate & manage embedding
```

---

### Core Logic RAG

#### 1. Chunker Service — Pecah Teks Jadi Potongan Kecil

```typescript
// src/modules/knowledge/chunker.service.ts

export class ChunkerService {
  // Pecah teks panjang jadi chunks ~400 kata dengan overlap 50 kata
  chunk(text: string, chunkSize = 400, overlap = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    let i = 0;
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk);
      i += chunkSize - overlap; // overlap agar konteks tidak putus
    }

    return chunks.filter(c => c.trim().length > 50); // buang chunk terlalu pendek
  }
}
```

**Kenapa perlu chunking?**
```
Knowledge panjang (1000 kata)
         ↓
Chunk 1: kata 1-400     → embedding #1
Chunk 2: kata 350-750   → embedding #2  (overlap 50 kata)
Chunk 3: kata 700-1000  → embedding #3

User tanya → cari chunk paling relevan → inject hanya itu ke prompt
```

---

#### 2. Embedding Service — Generate Vector dari Teks

```typescript
// src/providers/ai/embedding.service.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  // Generate embedding untuk satu teks
  async embed(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({
      model: 'text-embedding-004',
    });

    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  // Generate embedding untuk banyak teks sekaligus (batch)
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map(text => this.embed(text))
    );
    return results;
  }
}
```

---

#### 3. Knowledge Repository — Vector Search

```typescript
// src/modules/knowledge/knowledge.repository.ts

// Fungsi BARU: cari chunk paling relevan berdasarkan pertanyaan user
async findRelevantChunks(
  clientId: number,
  queryEmbedding: number[],
  topK = 3
): Promise<KnowledgeChunk[]> {

  // Cosine similarity search via pgvector
  const result = await db.query(`
    SELECT
      kc.content,
      kc.chunk_index,
      kb.title,
      1 - (kc.embedding <=> $1::vector) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_bases kb ON kb.id = kc.knowledge_id
    WHERE kc.client_id = $2
      AND 1 - (kc.embedding <=> $1::vector) > 0.7  -- threshold similarity
    ORDER BY kc.embedding <=> $1::vector            -- order by closest
    LIMIT $3
  `, [JSON.stringify(queryEmbedding), clientId, topK]);

  return result.rows;
}
```

---

#### 4. Chat Service — Update untuk RAG

```typescript
// src/modules/chat/chat.service.ts
// Perubahan MINIMAL — hanya bagian load knowledge

// SEBELUMNYA (tanpa RAG):
const knowledge = await knowledgeRepo.findActiveByClient(params.clientId);

// SETELAH RAG:
const queryEmbedding = await embeddingService.embed(params.userMessage);
const knowledge = await knowledgeRepo.findRelevantChunks(
  params.clientId,
  queryEmbedding,
  3  // ambil top 3 chunk paling relevan
);

// Sisanya SAMA PERSIS — tidak ada perubahan lain ✅
```

---

#### 5. Flow Saat UMKM Input/Update Knowledge

```typescript
// src/modules/knowledge/knowledge.controller.ts
// Saat UMKM simpan knowledge baru:

async createKnowledge(clientId: number, data: CreateKnowledgeDto) {
  // 1. Simpan knowledge ke DB seperti biasa
  const knowledge = await knowledgeRepo.create(clientId, data);

  // 2. Pecah konten jadi chunks
  const chunks = chunkerService.chunk(data.content);

  // 3. Generate embedding untuk semua chunks (batch)
  const embeddings = await embeddingService.embedBatch(chunks);

  // 4. Simpan chunks + embedding ke DB
  await knowledgeRepo.saveChunks(
    knowledge.id,
    clientId,
    chunks.map((content, i) => ({
      content,
      chunkIndex: i,
      embedding: embeddings[i],
    }))
  );

  return knowledge;
}
```

---

### Cara Import Knowledge (Selain Manual)

#### Upload File (PDF / DOCX / CSV)

```typescript
// src/modules/knowledge/importer.service.ts

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import csv from 'csv-parser';

export class ImporterService {
  async fromPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
  }

  async fromDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  async fromCsv(buffer: Buffer): Promise<string> {
    // Ubah CSV jadi teks terstruktur untuk knowledge base
    return new Promise((resolve) => {
      const rows: string[] = [];
      // parse CSV → format jadi Q&A atau daftar produk
      resolve(rows.join('\n'));
    });
  }
}
```

#### Crawling URL Website UMKM

```typescript
// src/modules/knowledge/crawler.service.ts

import * as cheerio from 'cheerio';

export class CrawlerService {
  async crawlUrl(url: string): Promise<string> {
    const html = await fetch(url).then(r => r.text());
    const $ = cheerio.load(html);

    // Hapus elemen tidak relevan
    $('nav, footer, script, style, iframe, .ads').remove();

    // Ambil konten utama
    const content = $('main, article, .content, body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    return content;
  }

  // Crawl banyak halaman sekaligus
  async crawlMultiple(urls: string[]): Promise<string> {
    const contents = await Promise.all(
      urls.map(url => this.crawlUrl(url))
    );
    return contents.join('\n\n');
  }
}
```

#### AI-Assisted Input (Paste dari IG/Caption)

```typescript
// UMKM paste teks acak dari caption Instagram/sosmed
// AI strukturkan jadi knowledge base yang rapi

async structureRawText(rawText: string, clientId: number): Promise<string> {
  const prompt = `
    Berikut adalah teks mentah dari informasi toko UMKM:
    "${rawText}"

    Strukturkan menjadi knowledge base yang rapi dalam format:
    - Nama/Jenis informasi
    - Detail lengkap
    - Harga jika ada
    - Kontak jika ada

    Hanya kembalikan teks terstruktur, tanpa penjelasan tambahan.
  `;

  const result = await aiProvider.chat({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  });

  return result.content;
}
```

---

### Endpoint Baru (Fase 8)

```
# Knowledge Base — tambahan untuk RAG
POST   /api/clients/:id/knowledge/import/file     # Upload PDF/DOCX/CSV
POST   /api/clients/:id/knowledge/import/url      # Crawl dari URL
POST   /api/clients/:id/knowledge/import/text     # AI-assisted dari teks mentah
POST   /api/clients/:id/knowledge/reindex         # Re-generate semua embedding
GET    /api/clients/:id/knowledge/search?q=       # Test vector search (debug)
```

---

### Auto Re-index Scheduler

```typescript
// src/jobs/reindex.job.ts
import cron from 'node-cron';

// Jalankan setiap hari jam 02.00 dini hari
// Re-crawl URL yang terdaftar & update embedding jika konten berubah
cron.schedule('0 2 * * *', async () => {
  const clients = await clientRepo.findAllActive();

  for (const client of clients) {
    const crawlSources = await knowledgeRepo.findCrawlSources(client.id);

    for (const source of crawlSources) {
      const newContent = await crawlerService.crawlUrl(source.url);

      if (newContent !== source.lastContent) {
        // Konten berubah → update knowledge + re-generate embedding
        await knowledgeService.updateAndReindex(source.id, newContent);
      }
    }
  }
});
```

---

### Perbandingan Sebelum & Sesudah RAG

```
SEBELUM RAG:
User: "harga kue berapa?"
→ Inject SEMUA knowledge (500+ baris) ke prompt
→ Token besar, mahal, lambat

SESUDAH RAG:
User: "harga kue berapa?"
→ Embed pertanyaan → vector search
→ Ambil TOP 3 chunk paling relevan saja
→ "Kue 18cm Rp185rb, 22cm Rp285rb, 26cm Rp385rb"
→ Token hemat 90%, lebih cepat, lebih akurat ✅
```

---

### Fase 8 di Terminal (Claude Code)

```
baca file planning.md, lalu kerjakan fase 8 RAG + Vector Search:
1. Install pgvector extension di PostgreSQL
2. Jalankan migration: tambah kolom embedding di knowledge_bases dan buat tabel knowledge_chunks dengan index ivfflat
3. Buat embedding.service.ts menggunakan Gemini text-embedding-004 (gratis)
4. Buat chunker.service.ts dengan chunk size 400 kata dan overlap 50 kata
5. Buat crawler.service.ts menggunakan cheerio untuk crawl URL
6. Buat importer.service.ts untuk handle upload PDF, DOCX, dan CSV
7. Update knowledge.repository.ts: tambah fungsi saveChunks dan findRelevantChunks dengan cosine similarity
8. Update knowledge.controller.ts: saat create/update knowledge otomatis generate chunks dan embedding
9. Update chat.service.ts: ganti findActiveByClient dengan findRelevantChunks via embedding
10. Tambah endpoint POST /import/file, /import/url, /import/text, dan /reindex
11. Buat unit test untuk chunker.service dan embedding.service
```



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
