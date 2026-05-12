import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PersistentPlayer: React.FC = () => {
  const [isHidden, setIsHidden] = useState(false);
  const {
    activeSong,
    isPlaying,
    isPreviewLocked,
    currentTime,
    duration,
    volume,
    togglePlay,
    seek,
    setVolume,
    skipNext,
    skipPrev,
  } = usePlayer();

  const waveformBars = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => {
      const seed = (i * 7 + 13) % 100;
      return 20 + (seed / 100) * 80;
    });
  }, []);

  // No active song: show floating CTA on all screens
  if (!activeSong) {
    return (
      <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none">
        <Link
          to="/create"
          className="pointer-events-auto inline-flex min-h-12 min-w-[190px] max-w-[calc(100vw-2rem)] items-center justify-center whitespace-nowrap rounded-full bg-[#211704] px-7 py-3 font-label text-xs uppercase tracking-widest text-primary shadow-[0_8px_24px_rgba(36,26,0,0.18)] ring-1 ring-[#D4AF37]/30 transition-transform duration-300 hover:scale-[1.02] sm:px-8"
        >
          Create Your Song
        </Link>
      </div>
    );
  }

  const progressFraction = duration > 0 ? currentTime / duration : 0;
  const activeBarIndex = Math.floor(progressFraction * waveformBars.length);
  const hasAudio = !!activeSong.audioUrl;

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={() => setIsHidden(false)}
        className="fixed bottom-5 right-5 z-[100] flex h-12 items-center gap-2 rounded-full bg-obsidian px-4 text-primary shadow-[0_6px_18px_rgba(36,26,0,0.18)] transition-transform hover:scale-[1.03]"
        aria-label="Show music player"
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          graphic_eq
        </span>
        <span className="hidden text-[10px] font-label font-bold uppercase tracking-widest sm:inline">
          Player
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-0 right-0 z-[100] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto grid w-full max-w-[760px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-[28px] border border-[#D4AF37]/35 bg-[#211704] px-3 py-2 text-[#fff6d5] shadow-[0_10px_30px_rgba(36,26,0,0.24)] ring-1 ring-black/10 md:grid-cols-[minmax(160px,220px)_auto_minmax(180px,1fr)_auto] md:gap-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={activeSong.coverUrl}
            alt=""
            loading="eager"
            className="h-11 w-11 shrink-0 rounded-md border border-[#D4AF37]/25 object-cover shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold leading-tight text-[#fff8df]">
              {activeSong.title}
            </p>
            <p className="truncate font-ui text-xs text-[#d9bf62]">
              {activeSong.genre} {hasAudio ? '' : '• No audio'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-1">
          <button
            type="button"
            onClick={skipPrev}
            className="hidden h-9 w-9 items-center justify-center rounded-full text-[#d9bf62] transition-colors hover:bg-[#D4AF37]/10 hover:text-[#fff8df] sm:flex"
            aria-label="Previous sample"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              skip_previous
            </span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasAudio || isPreviewLocked}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform ${
              hasAudio && !isPreviewLocked
                ? 'bg-[#D4AF37] text-[#211704] shadow-[0_4px_14px_rgba(212,175,55,0.25)] hover:scale-[1.03]'
                : 'bg-[#D4AF37]/10 text-[#d9bf62]/45 cursor-not-allowed'
            }`}
            aria-label={isPlaying ? 'Pause sample' : 'Play sample'}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            type="button"
            onClick={skipNext}
            className="hidden h-9 w-9 items-center justify-center rounded-full text-[#d9bf62] transition-colors hover:bg-[#D4AF37]/10 hover:text-[#fff8df] sm:flex"
            aria-label="Next sample"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              skip_next
            </span>
          </button>
        </div>

        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <span className="w-9 text-right font-mono text-[10px] text-[#d9bf62]/80">
            {formatTime(currentTime)}
          </span>

          {isPreviewLocked ? (
            <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#D4AF37]/10 px-3">
              <span className="material-symbols-outlined text-sm text-[#D4AF37]" aria-hidden="true">
                lock
              </span>
              <span className="truncate font-ui text-xs font-bold text-[#D4AF37]">
                30s preview ended
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="flex h-10 flex-1 items-center gap-[3px] rounded-full bg-[#120d02]/60 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] focus-visible:outline-offset-4"
              onClick={(e) => {
                if (!hasAudio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const fraction = (e.clientX - rect.left) / rect.width;
                seek(fraction * duration);
              }}
              aria-label="Seek within sample preview"
            >
              {waveformBars.map((height, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-colors ${
                    i < activeBarIndex ? 'bg-[#D4AF37]' : 'bg-[#fff8df]/22'
                  }`}
                  style={{ height: `${height}%` }}
                  aria-hidden="true"
                />
              ))}
            </button>
          )}

        </div>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <div className="hidden items-center gap-2 2xl:flex">
            <label className="sr-only" htmlFor="player-volume">
              Volume
            </label>
            <span className="material-symbols-outlined text-lg text-[#d9bf62]/80" aria-hidden="true">
              {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
            </span>
            <input
              id="player-volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 cursor-pointer accent-[#D4AF37]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsHidden(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#d9bf62]/80 transition-colors hover:bg-[#D4AF37]/10 hover:text-[#fff8df]"
            aria-label="Hide music player"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsHidden(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#d9bf62]/80 transition-colors hover:bg-[#D4AF37]/10 hover:text-[#fff8df] md:hidden"
          aria-label="Hide music player"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            close
          </span>
        </button>
      </div>
    </div>
  );
};

export default PersistentPlayer;
