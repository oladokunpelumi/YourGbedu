/**
 * Adapter-agnostic DB helpers.
 *
 * The codebase was originally written against better-sqlite3's synchronous
 * `db.prepare(sql).get/all/run(...)` API. The Postgres adapter is async and
 * only exposes `db.all/get/run(sql, params)`. To keep route code uniform,
 * these helpers branch on the active adapter and return Promises in either
 * case — callers just `await` them.
 *
 * Placeholder translation: SQLite uses `?`, Postgres uses `$1, $2, ...`.
 * Pass SQLite-style `?` and the helper rewrites to `$N` for Postgres.
 *
 * SQLite-specific syntax callers must handle themselves (or use
 * `pgVariantSql()` to inline the right one):
 *   - `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`
 *   - `INSERT OR REPLACE` → `INSERT ... ON CONFLICT (col) DO UPDATE SET ...`
 */
const db = require('./db.cjs');
const isPostgres = typeof db.prepare !== 'function';

function toPgSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

/** Get a single row. Returns undefined when nothing matches. */
async function getOne(sql, ...params) {
    if (isPostgres) {
        return await db.get(toPgSql(sql), params);
    }
    return db.prepare(sql).get(...params);
}

/** Get all matching rows as an array. */
async function getAll(sql, ...params) {
    if (isPostgres) {
        return await db.all(toPgSql(sql), params);
    }
    return db.prepare(sql).all(...params);
}

/** Run an INSERT/UPDATE/DELETE. Returns `{ changes }`. */
async function execSql(sql, ...params) {
    if (isPostgres) {
        return await db.run(toPgSql(sql), params);
    }
    return db.prepare(sql).run(...params);
}

/**
 * Return the right SQL string for the active adapter.
 *
 *   const sql = pgVariantSql({
 *       sqlite: 'INSERT OR IGNORE INTO foo VALUES (?, ?)',
 *       postgres: 'INSERT INTO foo VALUES ($1, $2) ON CONFLICT DO NOTHING',
 *   });
 */
function pgVariantSql({ sqlite, postgres }) {
    return isPostgres ? postgres : sqlite;
}

module.exports = { isPostgres, getOne, getAll, execSql, pgVariantSql };
