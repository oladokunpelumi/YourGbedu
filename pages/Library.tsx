import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';

const Library: React.FC = () => {
  const { songs, isSongsLoading, songsError, reloadSongs, playSong, activeSong, isPlaying } =
    usePlayer();
  const [filter, setFilter] = useState('All Stories');

  const categories = ['All Stories', ...new Set(songs.flatMap((s) => s.tags || []))];
  const filteredSongs =
    filter === 'All Stories' ? songs : songs.filter((s) => s.tags?.includes(filter));

  return (
    <div className="bg-ivory px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-8 rounded-[1.5rem] border border-line bg-cream p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
          <div className="flex flex-col justify-end">
            <p className="editorial-kicker mb-4">The collection</p>
            <h1 className="font-headline text-6xl font-medium leading-none text-ink sm:text-7xl">
              The Hall of <em className="text-terracotta">Fame</em>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">
              Real stories turned into finished songs, from heart-warming anniversaries to tender
              memorials and celebratory family moments.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (songs.length > 0) playSong(songs[0]);
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 py-3 font-label text-xs font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  play_arrow
                </span>
                Play all samples
              </button>
              <Link
                to="/create"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong px-7 py-3 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
              >
                Create your song
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-ink">
            <img
              src="/images/Listen.jpg"
              alt="A listening-room scene for YourGbedu catalogue samples"
              className="aspect-[4/3] w-full object-cover opacity-75 sepia-[0.14] mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-cream/15 bg-ink/70 p-4 text-cream backdrop-blur">
              <p className="font-headline text-3xl italic leading-none">
                Listen before you brief.
              </p>
              <p className="mt-2 text-sm leading-6 text-cream/60">
                Samples stay anchored in the floating player while you browse.
              </p>
            </div>
          </div>
        </section>

        <div className="sticky top-16 z-30 my-8 -mx-5 border-y border-line bg-ivory/92 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`min-h-10 shrink-0 rounded-full border px-5 font-label text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                  filter === cat
                    ? 'border-ink bg-ink text-cream'
                    : 'border-line-strong bg-cream text-ink-soft hover:border-terracotta hover:text-terracotta'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredSongs.map((song) => {
            const isCurrent = activeSong?.id === song.id;
            return (
              <button
                type="button"
                key={song.id}
                className={`group overflow-hidden rounded-2xl border bg-cream text-left transition-transform hover:-translate-y-1 ${
                  isCurrent ? 'border-terracotta' : 'border-line hover:border-terracotta/70'
                }`}
                onClick={() => playSong(song)}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-ink">
                  <img
                    src={song.coverUrl}
                    alt={song.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors group-hover:bg-ink/35">
                    <span className="flex h-16 w-16 scale-90 items-center justify-center rounded-full bg-cream text-ink opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                      <span className="material-symbols-outlined text-4xl" aria-hidden="true">
                        {isCurrent && isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                    </span>
                  </div>
                  {!song.audioUrl && (
                    <span className="absolute left-3 top-3 rounded-full border border-cream/20 bg-ink/70 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-cream">
                      Sample only
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-terracotta">
                        {song.tags?.[0] || song.genre}
                      </p>
                      <h2 className="mt-2 truncate font-headline text-3xl italic leading-none text-ink">
                        {song.title}
                      </h2>
                    </div>
                    <span className="rounded-full bg-ivory px-3 py-1 font-mono text-[10px] text-ink-muted">
                      {song.duration}
                    </span>
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-ink-soft">
                    {song.description || `Commissioned for ${song.artist}`}
                  </p>
                </div>
              </button>
            );
          })}
        </section>

        {isSongsLoading && songs.length === 0 && (
          <div className="rounded-2xl border border-line bg-cream py-20 text-center text-ink-muted">
            Loading songs...
          </div>
        )}

        {songsError && !isSongsLoading && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-red-700">
            <p className="font-bold">Songs could not load</p>
            <p className="mt-1 text-sm">{songsError}</p>
            <button
              type="button"
              onClick={reloadSongs}
              className="mt-4 rounded-full bg-ink px-5 py-2 font-label text-xs font-bold uppercase tracking-[0.14em] text-cream"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Library;
