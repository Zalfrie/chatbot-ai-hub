import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USER = 'postgres',
  DB_PASSWORD = 'admin',
  DB_NAME = 'chatbot_hub',
  DATABASE_URL,
} = process.env;

const connectionString = DATABASE_URL
  ?? `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function seed() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('🌱 Starting seed...');

    // Enable extensions
    await db.execute(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.execute(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // Create updated_at trigger function
    await db.execute(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create triggers for updated_at
    for (const [table, triggerName] of [
      ['clients', 'trg_clients_updated'],
      ['chatbots', 'trg_chatbots_updated'],
      ['knowledge_bases', 'trg_knowledge_updated'],
    ] as [string, string][]) {
      await db.execute(`
        DROP TRIGGER IF EXISTS ${triggerName} ON ${table};
        CREATE TRIGGER ${triggerName}
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
      `);
    }

    // Seed superadmin — password di-hash otomatis saat seed dijalankan
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
    const adminHash = await bcrypt.hash(adminPassword, 10);
    await db.execute(`
      INSERT INTO admin_users (name, email, password_hash, role)
      VALUES ('Super Admin', 'admin@hub.com', '${adminHash}', 'superadmin')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `);

    // Seed demo client: Toko Kue Laris Manis
    await db.execute(`
      INSERT INTO clients (name, slug, email, api_key, plan, is_active)
      VALUES ('Toko Kue Laris Manis', 'toko-kue-laris-manis', 'larismanis@gmail.com', 'ck_laris_manis_demo_key_2024', 'basic', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    // Seed chatbot config
    await db.execute(`
      INSERT INTO chatbots (client_id, name, system_prompt, welcome_message, language, ai_provider, ai_model, temperature, channel, is_active)
      SELECT
        c.id,
        'Kiki - CS Toko Kue Laris Manis',
        'Kamu adalah Kiki, customer service dari Toko Kue Laris Manis yang ramah dan hangat.
Kamu berbicara seperti teman yang menyenangkan — tidak kaku, tidak terlalu formal, tapi tetap sopan.
Sesekali pakai kata seperti "yuk", "kak", "lho", "dong", "nih" agar terasa natural.
Kamu suka rekomendasikan produk sesuai kebutuhan pelanggan, dan selalu semangat kalau ngomongin kue!
Kalau ada pertanyaan yang tidak kamu tahu, jujur aja dan arahkan ke admin: 0812-3456-7890.',
        'Haii kak! 👋 Selamat datang di Toko Kue Laris Manis~ Aku Kiki, siap bantu kakak hari ini! 🎂
Mau cari kue buat acara spesial, atau sekedar pengen tau produk kita? Tanya aja yuk! 😊',
        'id', 'groq', 'llama-3.3-70b-versatile', 0.85, 'both', true
      FROM clients c WHERE c.slug = 'toko-kue-laris-manis'
      ON CONFLICT DO NOTHING
    `);

    // Seed knowledge base entries
    const knowledgeEntries = [
      {
        title: 'Profil Toko Kue Laris Manis',
        content: `Toko Kue Laris Manis adalah toko kue rumahan yang berdiri sejak 2018 di Bandung.
Kami menyediakan berbagai kue custom untuk berbagai acara: ulang tahun, pernikahan, wisuda, dan acara kantor.
Semua kue dibuat fresh to order tanpa bahan pengawet.
Lokasi: Jl. Kopo Permai No. 45, Bandung.
Jam operasional: Senin-Sabtu pukul 08.00-20.00 WIB, Minggu 09.00-17.00 WIB.
Kontak admin: 0812-3456-7890 (WhatsApp).`,
        category: 'profil',
        priority: 10,
      },
      {
        title: 'Daftar Produk dan Harga',
        content: `KUE ULANG TAHUN:
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
Fresh fruit, Fondant custom, Buttercream, Chocolate ganache, Whipped cream.`,
        category: 'produk',
        priority: 9,
      },
      {
        title: 'Cara Order dan Ketentuan',
        content: `CARA ORDER:
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
- COD tersedia untuk area Bandung kota (order minimal Rp 200.000)`,
        category: 'order',
        priority: 8,
      },
      {
        title: 'Informasi Pengiriman',
        content: `PENGIRIMAN:
- Area Bandung kota: Rp 15.000 - Rp 30.000 (tergantung jarak)
- Luar Bandung: bisa via JNE/J&T khusus untuk produk kering (brownies, cookies)
- Kue custom (kue basah) TIDAK bisa dikirim via ekspedisi, hanya antar kota Bandung

PENGAMBILAN SENDIRI (Pick Up):
- Gratis, bisa langsung ke toko
- Lokasi: Jl. Kopo Permai No. 45, Bandung
- Parkir tersedia

CATATAN PENGIRIMAN KUE:
Kue custom sebaiknya diambil maksimal 2 jam sebelum acara agar tetap segar.
Simpan di kulkas jika belum digunakan, tahan 2 hari.`,
        category: 'pengiriman',
        priority: 7,
      },
      {
        title: 'Pertanyaan yang Sering Ditanya (FAQ)',
        content: `T: Apakah bisa request desain sendiri?
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
J: Bisa! Cek Instagram kami @larismaniscake atau minta kakak kirimkan foto langsung di chat ini.`,
        category: 'faq',
        priority: 6,
      },
    ];

    for (const entry of knowledgeEntries) {
      await db.execute(`
        INSERT INTO knowledge_bases (client_id, title, content, category, priority)
        SELECT c.id, '${entry.title.replace(/'/g, "''")}', '${entry.content.replace(/'/g, "''")}', '${entry.category}', ${entry.priority}
        FROM clients c WHERE c.slug = 'toko-kue-laris-manis'
        ON CONFLICT DO NOTHING
      `);
    }

    // Seed demo tool: cek_stok_kue for Toko Kue Laris Manis
    await db.execute(`
      INSERT INTO tenant_tools (client_id, name, description, parameters_schema,
        webhook_url, http_method, timeout_ms, is_active)
      SELECT
        c.id,
        'cek_stok_kue',
        'Cek ketersediaan stok kue berdasarkan nama produk. Gunakan tool ini ketika pelanggan bertanya apakah produk tersedia atau berapa sisa stoknya.',
        '{
          "type": "object",
          "properties": {
            "nama_produk": {
              "type": "string",
              "description": "Nama kue yang ingin dicek stoknya"
            }
          },
          "required": ["nama_produk"]
        }',
        'https://webhook.site/replace-with-your-id',
        'POST',
        5000,
        TRUE
      FROM clients c WHERE c.slug = 'toko-kue-laris-manis'
      ON CONFLICT (client_id, name) DO NOTHING
    `);

    console.log('   📌 Demo tool: cek_stok_kue (update webhook_url in tenant_tools to test)');

    // Seed WA session (disconnected state)
    await db.execute(`
      INSERT INTO wa_sessions (client_id, wa_number, status)
      SELECT c.id, '6281234567890', 'disconnected'
      FROM clients c WHERE c.slug = 'toko-kue-laris-manis'
      ON CONFLICT (client_id) DO NOTHING
    `);

    console.log('✅ Seed completed!');
    console.log(`   📌 Admin: admin@hub.com / ${adminPassword}`);
    console.log('   📌 Demo client: toko-kue-laris-manis');
    console.log('   📌 Demo API key: ck_laris_manis_demo_key_2024');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
