import React, { useState } from 'react';
import { usePlayer } from '../contexts/PlayerContext';

const Library: React.FC = () => {
  const { songs, isSongsLoading, songsError, reloadSongs, playSong, activeSong, isPlaying } =
    usePlayer();
  const [filter, setFilter] = useState('All Stories');

  const categories = ['All Stories', ...new Set(songs.flatMap((s) => s.tags || []))];

  const filteredSongs =
    filter === 'All Stories' ? songs : songs.filter((s) => s.tags?.includes(filter));

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Cinematic Hero */}
      <div className="relative w-full rounded-2xl overflow-hidden mb-12 min-h-[500px] flex items-center justify-center bg-obsidian border border-obsidian/10 shadow-2xl">
        <div
          className="absolute inset-0 bg-cover bg-center z-0 opacity-40 mix-blend-luminosity"
          style={{ backgroundImage: "url('/images/Listen.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent z-10" />
        <div className="relative z-20 text-center max-w-3xl px-4 flex flex-col items-center gap-6 mt-12">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest font-display shadow-lg">
            The Collection
          </span>
          <h1 className="text-primary text-5xl sm:text-6xl md:text-7xl tracking-tighter leading-tight font-serif italic font-light drop-shadow-xl">
            The Hall of Fame
          </h1>
          <p className="text-[#e2c15a] text-lg sm:text-xl font-light max-w-2xl leading-relaxed font-body opacity-90">
            Explore real stories turned into timeless songs. From heart-warming anniversaries to
            tear-jerking memorials.
          </p>
          <button
            onClick={() => {
              if (songs.length > 0) playSong(songs[0]);
            }}
            className="flex items-center gap-2 h-12 px-8 bg-obsidian text-primary border border-primary/30 rounded-full text-sm font-bold hover:bg-primary hover:text-obsidian transition-colors font-display shadow-lg shadow-black/40 uppercase tracking-widest mt-4"
          >
            <span className="material-symbols-outlined text-[20px]">play_circle</span>
            Play All Samples
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sticky top-20 z-40 py-4 bg-background/95 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`flex h-9 shrink-0 items-center justify-center px-6 rounded-full text-xs font-bold uppercase tracking-wider transition-all font-display ${filter === cat ? 'bg-obsidian text-primary shadow-md shadow-amber-900/10 border border-obsidian' : 'bg-transparent border border-obsidian/20 text-obsidian/70 hover:text-obsidian hover:border-obsidian/50'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSongs.map((song, i) => {
          const isCurrent = activeSong?.id === song.id;
          return (
            <div
              key={`${song.id}-${i}`}
              className={`group relative rounded-xl overflow-hidden bg-background-surface shadow-[0_4px_20px_rgba(36,26,0,0.04)] border transition-all hover:shadow-[0_8px_30px_rgba(36,26,0,0.08)] cursor-pointer ${isCurrent ? 'border-obsidian ring-1 ring-obsidian/10' : 'border-obsidian/10 hover:border-obsidian/30'}`}
              onClick={() => playSong(song)}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <img
                  src={song.coverUrl}
                  alt={song.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-obsidian/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <button className="w-16 h-16 rounded-full bg-primary text-obsidian flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-black/40">
                    <span className="material-symbols-outlined text-4xl ml-1">
                      {isCurrent && isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                  </button>
                </div>
                {!song.audioUrl && (
                  <div className="absolute top-3 left-3 px-2 py-1 rounded bg-obsidian/60 backdrop-blur-md text-[10px] text-primary font-bold uppercase tracking-widest border border-primary/20 shadow-sm">
                    Sample Only
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-obsidian via-obsidian/80 to-transparent pt-12">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-primary/90 text-[10px] font-bold uppercase tracking-widest mb-1 font-display">
                      {song.tags?.[0] || 'Original'}
                    </p>
                    <h3 className="text-white text-xl font-medium leading-tight font-serif italic">
                      {song.title}
                    </h3>
                    <p className="text-white/70 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 font-body">
                      Commissioned for {song.artist}
                    </p>
                  </div>
                  <span className="text-primary text-[10px] font-mono bg-obsidian/50 px-2 py-1 rounded backdrop-blur-md border border-primary/20">
                    {song.duration}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isSongsLoading && songs.length === 0 && (
        <div className="text-center py-20 text-[#A08B74]">
          <span className="material-symbols-outlined text-4xl mb-4 block">library_music</span>
          <p className="text-lg font-display">Loading songs...</p>
        </div>
      )}

      {songsError && !isSongsLoading && (
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-red-700">
          <span className="material-symbols-outlined mb-2 block text-3xl" aria-hidden="true">
            cloud_off
          </span>
          <p className="font-display text-lg font-bold">Songs could not load</p>
          <p className="mt-1 text-sm">{songsError}</p>
          <button
            type="button"
            onClick={reloadSongs}
            className="mt-4 rounded-full bg-obsidian px-5 py-2 text-xs font-bold uppercase tracking-widest text-primary"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default Library;
