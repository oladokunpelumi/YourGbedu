import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('SONG_PIPELINE_MOCK', '1');
vi.stubEnv('SONG_PIPELINE_CONCURRENCY', '1');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-pipeline-${process.pid}-${crypto.randomUUID()}.db`));

const require = createRequire(import.meta.url);
const db = require('../db.cjs');
const { getSongPipeline, shouldAutoRun, mergeJudgePanel, resolveJudgePanel } = require('../services/song-pipeline.cjs');
const { makeClient } = require('./lib/llm.cjs');

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

async function waitForGeneration(orderId) {
  const service = getSongPipeline();
  for (let i = 0; i < 80; i++) {
    const generation = await service.getGeneration(orderId);
    if (generation && ['completed', 'needs_human_review', 'invalid_input', 'failed'].includes(generation.status)) {
      return generation;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('generation timed out');
}

beforeEach(() => {
  db.prepare('DELETE FROM song_generations').run();
  db.prepare('DELETE FROM orders').run();
  vi.stubEnv('SONG_PIPELINE_MOCK_FAILURES', '0');
});

describe('song pipeline service', () => {
  it('applies the SONG_PIPELINE_AUTO gate', () => {
    vi.stubEnv('SONG_PIPELINE_AUTO', 'paid');
    expect(shouldAutoRun({ amount: 3000000 })).toBe(true);
    expect(shouldAutoRun({ amount: 0 })).toBe(false);

    vi.stubEnv('SONG_PIPELINE_AUTO', 'all');
    expect(shouldAutoRun({ amount: 0 })).toBe(true);

    vi.stubEnv('SONG_PIPELINE_AUTO', 'off');
    expect(shouldAutoRun({ amount: 3000000 })).toBe(false);
    expect(shouldAutoRun({ amount: 0 })).toBe(false);
  });

  it('runs the full mock pipeline and persists final output and usage', async () => {
    const orderId = insertOrder();
    await getSongPipeline().startGeneration(orderId);
    const generation = await waitForGeneration(orderId);

    expect(generation.status).toBe('completed');
    expect(generation.final_output.operator_paste_block).toContain('SUNO STYLE PROMPT');
    expect(generation.llm_usage.calls).toBeGreaterThan(0);
  });

  it('persists regenerate comments and rejects double starts', async () => {
    const orderId = insertOrder();
    await getSongPipeline().startGeneration(orderId);
    await expect(getSongPipeline().startGeneration(orderId)).rejects.toMatchObject({ statusCode: 409 });
    await waitForGeneration(orderId);

    await getSongPipeline().regenerateFromStage(orderId, 'lyrics', { comment: 'Make the chorus simpler.' });
    const generation = await waitForGeneration(orderId);
    expect(generation.stage_comments.lyrics).toBe('Make the chorus simpler.');
    expect(generation.status).toBe('completed');
  });

  it('can exhaust the mock quality loop into human review', async () => {
    vi.stubEnv('SONG_PIPELINE_MOCK_FAILURES', '99');
    const orderId = insertOrder();
    await getSongPipeline().startGeneration(orderId, { restart: true });
    const generation = await waitForGeneration(orderId);

    expect(generation.status).toBe('needs_human_review');
    expect(generation.state.rewrite_count).toBe(2);
  });

  it('passes explicit and default temperatures to OpenRouter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 2, completion_tokens: 3 },
          model: 'test-model',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    try {
      const client = makeClient({ mock: false, apiKey: 'test-key', baseUrl: 'https://openrouter.test' });

      await client.run('lyrics', {
        model: 'anthropic/claude-sonnet-4.6',
        system: 'system',
        userContent: { hello: 'world' },
        temperature: 0.9,
      });
      await client.run('style', {
        model: 'anthropic/claude-sonnet-4.6',
        system: 'system',
        userContent: { hello: 'again' },
      });

      const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(firstBody.temperature).toBe(0.9);
      expect(secondBody.temperature).toBe(0.7);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('judge panel merge', () => {
  it('takes the lowest score per dimension and unions issues/targets', () => {
    const merged = mergeJudgePanel([
      {
        model: 'a',
        json: {
          scores: { emotional_specificity: 9, singability: 8, hook_strength: 8, genre_fit: 9, occasion_fit: 9 },
          issues: ['chorus is a touch generic'],
          rewrite_targets: ['chorus - sharpen hook'],
          one_line_verdict: 'Strong, minor polish.',
        },
      },
      {
        model: 'b',
        json: {
          // the strict critic: catches a weak hook the first model waved through
          scores: { emotional_specificity: 7, singability: 8, hook_strength: 5, genre_fit: 9, occasion_fit: 8 },
          issues: ['hook does not land', 'verse 2 lists qualities'],
          rewrite_targets: ['chorus - sharpen hook', 'verse_2 - turn into a scene'],
          one_line_verdict: 'Weak hook, needs a rewrite.',
        },
      },
    ]);

    expect(merged.scores).toEqual({
      emotional_specificity: 7,
      singability: 8,
      hook_strength: 5,
      genre_fit: 9,
      occasion_fit: 8,
    });
    // union + dedupe across the panel
    expect(merged.rewrite_targets).toEqual(['chorus - sharpen hook', 'verse_2 - turn into a scene']);
    expect(merged.issues).toContain('hook does not land');
    // verdict comes from the harshest (lowest-average) panelist
    expect(merged.one_line_verdict).toBe('Weak hook, needs a rewrite.');
    expect(merged.panel).toHaveLength(2);
  });

  it('returns null when no panelist produced scores (caller falls back)', () => {
    expect(mergeJudgePanel([])).toBeNull();
    expect(mergeJudgePanel([{ model: 'x', json: {} }])).toBeNull();
  });

  it('resolveJudgePanel honors the off switch and the model override', () => {
    vi.stubEnv('YG_JUDGE_PANEL', 'off');
    expect(resolveJudgePanel('anthropic/claude-sonnet-4.6')).toEqual(['anthropic/claude-sonnet-4.6']);

    vi.stubEnv('YG_JUDGE_PANEL', 'on');
    vi.stubEnv('YG_JUDGE_PANEL_MODELS', 'model-a, model-b ,model-c');
    expect(resolveJudgePanel('sonnet')).toEqual(['model-a', 'model-b', 'model-c']);

    vi.stubEnv('YG_JUDGE_PANEL_MODELS', '');
    expect(resolveJudgePanel('sonnet')[0]).toBe('sonnet');
    expect(resolveJudgePanel('sonnet').length).toBeGreaterThan(1);
  });
});
