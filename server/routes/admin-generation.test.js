import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('SONG_PIPELINE_MOCK', '1');
vi.stubEnv('SONG_PIPELINE_CONCURRENCY', '1');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-admin-generation-${process.pid}-${crypto.randomUUID()}.db`));

const require = createRequire(import.meta.url);
const db = require('../db.cjs');

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { requireAdmin } = require('../middleware/auth.cjs');
const generationRouter = require('./admin-generation.cjs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/admin/orders/:orderId/generation', requireAdmin, generationRouter);

function adminCookie() {
  const token = jwt.sign({ userId: 'admin-id', role: 'admin', jti: crypto.randomUUID() }, 'test-secret-for-testing-only-32chars!!', { expiresIn: '1h' });
  return `admin_token=${token}`;
}

function insertOrder(id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (
      id, song_title, genre, mood, tempo, occasion, occasion_detail, story,
      status, created_at, delivery_date, amount, customer_email,
      recipient_type, recipient_name, sender_name, voice_gender,
      special_qualities, favorite_memories, special_message
    ) VALUES (?, 'Custom Song', 'Afro-R&B', '', 100, 'anniversary', '', '', 'in_production', ?, ?, 3000000, 'test@example.com', 'Wife', 'Aisha', 'Tunde', 'Female Voice', 'Kind and steady', 'Lekki rooftop', 'Everything good has your fingerprints on it')
  `).run(id, now, now);
  return id;
}

async function poll(supertest, orderId, cookie) {
  for (let i = 0; i < 80; i++) {
    const res = await supertest(app).get(`/api/admin/orders/${orderId}/generation`).set('Cookie', cookie);
    if (res.status === 200 && ['completed', 'needs_human_review', 'failed'].includes(res.body.status)) return res;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('generation timed out');
}

beforeEach(() => {
  db.prepare('DELETE FROM song_generations').run();
  db.prepare('DELETE FROM orders').run();
});

describe('admin generation routes', () => {
  it('requires admin auth and returns 404 before a generation exists', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = insertOrder();

    expect((await supertest(app).get(`/api/admin/orders/${orderId}/generation`)).status).toBe(401);
    const missing = await supertest(app).get(`/api/admin/orders/${orderId}/generation`).set('Cookie', adminCookie());
    expect(missing.status).toBe(404);
  });

  it('starts, polls, rejects double start, regenerates with comment, and validates overrides', async () => {
    const { default: supertest } = await import('supertest');
    const cookie = adminCookie();
    const orderId = insertOrder();

    const start = await supertest(app)
      .post(`/api/admin/orders/${orderId}/generation/start`)
      .set('Cookie', cookie)
      .send({});
    expect(start.status).toBe(202);

    const double = await supertest(app)
      .post(`/api/admin/orders/${orderId}/generation/start`)
      .set('Cookie', cookie)
      .send({});
    expect(double.status).toBe(409);

    const completed = await poll(supertest, orderId, cookie);
    expect(completed.body.final_output.operator_paste_block).toContain('SUNO LYRICS');

    const badOverride = await supertest(app)
      .patch(`/api/admin/orders/${orderId}/generation/overrides`)
      .set('Cookie', cookie)
      .send({ tone_preference: 'loud' });
    expect(badOverride.status).toBe(400);

    const goodOverride = await supertest(app)
      .patch(`/api/admin/orders/${orderId}/generation/overrides`)
      .set('Cookie', cookie)
      .send({ tone_preference: 'funny' });
    expect(goodOverride.status).toBe(200);
    expect(goodOverride.body.pipeline_form.tone_preference).toBe('funny');

    const regen = await supertest(app)
      .post(`/api/admin/orders/${orderId}/generation/stages/lyrics/regenerate`)
      .set('Cookie', cookie)
      .send({ comment: 'Make it simpler.' });
    expect(regen.status).toBe(202);
    const afterRegen = await poll(supertest, orderId, cookie);
    expect(afterRegen.body.stage_comments.lyrics).toBe('Make it simpler.');
  });
});
