// ── PostgreSQL support ────────────────────────────────────────────────────────
// If DATABASE_URL is set, initialize PostgreSQL schema and re-export the pg adapter.
// Routes that need async pg queries import from './db-postgres.cjs' directly.
if (process.env.DATABASE_URL) {
    const pg = require('./db-postgres.cjs');
    pg.initSchema().catch(err => {
        console.error('[PostgreSQL] Schema init failed:', err.message);
        process.exit(1);
    });
    module.exports = pg; // Export pg adapter — all consumers must use async/await
    return; // Skip SQLite setup below
}

const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'yourgbedu.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    duration TEXT NOT NULL,
    description TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    artist TEXT,
    tags TEXT, -- JSON array
    audio_url TEXT,
    story TEXT
  );


  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    song_title TEXT,
    genre TEXT,
    mood TEXT,
    tempo INTEGER,
    occasion TEXT,
    occasion_detail TEXT,
    story TEXT,
    status TEXT DEFAULT 'in_production',
    created_at TEXT NOT NULL,
    delivery_date TEXT NOT NULL,
    stripe_session_id TEXT,
    paystack_reference TEXT,
    amount INTEGER DEFAULT 30000
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT UNIQUE NOT NULL,
    code_preview TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    disabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    used_at TEXT,
    used_order_id TEXT
  );

  CREATE TABLE IF NOT EXISTS song_generations (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    current_stage TEXT,
    pipeline_form TEXT,
    derived_fields TEXT,
    state TEXT,
    final_output TEXT,
    llm_usage TEXT,
    stage_status TEXT,
    stage_comments TEXT,
    error TEXT,
    resume_attempts INTEGER DEFAULT 0,
    run_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_song_generations_order_id ON song_generations(order_id);
  CREATE INDEX IF NOT EXISTS idx_song_generations_status ON song_generations(status);
`);

// Safe migrations for new columns
try { db.exec("ALTER TABLE orders ADD COLUMN recipient_type TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN occasion_detail TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN sender_name TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN voice_gender TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN special_qualities TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN favorite_memories TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN special_message TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN customer_email TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN ai_brief TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN promo_code_id TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN promo_code_preview TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN promo_discount_percent INTEGER"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN original_amount INTEGER"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN discounted_amount INTEGER"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN recipient_name TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN final_song_url TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN final_song_title TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN delivered_at TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN rating INTEGER"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE orders ADD COLUMN tracking_token TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE songs ADD COLUMN sort_order INTEGER DEFAULT 99"); } catch { /* already migrated */ }

// Subscribers — email-capture popup list
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT,
    converted_order_id TEXT,
    last_emailed_at TEXT
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)'); } catch { /* best effort index */ }

// Seed songs if table is empty
const songCount = db.prepare('SELECT COUNT(*) as count FROM songs').get();

if (songCount.count === 0) {
  const insertSong = db.prepare(`
    INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
    VALUES (@title, @genre, @duration, @description, @cover_url, @artist, @tags, @audio_url, @story, @sort_order)
  `);

  const seedSongs = [
    {
      title: 'Anniversary',
      genre: 'Afro-Beats',
      duration: '3:45',
      description: '"A celebration of love and togetherness — crafted for a special couple whose bond only grows stronger with every passing year."',
      cover_url: '/musics/Cover%20Phtotos/Anniversary_Cover.jpg',
      artist: 'A Special Couple',
      tags: JSON.stringify(['Anniversary', 'Love', 'Celebration']),
      audio_url: '/musics/Anniversary.mp3',
      story: "An Afro-Beats track crafted to celebrate a couple's love and lasting bond.",
      sort_order: 1,
    },
    {
      title: 'Valentine',
      genre: 'Afro-R&B',
      duration: '2:30',
      description: '"A song to celebrate our love and all the wonderful moments we share."',
      cover_url: '/musics/Cover%20Phtotos/valentine.jpg',
      artist: 'Lovers',
      tags: JSON.stringify(['Valentine', 'Romance']),
      audio_url: '/musics/Valentine.mp3',
      story: 'A perfectly crafted pop electronic song dedicated to an amazing valentine.',
      sort_order: 2,
    },
    {
      title: 'Like Roses (You Are Your Name)',
      genre: 'R&B',
      duration: '4:03',
      description: '"We met at a coffee shop on a rainy Tuesday. I spilled my latte, he laughed, and now every moment feels like roses blooming."',
      cover_url: '/musics/Cover%20Phtotos/LikeRoses_Cover.jpg',
      artist: 'First Love',
      tags: JSON.stringify(['First Date', 'Love']),
      audio_url: '/musics/Like Roses ( You Are Your Name).mp3',
      story: 'A first date love story turned into a romantic R&B track.',
      sort_order: 4,
    },
    {
      title: "Mummy's 60th Birthday",
      genre: 'Afro-Beats',
      duration: '3:29',
      description: '"A 60th birthday tribute — a joyful Afro-Beats celebration of a mother\'s love, life, and the legacy she has built."',
      cover_url: '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg',
      artist: 'The Family',
      tags: JSON.stringify(['Birthday', 'Celebration', 'Mother']),
      audio_url: "/musics/Mummy's 60th Birthday.mp3",
      story: "A heartfelt Afro-Beats track celebrating a mother's 60th birthday milestone.",
      sort_order: 3,
    },
    {
      title: 'Mimi (Give Me Wealth)',
      genre: 'Afro-Beats',
      duration: '1:47',
      description: '"For her milestone birthday, we wanted to capture her radiant energy, her love for life, and the joy she brings to everyone around her."',
      cover_url: '/musics/Cover%20Phtotos/Mimi_Cover.jpg',
      artist: 'The Family',
      tags: JSON.stringify(['Birthday', 'Celebration']),
      audio_url: '/musics/Mimi (Give Me Wealth).mp3',
      story: 'A birthday celebration song full of Afrobeats energy.',
      sort_order: 5,
    },
  ];

  const insertMany = db.transaction((songs) => {
    for (const song of songs) {
      insertSong.run(song);
    }
  });

  insertMany(seedSongs);
  console.log('✅ Seeded 4 songs into database');
}

// ── Live data migrations (run on every startup to fix existing databases) ──

// Normalize customer_email so case-insensitive lookups (auth magic links,
// subscriber → order linking) match consistently across mixed-case historical data.
try {
    db.prepare("UPDATE orders SET customer_email = LOWER(TRIM(customer_email)) WHERE customer_email IS NOT NULL AND customer_email != LOWER(TRIM(customer_email))").run();
} catch { /* best effort cleanup */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON orders(LOWER(TRIM(customer_email)))'); } catch { /* best effort */ }


// Remove Baby Steps placeholder
try { db.prepare("DELETE FROM songs WHERE title = 'Baby Steps'").run(); } catch { /* best effort cleanup */ }

// Fix Mimi audio URL typo
try {
  db.prepare("UPDATE songs SET audio_url = '/musics/Mimi (Give Me Wealth).mp3' WHERE title LIKE 'Mimi%' AND audio_url LIKE '%\"%'").run();
} catch { /* best effort cleanup */ }

// Fix Like Roses genre to R&B
try {
  db.prepare("UPDATE songs SET genre = 'R&B' WHERE title = 'Like Roses (You Are Your Name)' AND genre != 'R&B'").run();
} catch { /* best effort cleanup */ }

// Add Anniversary if it doesn't exist yet
try {
  const exists = db.prepare("SELECT COUNT(*) as count FROM songs WHERE title = 'Anniversary'").get();
  if (exists.count === 0) {
    db.prepare(`
      INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Anniversary', 'Afro-Beats', '3:45',
      '"A celebration of love and togetherness — crafted for a special couple whose bond only grows stronger with every passing year."',
      '/musics/Cover%20Phtotos/Anniversary_Cover.jpg',
      'A Special Couple',
      JSON.stringify(['Anniversary', 'Love', 'Celebration']),
      '/musics/Anniversary.mp3',
      "An Afro-Beats track crafted to celebrate a couple's love and lasting bond.",
      1
    );
    console.log('✅ Added Anniversary to catalogue');
  }
} catch { /* best effort cleanup */ }

// Update cover photos for all songs
try {
  db.prepare("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/Anniversary_Cover.jpg' WHERE title = 'Anniversary'").run();
  db.prepare("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/valentine.jpg' WHERE title = 'Valentine'").run();
  db.prepare("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/LikeRoses_Cover.jpg' WHERE title = 'Like Roses (You Are Your Name)'").run();
  db.prepare("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/Mimi_Cover.jpg' WHERE title = 'Mimi (Give Me Wealth)'").run();
  db.prepare("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg' WHERE title = \"Mummy's 60th Birthday\"").run();
} catch { /* best effort cleanup */ }

// Add Mummy's 60th Birthday if it doesn't exist yet
try {
  const exists = db.prepare("SELECT COUNT(*) as count FROM songs WHERE title = \"Mummy's 60th Birthday\"").get();
  if (exists.count === 0) {
    db.prepare(`
      INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Mummy's 60th Birthday", 'Afro-Beats', '3:29',
      '"A 60th birthday tribute — a joyful Afro-Beats celebration of a mother\'s love, life, and the legacy she has built."',
      '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg',
      'The Family',
      JSON.stringify(['Birthday', 'Celebration', 'Mother']),
      "/musics/Mummy's 60th Birthday.mp3",
      "A heartfelt Afro-Beats track celebrating a mother's 60th birthday milestone.",
      3
    );
    console.log("✅ Added Mummy's 60th Birthday to catalogue");
  }
} catch { /* best effort cleanup */ }

// Set sort_order for all songs
try {
  db.prepare("UPDATE songs SET sort_order = 1 WHERE title = 'Anniversary'").run();
  db.prepare("UPDATE songs SET sort_order = 2 WHERE title = 'Valentine'").run();
  db.prepare("UPDATE songs SET sort_order = 3 WHERE title = \"Mummy's 60th Birthday\"").run();
  db.prepare("UPDATE songs SET sort_order = 4 WHERE title = 'Like Roses (You Are Your Name)'").run();
  db.prepare("UPDATE songs SET sort_order = 5 WHERE title = 'Mimi (Give Me Wealth)'").run();
} catch { /* best effort cleanup */ }

// ── Indexes for hot query paths ───────────────────────────────────────────────
try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email)'); } catch { /* best effort index */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_paystack_reference ON orders(paystack_reference)'); } catch { /* best effort index */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripe_session_id)'); } catch { /* best effort index */ }
try {
  const missingTokens = db.prepare("SELECT id FROM orders WHERE tracking_token IS NULL OR tracking_token = ''").all();
  const updateToken = db.prepare('UPDATE orders SET tracking_token = ? WHERE id = ?');
  const backfill = db.transaction((rows) => {
    for (const row of rows) updateToken.run(crypto.randomBytes(16).toString('hex'), row.id);
  });
  backfill(missingTokens);
} catch { /* best effort token backfill */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token)'); } catch { /* best effort index */ }
try { db.exec("ALTER TABLE song_generations ADD COLUMN final_output TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE song_generations ADD COLUMN llm_usage TEXT"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE song_generations ADD COLUMN resume_attempts INTEGER DEFAULT 0"); } catch { /* already migrated */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_promo_codes_code_hash ON promo_codes(code_hash)'); } catch { /* best effort index */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_promo_codes_used_order_id ON promo_codes(used_order_id)'); } catch { /* best effort index */ }

// ── JWT revocation table ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti      TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
`);

// Prune expired revoked tokens on startup
try {
  db.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").run(new Date().toISOString());
} catch { /* best effort cleanup */ }

// Prune again every 6 hours so the table doesn't grow unbounded between restarts.
// .unref() prevents this timer from keeping the process alive on graceful shutdown.
setInterval(() => {
  try {
    db.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").run(new Date().toISOString());
  } catch { /* best effort cleanup */ }
}, 6 * 60 * 60 * 1000).unref();

module.exports = db;
