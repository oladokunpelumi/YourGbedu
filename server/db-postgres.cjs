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
            amount INTEGER DEFAULT 30000,
            recipient_type TEXT,
            sender_name TEXT,
            voice_gender TEXT,
            special_qualities TEXT,
            favorite_memories TEXT,
            special_message TEXT,
            customer_email TEXT,
            ai_brief TEXT
        );

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
    `);

    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS occasion_detail TEXT');
    console.log('[PostgreSQL] Schema initialized');

    // Seed sample songs if the table is empty
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM songs');
    if (parseInt(rows[0].count, 10) === 0) {
        const seedSongs = [
            {
                title: 'Like Roses (You Are Your Name)',
                genre: 'Afro-R&B',
                duration: '4:03',
                description: '"We met at a coffee shop on a rainy Tuesday. I spilled my latte, he laughed, and now every moment feels like roses blooming."',
                cover_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCn8xOssl2ppe5twvI7LYDeLGPnmv-mo9yVKKzEBlA6LDDxKmJmEZ4iOXN1t9pT2eiVrYMzuuUqhoHRRyrHnVkB4fuBScfeRLGc__QeeJKM40nGNE0vBX1OaYrCxt-0Y_BalNBilpXI8jzgTrw3FVN9LUvUsAZg7IeBVXn5JKh2S7RS4dJYv6V0UJtqqhyY8PIR35JSwhd1Gdzm3vcpCaNrncnlxrt7QVGUc7N7axoppfVPDUPVHokSBBRd5cv3Nmb--XvVB7Tbkg',
                artist: 'First Love',
                tags: JSON.stringify(['First Date', 'Love']),
                audio_url: '/musics/Like Roses ( You Are Your Name).mp3',
                story: 'A first date love story turned into a romantic Afro-R&B track.',
            },
            {
                title: 'Mimi (Give Me Wealth)',
                genre: 'Afro-Beats',
                duration: '1:47',
                description: '"For her milestone birthday, we wanted to capture her radiant energy, her love for life, and the joy she brings to everyone around her."',
                cover_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAvKxuOtg_3IVmm0l8rcnPdVJtKIB_iOtBYdQdMm6nAYydMOsmIgiQlkbKvqIGiUjpvMotWmPV1rjbepTXfuVlEnepVvxv_dNkUubkUik5OZS2QKArjhKO0nav02SQm90Tk8rTYfZ-PFsaBa8-7CNDLdMDNlyFXKvbjg5Rv00_OrMmS6nCMKnlNZFnXCrYO1QpQUSrVfMW_AO72eUtnnJV0ihDT08TkpolfbndIJxKz-KLWNGNiv7Xqb-31b5ely4qUhLJg0GozHw',
                artist: 'The Family',
                tags: JSON.stringify(['Birthday', 'Celebration']),
                audio_url: '/musics/Mimi (Give Me Wealth)".mp3',
                story: 'A birthday celebration song full of Afrobeats energy.',
            },
            {
                title: 'Baby Steps',
                genre: 'Gospel',
                duration: '2:58',
                description: '"Welcoming our first child was magic. We wanted a song that we could hum to her every night as she drifts off to sleep."',
                cover_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbJHdoLF0pZDcWvJt_PYJ2omO4zgo2pXdiE-vRWknOLG7l8xuEupdb0lbuiu5D963dwT0dvFR8hcoScud5gLUvctPAR5csY0_2My3OQzi4v1zJ06tXK14IWUke0Y0QxExxpa3qEUHKoPTy_tlhTuj31_h732NM8VHCvSQjAo1C4bPCLdaFipVOwUbp-Xsxznwfhx4dfqixZfuSda89J64oBpG7Di6vr9hmY6O_a0o9P5sNi6aSLRRI3zkhulZ0qxCEh9vlh_szUg',
                artist: 'New Parents',
                tags: JSON.stringify(['Newborn', 'Magic']),
                audio_url: null,
                story: 'A gentle lullaby for a newborn child.',
            },
            {
                title: 'Valentine',
                genre: 'Afro-R&B',
                duration: '2:30',
                description: '"A song to celebrate our love and all the wonderful moments we share."',
                cover_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbJHdoLF0pZDcWvJt_PYJ2omO4zgo2pXdiE-vRWknOLG7l8xuEupdb0lbuiu5D963dwT0dvFR8hcoScud5gLUvctPAR5csY0_2My3OQzi4v1zJ06tXK14IWUke0Y0QxExxpa3qEUHKoPTy_tlhTuj31_h732NM8VHCvSQjAo1C4bPCLdaFipVOwUbp-Xsxznwfhx4dfqixZfuSda89J64oBpG7Di6vr9hmY6O_a0o9P5sNi6aSLRRI3zkhulZ0qxCEh9vlh_szUg',
                artist: 'Lovers',
                tags: JSON.stringify(['Valentine', 'Romance']),
                audio_url: '/musics/Valentine.mp3',
                story: 'A perfectly crafted pop electronic song dedicated to an amazing valentine.',
            },
        ];

        for (const song of seedSongs) {
            await pool.query(
                `INSERT INTO songs (title, genre, duration, description, cover_url, artist, tags, audio_url, story)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [song.title, song.genre, song.duration, song.description, song.cover_url,
                 song.artist, song.tags, song.audio_url, song.story]
            );
        }
        console.log('[PostgreSQL] ✅ Seeded 4 sample songs');
    }
}

module.exports = { pool, all, get, run, exec, initSchema };
