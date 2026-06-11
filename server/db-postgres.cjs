/**
 * PostgreSQL database adapter for YourGbedu.
 * Used when DATABASE_URL is set in the environment (e.g. Railway Postgres add-on).
 *
 * Provides the same synchronous-style API as better-sqlite3 so the rest of the
 * codebase doesn't need to change. Internally we use a connection pool and
 * expose a thin wrapper that mirrors the SQLite `db.prepare().get/all/run()` API
 * by running queries synchronously via Deasync — or by providing an async-safe
 * wrapper. For simplicity, this module exports an adapter object used via
 * monkey-patching in db.cjs.
 *
 * NOTE: For a true async approach, each route would need to be fully async.
 * This adapter provides the interface; the actual async calls happen in the routes.
 */
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected pool error', err.message);
});

/**
 * Run a query and return all rows.
 * @param {string} text  - Parameterized SQL
 * @param {any[]}  params - Query parameters
 * @returns {Promise<any[]>}
 */
async function all(text, params = []) {
    const { rows } = await pool.query(text, params);
    return rows;
}

/**
 * Run a query and return the first row (or undefined).
 */
async function get(text, params = []) {
    const { rows } = await pool.query(text, params);
    return rows[0];
}

/**
 * Run a query (INSERT / UPDATE / DELETE) and return metadata.
 */
async function run(text, params = []) {
    const result = await pool.query(text, params);
    return { changes: result.rowCount };
}

/**
 * Execute a raw SQL string (no params). Used for DDL / migrations.
 */
async function exec(sql) {
    await pool.query(sql);
}

/**
 * Create all required tables in PostgreSQL.
 */
async function initSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS songs (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            genre TEXT NOT NULL,
            duration TEXT NOT NULL,
            description TEXT NOT NULL,
            cover_url TEXT NOT NULL,
            artist TEXT,
            tags TEXT,
            audio_url TEXT,
            story TEXT,
            sort_order INTEGER DEFAULT 99
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
            amount INTEGER DEFAULT 30000,
            recipient_type TEXT,
            recipient_name TEXT,
            sender_name TEXT,
            voice_gender TEXT,
            special_qualities TEXT,
            favorite_memories TEXT,
            special_message TEXT,
            customer_email TEXT,
            ai_brief TEXT,
            promo_code_id TEXT,
            promo_code_preview TEXT,
            promo_discount_percent INTEGER,
            original_amount INTEGER,
            discounted_amount INTEGER,
            final_song_url TEXT,
            final_song_title TEXT,
            delivered_at TEXT,
            rating INTEGER,
            tracking_token TEXT
        );

        CREATE TABLE IF NOT EXISTS subscribers (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            source TEXT,
            converted_order_id TEXT,
            last_emailed_at TEXT
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

        CREATE TABLE IF NOT EXISTS magic_links (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS revoked_tokens (
            jti TEXT PRIMARY KEY,
            expires_at TEXT NOT NULL
        );
    `);

    await pool.query('ALTER TABLE songs ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 99');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS occasion_detail TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_preview TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_percent INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS discounted_amount INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_song_url TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_song_title TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token TEXT');
    await pool.query('ALTER TABLE song_generations ADD COLUMN IF NOT EXISTS final_output TEXT');
    await pool.query('ALTER TABLE song_generations ADD COLUMN IF NOT EXISTS llm_usage TEXT');
    await pool.query('ALTER TABLE song_generations ADD COLUMN IF NOT EXISTS resume_attempts INTEGER DEFAULT 0');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_promo_codes_code_hash ON promo_codes(code_hash)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_promo_codes_used_order_id ON promo_codes(used_order_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)');
    const missingTokens = await pool.query("SELECT id FROM orders WHERE tracking_token IS NULL OR tracking_token = ''");
    for (const row of missingTokens.rows) {
        await pool.query('UPDATE orders SET tracking_token = $1 WHERE id = $2', [
            crypto.randomBytes(16).toString('hex'),
            row.id,
        ]);
    }
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token)');
    // Normalize historical customer_email casing so case-insensitive lookups always match.
    await pool.query("UPDATE orders SET customer_email = LOWER(TRIM(customer_email)) WHERE customer_email IS NOT NULL AND customer_email != LOWER(TRIM(customer_email))");
    await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON orders(LOWER(TRIM(customer_email)))');
    console.log('[PostgreSQL] Schema initialized');

    // sort_order is part of the catalogue ordering — added via ALTER for fresh dbs.
    await pool.query("ALTER TABLE songs ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 99");

    // Seed sample songs if the table is empty. Cover URLs and audio paths match
    // the SQLite seed exactly so the catalogue looks identical on both adapters.
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM songs');
    if (parseInt(rows[0].count, 10) === 0) {
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

        for (const song of seedSongs) {
            await pool.query(
                `INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [song.title, song.genre, song.duration, song.description, song.cover_url,
                 song.artist, song.tags, song.audio_url, song.story, song.sort_order]
            );
        }
        console.log('[PostgreSQL] ✅ Seeded 5 sample songs');
    }

    // ── Live data migrations (run on every startup so existing Postgres dbs
    //    that were seeded with old URLs heal themselves on the next deploy).
    //    Mirrors the SQLite block in db.cjs.
    try {
        const deletedBaby = await pool.query("DELETE FROM songs WHERE title = 'Baby Steps'");
        const fixedMimi = await pool.query("UPDATE songs SET audio_url = '/musics/Mimi (Give Me Wealth).mp3' WHERE title LIKE 'Mimi%' AND (audio_url LIKE '%\"%' OR audio_url IS NULL)");
        const fixedRoses = await pool.query("UPDATE songs SET genre = 'R&B' WHERE title = 'Like Roses (You Are Your Name)' AND genre != 'R&B'");
        console.log(`[PostgreSQL] Catalogue cleanup — deleted Baby Steps: ${deletedBaby.rowCount}, fixed Mimi audio: ${fixedMimi.rowCount}, fixed Roses genre: ${fixedRoses.rowCount}`);

        // Refresh cover URLs to the local catalogue assets every boot.
        const c1 = await pool.query("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/Anniversary_Cover.jpg' WHERE title = 'Anniversary' AND cover_url != '/musics/Cover%20Phtotos/Anniversary_Cover.jpg'");
        const c2 = await pool.query("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/valentine.jpg' WHERE title = 'Valentine' AND cover_url != '/musics/Cover%20Phtotos/valentine.jpg'");
        const c3 = await pool.query("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/LikeRoses_Cover.jpg' WHERE title = 'Like Roses (You Are Your Name)' AND cover_url != '/musics/Cover%20Phtotos/LikeRoses_Cover.jpg'");
        const c4 = await pool.query("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/Mimi_Cover.jpg' WHERE title = 'Mimi (Give Me Wealth)' AND cover_url != '/musics/Cover%20Phtotos/Mimi_Cover.jpg'");
        const c5 = await pool.query("UPDATE songs SET cover_url = '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg' WHERE title = $1 AND cover_url != '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg'", ["Mummy's 60th Birthday"]);
        const totalCoverUpdates = c1.rowCount + c2.rowCount + c3.rowCount + c4.rowCount + c5.rowCount;
        console.log(`[PostgreSQL] Catalogue covers updated — Anniversary:${c1.rowCount} Valentine:${c2.rowCount} LikeRoses:${c3.rowCount} Mimi:${c4.rowCount} Mummy:${c5.rowCount} (total ${totalCoverUpdates})`);

        // Ensure Anniversary and Mummy's 60th exist for older Postgres seeds.
        const anniversaryExists = await pool.query("SELECT 1 FROM songs WHERE title = 'Anniversary' LIMIT 1");
        if (anniversaryExists.rowCount === 0) {
            await pool.query(
                `INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                ['Anniversary', 'Afro-Beats', '3:45',
                 '"A celebration of love and togetherness — crafted for a special couple whose bond only grows stronger with every passing year."',
                 '/musics/Cover%20Phtotos/Anniversary_Cover.jpg', 'A Special Couple',
                 JSON.stringify(['Anniversary', 'Love', 'Celebration']),
                 '/musics/Anniversary.mp3',
                 "An Afro-Beats track crafted to celebrate a couple's love and lasting bond.", 1]
            );
            console.log('[PostgreSQL] ✅ Added Anniversary to catalogue');
        }
        const mummyExists = await pool.query("SELECT 1 FROM songs WHERE title = $1 LIMIT 1", ["Mummy's 60th Birthday"]);
        if (mummyExists.rowCount === 0) {
            await pool.query(
                `INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                ["Mummy's 60th Birthday", 'Afro-Beats', '3:29',
                 '"A 60th birthday tribute — a joyful Afro-Beats celebration of a mother\'s love, life, and the legacy she has built."',
                 '/musics/Cover%20Phtotos/MummyBirthday_Cover.jpg', 'The Family',
                 JSON.stringify(['Birthday', 'Celebration', 'Mother']),
                 "/musics/Mummy's 60th Birthday.mp3",
                 "A heartfelt Afro-Beats track celebrating a mother's 60th birthday milestone.", 3]
            );
            console.log("[PostgreSQL] ✅ Added Mummy's 60th Birthday to catalogue");
        }

        await pool.query("UPDATE songs SET sort_order = 1 WHERE title = 'Anniversary'");
        await pool.query("UPDATE songs SET sort_order = 2 WHERE title = 'Valentine'");
        await pool.query("UPDATE songs SET sort_order = 3 WHERE title = $1", ["Mummy's 60th Birthday"]);
        await pool.query("UPDATE songs SET sort_order = 4 WHERE title = 'Like Roses (You Are Your Name)'");
        await pool.query("UPDATE songs SET sort_order = 5 WHERE title = 'Mimi (Give Me Wealth)'");
    } catch (err) {
        console.warn('[PostgreSQL] Song catalogue migration warning:', err.message);
    }
}

module.exports = { pool, all, get, run, exec, initSchema };
