import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OrderData } from '../types';

interface SongReadyProps {
  order: OrderData;
  onRatingSaved?: (rating: number) => void;
}

const TIP_URL = (import.meta.env.VITE_TIP_URL as string | undefined) || '';
const REACTION_FORM_URL = (import.meta.env.VITE_REACTION_FORM_URL as string | undefined) || '';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SongReady: React.FC<SongReadyProps> = ({ order, onRatingSaved }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rating, setRating] = useState<number>(order.rating || 0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    setRating(order.rating || 0);
  }, [order.rating]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [order.finalSongUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleScrub = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(event.target.value);
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const submitRating = useCallback(
    async (value: number) => {
      setRating(value);
      setSavingRating(true);
      try {
        await fetch(`/api/orders/${encodeURIComponent(order.id)}/rating`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: value }),
        });
        onRatingSaved?.(value);
      } finally {
        setSavingRating(false);
      }
    },
    [order.id, onRatingSaved]
  );

  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}/#/track?id=${encodeURIComponent(order.id)}`;
    const shareData = {
      title: order.finalSongTitle || order.songTitle || 'Your custom song',
      text: 'Listen to my custom song from PrayerSong',
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share unavailable — fall back to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2200);
    } catch {
      // best effort — clipboard may be blocked
    }
  }, [order.id, order.finalSongTitle, order.songTitle]);

  const title = order.finalSongTitle || order.songTitle || 'Your song';

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-10">
      <div
        className={`relative flex h-64 w-64 items-center justify-center rounded-full bg-ink shadow-[0_24px_60px_rgba(31,27,20,0.25)] sm:h-72 sm:w-72 ${
          isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''
        }`}
        aria-hidden="true"
      >
        <div className="absolute inset-4 rounded-full border border-cream/10" />
        <div className="absolute inset-10 rounded-full border border-cream/10" />
        <div className="absolute inset-16 rounded-full border border-cream/10" />
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-cream text-center sm:h-28 sm:w-28">
          <span className="font-headline text-base italic leading-tight text-ink sm:text-lg">
            {title}
          </span>
        </div>
      </div>

      <div className="mt-10 w-full">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          disabled={!duration}
          className="w-full accent-terracotta"
          aria-label="Seek"
        />
        <div className="mt-1 flex justify-between font-label text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-terracotta text-cream shadow-[0_12px_28px_rgba(179,82,47,0.35)] transition-colors hover:bg-terracotta-dark"
        >
          <span className="material-symbols-outlined text-3xl" aria-hidden="true">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>

      <audio ref={audioRef} src={order.finalSongUrl || undefined} preload="metadata" />

      <div className="mt-10 w-full max-w-md rounded-2xl border border-line bg-cream p-5 text-center">
        <p className="font-headline text-2xl font-medium text-ink">How did we do?</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = (hoverRating || rating) >= star;
            return (
              <button
                key={star}
                type="button"
                disabled={savingRating}
                onClick={() => submitRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                className="text-3xl leading-none transition-transform hover:scale-110 disabled:opacity-60"
              >
                <span
                  className={`material-symbols-outlined ${active ? 'text-terracotta' : 'text-ink-muted/40'}`}
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  aria-hidden="true"
                >
                  star
                </span>
              </button>
            );
          })}
        </div>
        {rating > 0 && (
          <p className="mt-2 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
            Thanks for your feedback
          </p>
        )}
      </div>

      <div className="mt-6 flex w-full max-w-md flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-terracotta px-6 py-2 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta-dark"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            share
          </span>
          {shareState === 'copied' ? 'Link copied' : 'Share'}
        </button>

        {TIP_URL && (
          <a
            href={TIP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-mustard px-6 py-2 font-label text-sm font-bold uppercase tracking-[0.12em] text-ink transition-colors hover:brightness-95"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              card_giftcard
            </span>
            Tip PrayerSong
          </a>
        )}
      </div>

      {REACTION_FORM_URL && (
        <div className="mt-10 w-full max-w-md rounded-2xl border border-line bg-cream p-6 text-center">
          <span className="inline-block rounded-full bg-terracotta-pale px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta-dark">
            Limited time
          </span>
          <p className="mt-4 font-headline text-2xl font-semibold text-ink">Submit your reaction video</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            If selected, you&apos;ll receive a $50 Amazon gift card.
          </p>
          <a
            href={REACTION_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-terracotta px-6 py-2 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta-dark"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              videocam
            </span>
            Upload your video
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              open_in_new
            </span>
          </a>
        </div>
      )}
    </section>
  );
};

export default SongReady;
