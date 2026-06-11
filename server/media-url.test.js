/**
 * Catalogue media resolves to MEDIA_BASE_URL in production.
 *
 * musics/ is gitignored, so relative /musics/* paths 404 on a fresh deploy.
 * When MEDIA_BASE_URL is set, the seed migration must rewrite relative paths to
 * absolute CDN URLs (idempotently); when unset, paths stay local for dev.
 *
 * db.cjs is a CommonJS module with a top-level `return` (the Postgres early-out),
 * which Vite's ESM transform rejects — so we load it through Node's real CJS
 * require and bust the require cache between cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const DB_MODULE = path.join(__dirname, 'db.cjs');
const TMP = path.join('/tmp', `media-url-test-${process.pid}.db`);

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(TMP + suffix)) rmSync(TMP + suffix);
  }
}

function loadFreshDb() {
  delete require.cache[require.resolve(DB_MODULE)];
  delete require.cache[require.resolve(path.join(__dirname, 'db-helpers.cjs'))];
  return require(DB_MODULE);
}

describe('catalogue media URL resolution', () => {
  beforeEach(() => {
    cleanup();
    process.env.DB_PATH = TMP;
  });
  afterEach(() => {
    delete process.env.MEDIA_BASE_URL;
    delete process.env.DB_PATH;
    cleanup();
  });

  it('rewrites /musics paths to MEDIA_BASE_URL when set', () => {
    process.env.MEDIA_BASE_URL = 'https://cdn.example.com/';
    const db = loadFreshDb();
    const rows = db.prepare('SELECT audio_url, cover_url FROM songs').all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.audio_url.startsWith('https://cdn.example.com/musics/')).toBe(true);
      expect(r.cover_url.startsWith('https://cdn.example.com/musics/')).toBe(true);
      // trailing slash on the base is trimmed — no double slash before musics
      expect(r.audio_url).not.toContain('com//musics');
    }
    db.close?.();
  });

  it('leaves relative /musics paths untouched when MEDIA_BASE_URL is unset', () => {
    delete process.env.MEDIA_BASE_URL;
    const db = loadFreshDb();
    const row = db.prepare("SELECT audio_url FROM songs WHERE title = 'Anniversary'").get();
    expect(row.audio_url).toBe('/musics/Anniversary.mp3');
    db.close?.();
  });
});
