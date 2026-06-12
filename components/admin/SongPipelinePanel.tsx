import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SongGeneration, SongPipelineStage } from '../../types';

type StageName = Extract<SongPipelineStage, 'intake' | 'brief' | 'style' | 'lyrics' | 'quality' | 'format'>;

interface Props {
  orderId: string;
  generationStatus?: string | null;
  generationStage?: string | null;
  onGenerationChange?: (status: string | null, stage: string | null) => void;
  onMessage?: (message: string) => void;
}

const STAGES: { key: StageName; label: string; icon: string }[] = [
  { key: 'intake', label: 'Intake', icon: 'psychology' },
  { key: 'brief', label: 'Brief', icon: 'edit_note' },
  { key: 'style', label: 'Style', icon: 'tune' },
  { key: 'lyrics', label: 'Lyrics', icon: 'lyrics' },
  { key: 'quality', label: 'Quality', icon: 'verified' },
  { key: 'format', label: 'Package', icon: 'content_paste' },
];

const OPTIONS = {
  tone_preference: ['tender', 'joyful', 'funny', 'emotional', 'romantic', 'spiritual', 'sensual', 'reflective', 'proud', 'healing'],
  relationship_energy: ['playful', 'protective', 'passionate', 'calm', 'grateful', 'healing', 'proud', 'devotional', 'nostalgic'],
  emotion_intensity: ['soft', 'medium', 'deeply_emotional'],
};

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, { ...options, credentials: 'include' });
}

function labelize(value?: string | null) {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status?: string | null) {
  switch (status) {
    case 'completed':
      return 'border-sage-soft bg-sage-pale text-sage-dark';
    case 'running':
    case 'queued':
      return 'border-mustard/30 bg-mustard-pale text-[#6F521F]';
    case 'needs_human_review':
    case 'invalid_input':
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-line bg-cream text-ink-muted';
  }
}

function stageDot(status?: string) {
  if (status === 'completed') return 'bg-sage';
  if (status === 'running') return 'animate-pulse bg-mustard';
  if (status === 'failed') return 'bg-red-500';
  return 'bg-line-strong';
}

function lyricsText(lyrics: any) {
  if (!lyrics) return '';
  const order = [
    ['intro', '[Intro]'],
    ['verse_1', '[Verse 1]'],
    ['pre_chorus', '[Pre-Chorus]'],
    ['chorus', '[Chorus]'],
    ['verse_2', '[Verse 2]'],
    ['bridge', '[Bridge]'],
    ['final_chorus', '[Final Chorus]'],
    ['outro', '[Outro]'],
  ];
  return order
    .filter(([key]) => typeof lyrics[key] === 'string' && lyrics[key].trim())
    .map(([key, label]) => `${label}\n${lyrics[key].trim()}`)
    .join('\n\n');
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-cream p-3 font-mono text-xs leading-relaxed text-ink-soft">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}

export const SongPipelinePanel: React.FC<Props> = ({
  orderId,
  generationStatus,
  generationStage,
  onGenerationChange,
  onMessage,
}) => {
  const [generation, setGeneration] = useState<SongGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<StageName>('brief');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dirtyOverrides, setDirtyOverrides] = useState<Record<string, boolean>>({});
  // Refs mirror the dirty flags so applyGeneration (called from the 3s poll and
  // post-action refreshes) can preserve in-progress edits without re-binding.
  // Without this, every poll wiped the guidance textarea and override dropdowns
  // while the admin was still typing.
  const dirtyOverridesRef = useRef<Record<string, boolean>>({});
  const dirtyCommentsRef = useRef<Record<string, boolean>>({});

  const endpoint = `/api/admin/orders/${orderId}/generation`;

  const applyGeneration = useCallback((next: SongGeneration | null, opts: { resetDrafts?: boolean } = {}) => {
    const resetDrafts = !!opts.resetDrafts;
    setGeneration(next);
    if (resetDrafts) {
      dirtyCommentsRef.current = {};
      dirtyOverridesRef.current = {};
      setDirtyOverrides({});
    }
    setComments((current) => {
      const server = next?.stage_comments || {};
      if (resetDrafts) return server;
      const merged: Record<string, string> = { ...server };
      for (const stage of Object.keys(dirtyCommentsRef.current)) {
        if (dirtyCommentsRef.current[stage]) merged[stage] = current[stage] ?? '';
      }
      return merged;
    });
    setOverrides((current) => {
      const server = {
        tone_preference: next?.pipeline_form?.tone_preference || '',
        relationship_energy: next?.pipeline_form?.relationship_energy || '',
        emotion_intensity: next?.pipeline_form?.emotion_intensity || '',
      };
      if (resetDrafts) return server;
      const merged: Record<string, string> = { ...server };
      for (const field of Object.keys(dirtyOverridesRef.current)) {
        if (dirtyOverridesRef.current[field]) merged[field] = current[field] ?? '';
      }
      return merged;
    });
    onGenerationChange?.(next?.status || null, next?.current_stage || null);
  }, [onGenerationChange]);

  const fetchGeneration = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(endpoint);
      if (res.status === 404) {
        applyGeneration(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation fetch failed');
      applyGeneration(data);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Could not load generation.');
    } finally {
      setLoading(false);
    }
  }, [applyGeneration, endpoint, onMessage]);

  useEffect(() => {
    fetchGeneration();
  }, [fetchGeneration]);

  useEffect(() => {
    if (generation?.status !== 'running') return;
    const timer = window.setInterval(fetchGeneration, 3000);
    return () => window.clearInterval(timer);
  }, [fetchGeneration, generation?.status]);

  const status = generation?.status || generationStatus || 'not_started';
  const currentStage = generation?.current_stage || generationStage || null;
  const finalOutput = generation?.final_output || generation?.state?.final_output || null;
  const usageLine = generation?.llm_usage
    ? `${generation.llm_usage.calls || 0} calls · ${Number(generation.llm_usage.total_tokens || 0).toLocaleString()} tokens`
    : '';

  const runAction = async (
    label: string,
    request: () => Promise<Response>,
    success: string,
    opts: { resetDrafts?: boolean } = {}
  ) => {
    setAction(label);
    try {
      const res = await request();
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `${label} failed`);
      applyGeneration(data, opts);
      onMessage?.(success);
      window.setTimeout(fetchGeneration, 600);
      return true;
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : `${label} failed`);
      return false;
    } finally {
      setAction(null);
    }
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onMessage?.(message);
    } catch {
      onMessage?.('Could not copy automatically.');
    }
  };

  const stageOutput = useMemo(() => {
    const state = generation?.state || {};
    if (expandedStage === 'intake') return <JsonBlock value={state.intake_interpretation} />;
    if (expandedStage === 'brief') return <JsonBlock value={state.creative_brief} />;
    if (expandedStage === 'style') {
      return <p className="whitespace-pre-wrap rounded-lg border border-line bg-cream p-3 leading-relaxed text-ink-soft">{state.suno_output?.style_prompt || '-'}</p>;
    }
    if (expandedStage === 'lyrics') {
      return <pre className="whitespace-pre-wrap rounded-lg border border-line bg-cream p-3 font-body text-sm leading-relaxed text-ink-soft">{lyricsText(state.suno_output?.lyrics) || '-'}</pre>;
    }
    if (expandedStage === 'quality') return <JsonBlock value={state.quality_report} />;
    return <JsonBlock value={finalOutput} />;
  }, [expandedStage, finalOutput, generation?.state]);

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="material-symbols-outlined text-base text-terracotta">auto_awesome</span>
          <span className="font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta">
            Song Pipeline
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusClass(status)}`}>
            {labelize(status)}
          </span>
          {currentStage && (
            <span className="rounded-full bg-ivory px-2 py-0.5 text-xs font-bold text-ink-muted">
              {labelize(currentStage)}
            </span>
          )}
          {usageLine && <span className="text-xs font-bold text-ink-muted">{usageLine}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction('Start', () => adminFetch(`${endpoint}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ restart: false }),
            }), 'Song pipeline queued.')}
            disabled={action !== null || status === 'running'}
            className="inline-flex items-center gap-1 rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-cream hover:bg-terracotta disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-sm ${action === 'Start' ? 'animate-spin' : ''}`}>play_arrow</span>
            {status === 'failed' ? 'Retry' : generation ? 'Restart' : 'Run'}
          </button>
          <button
            type="button"
            onClick={fetchGeneration}
            disabled={loading}
            className="flex size-8 items-center justify-center rounded-full border border-line-strong text-ink-muted hover:text-terracotta disabled:opacity-60"
            aria-label="Refresh generation"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {Object.entries(OPTIONS).map(([field, values]) => (
          <label key={field} className="block">
            <span className="mb-1 block font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
              {labelize(field)}
              {generation?.derived_fields?.source?.[field] && (
                <span className="ml-2 rounded-full bg-sage-pale px-2 py-0.5 text-xs text-sage-dark">
                  {generation.derived_fields.source[field]}
                </span>
              )}
            </span>
            <select
              value={overrides[field] || ''}
              onChange={(e) => {
                setOverrides((current) => ({ ...current, [field]: e.target.value }));
                setDirtyOverrides((current) => ({ ...current, [field]: true }));
                dirtyOverridesRef.current = { ...dirtyOverridesRef.current, [field]: true };
              }}
              disabled={status === 'running'}
              className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 disabled:opacity-60"
            >
              <option value="">Auto</option>
              {values.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            // Send every currently selected value, not just dirty ones — a poll
            // landing mid-edit must never reduce this to an empty patch.
            const patch = Object.fromEntries(
              Object.entries(overrides).filter(([, value]) => !!value)
            );
            void runAction('Save overrides', () => adminFetch(`${endpoint}/overrides`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            }), 'Pipeline overrides saved. Regenerate from Intake to apply them.', { resetDrafts: true });
          }}
          disabled={action !== null || status === 'running'}
          className="inline-flex items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-sm">save</span>
          Save Overrides
        </button>
        {Object.values(dirtyOverrides).some(Boolean) && (
          <span className="rounded-full bg-mustard-pale px-2 py-0.5 text-xs font-bold text-[#6F521F]">
            Unsaved changes — save, then regenerate from Intake
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {STAGES.map((stage) => {
            const info = generation?.stage_status?.[stage.key] || {};
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setExpandedStage(stage.key)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                  expandedStage === stage.key ? 'border-terracotta bg-terracotta-pale/50' : 'border-line bg-cream hover:border-terracotta/50'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className={`size-2 rounded-full ${stageDot(info.status)}`} />
                  <span className="material-symbols-outlined text-base text-ink-muted">{stage.icon}</span>
                  {stage.label}
                </span>
                <span className="text-[11px] font-bold text-ink-muted">{labelize(info.status || 'pending')}</span>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 rounded-xl border border-line bg-ivory p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta">
              {labelize(expandedStage)}
            </h4>
            {expandedStage !== 'format' && (
              <button
                type="button"
                onClick={async () => {
                  const stage = expandedStage;
                  const ok = await runAction(`Regenerate ${stage}`, () => adminFetch(`${endpoint}/stages/${stage}/regenerate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comment: comments[stage] || '' }),
                  }), `${labelize(stage)} regeneration queued.`);
                  // The comment is now stored server-side; let future polls own it.
                  if (ok) dirtyCommentsRef.current = { ...dirtyCommentsRef.current, [stage]: false };
                }}
                disabled={action !== null || status === 'running'}
                className="inline-flex items-center gap-1 rounded-full bg-terracotta px-3 py-1.5 text-xs font-bold text-cream disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-sm">replay</span>
                Regenerate
              </button>
            )}
          </div>
          {stageOutput}
          {expandedStage !== 'format' && (
            <textarea
              value={comments[expandedStage] || ''}
              onChange={(e) => {
                const stage = expandedStage;
                setComments((current) => ({ ...current, [stage]: e.target.value }));
                dirtyCommentsRef.current = { ...dirtyCommentsRef.current, [stage]: true };
              }}
              rows={3}
              placeholder="Admin guidance — applied when you click Regenerate"
              className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-terracotta/20"
            />
          )}
        </div>
      </div>

      {finalOutput && (
        <div className="mt-4 rounded-xl border border-sage-soft bg-sage-pale/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-label text-xs font-bold uppercase tracking-[0.14em] text-sage-dark">
                Final Package
              </h4>
              <p className="mt-1 font-serif text-2xl text-ink">{finalOutput.title || 'Untitled'}</p>
            </div>
            <button
              type="button"
              onClick={() => copyText(finalOutput.operator_paste_block || '', 'Song package copied.')}
              className="inline-flex items-center gap-1 rounded-full bg-sage px-4 py-2 text-xs font-bold text-cream"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              Copy Package
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-sage-soft bg-cream p-3 text-xs leading-relaxed text-ink-soft">
              {finalOutput.suno_style_prompt}
            </pre>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-sage-soft bg-cream p-3 text-xs leading-relaxed text-ink-soft">
              {finalOutput.suno_lyrics_text}
            </pre>
          </div>
        </div>
      )}

      {generation?.error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {generation.error}
        </p>
      )}
    </div>
  );
};
