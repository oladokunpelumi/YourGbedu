import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import FAQ from '../components/FAQ';

// Sound toggle for the music video
const SoundToggleVideo: React.FC = () => {
  const [muted, setMuted] = useState(true);
  const toggle = useCallback(() => {
    const video = document.querySelector<HTMLVideoElement>('video[data-mv]');
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);
  return (
    <button
      onClick={toggle}
      className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-label uppercase tracking-wider hover:bg-black/70 transition-colors"
    >
      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
        {muted ? 'volume_off' : 'volume_up'}
      </span>
      {muted ? 'Tap for Sound' : 'Mute'}
    </button>
  );
};

const Home: React.FC = () => {
  const {
    songs,
    isSongsLoading,
    songsError,
    reloadSongs,
    activeSong,
    playSong,
    togglePlay,
    isPlaying,
  } = usePlayer();

  // Scroll-reveal: stagger curator cards as they enter the viewport
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealRefs.current.forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col">
      {/* ── Hero Section: Cinematic Royal Gold ─────────────────────────────── */}
      <section className="relative md:min-h-[95vh] flex items-start md:items-center px-4 sm:px-6 lg:px-12 pt-28 pb-16 md:pt-24 md:pb-0 overflow-hidden bg-gradient-to-br from-[#D4AF37] via-[#e2c15a] to-[#D4AF37]">
        <div className="max-w-[1920px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 z-10 md:pt-10">
          <div className="col-span-1 md:col-span-7 flex flex-col justify-center text-center md:text-left z-20">
            <span className="font-label uppercase tracking-[0.2em] text-sm md:text-base text-obsidian font-semibold mb-6 block">
              #1 Custom Song Platform Across all Genres
            </span>
            <h1 className="font-headline italic text-6xl md:text-8xl lg:text-[10rem] text-obsidian leading-[0.9] mb-8 lg:-ml-2">
              Hear what <br />
              your heart <br />
              <span className="opacity-80">meant to say.</span>
            </h1>
            <p className="font-body text-xl md:text-2xl text-obsidian/80 max-w-xl mb-12 leading-relaxed mx-auto md:mx-0">
              Some feelings are too big for words. Tell us your story, and we’ll compose your royal
              masterpiece.
            </p>
            <div>
              <Link
                to="/create"
                className="inline-block bg-obsidian text-primary px-12 py-5 font-label uppercase tracking-widest text-sm rounded-full hover:scale-[1.02] transition-all duration-500 shadow-[0_6px_18px_rgba(36,26,0,0.14)]"
              >
                Create Your Song
              </Link>
            </div>
          </div>
          {/* Hero Image (hidden on small screens, huge on desktop) */}
          <div className="hidden md:block col-span-5 relative h-[600px] lg:h-[750px] -mt-10 lg:-mt-20">
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#D4AF37] to-transparent z-10"></div>
            <img
              src="/images/Homepage.png"
              alt="Cinematic Hero"
              className="w-full h-full object-cover rounded-2xl shadow-2xl sepia-[.2] contrast-125 hover:sepia-0 transition-all duration-1000"
            />
          </div>
        </div>

        {/* Ornamental Elements */}
        <div className="absolute -top-24 -right-24 w-[500px] h-[500px] bg-white/10 blur-[120px] rounded-full point-events-none"></div>
        <div className="absolute bottom-10 -left-20 w-[400px] h-[400px] bg-obsidian/5 blur-[100px] rounded-full pointer-events-none"></div>
      </section>

      {/* ── Music Video: Real Song. Real Story. ─────────────────────────────── */}
      <section className="py-20 sm:py-28 px-6 sm:px-12 bg-obsidian overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <span className="font-label uppercase tracking-[0.3em] text-xs text-primary/50 mb-3 block">
              Real Song. Real Story.
            </span>
            <h2 className="font-headline italic text-4xl md:text-6xl text-primary leading-[0.95] mb-4">
              Hear it come to life.
            </h2>
            <p className="font-body text-primary/60 text-base max-w-lg mx-auto">
              A real couple. A real anniversary. A song made just for them — by YourGbedu.
            </p>
          </div>

          {/* Video container — Instagram Reels style on mobile, cinematic on desktop */}
          <div className="relative mx-auto w-full max-w-sm md:max-w-3xl">
            <div className="relative rounded-2xl overflow-hidden bg-black shadow-[0_0_80px_rgba(212,175,55,0.15)] ring-1 ring-primary/10 group">
              <video
                data-mv
                src="/musics/Music%20Video/Anniversary_Music_Video.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="w-full aspect-[9/16] md:aspect-video object-cover"
              />

              {/* Sound toggle overlay */}
              <SoundToggleVideo />

              {/* Bottom label */}
              <div className="absolute bottom-0 left-0 right-0 px-5 py-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <p className="font-headline italic text-white text-xl">Anniversary</p>
                <p className="font-label text-xs uppercase tracking-widest text-white/60">Afro-Beats • YourGbedu Original</p>
              </div>
            </div>
          </div>

          {/* CTA below video */}
          <div className="text-center mt-10">
            <Link
              to="/create"
              className="inline-block bg-primary text-obsidian px-12 py-4 font-label uppercase tracking-widest text-sm rounded-full hover:scale-[1.02] transition-all duration-300 shadow-[0_6px_18px_rgba(212,175,55,0.18)]"
            >
              Create Your Song
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features Section: The Digital Curator ────────────────────────────── */}
      <section className="py-20 sm:py-28 px-6 sm:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 text-center md:text-left">
            <h2 className="font-headline italic text-4xl md:text-5xl max-w-2xl text-obsidian leading-[0.95]">
              How YourGbedu Works
            </h2>
          </div>

          {/* Staggered process cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 lg:gap-12">
            {[
              {
                id: '01',
                title: 'Fill out the form',
                desc: 'Pick your genre & fill in your story. Tell us everything — the more detail, the more personal the song.',
              },
              {
                id: '02',
                title: 'We Create Your Song',
                desc: 'Our team crafts a custom track just for you — composed, recorded, and mixed with royal precision.',
              },
              {
                id: '03',
                title: 'Delivered in 48 Hours via Email',
                desc: 'Your mastered song lands in your inbox, ready to share with the people who matter most.',
              },
            ].map((step, idx) => (
              <div
                key={step.id}
                ref={(el) => { revealRefs.current[idx] = el; }}
                style={{ transitionDelay: `${idx * 120}ms` }}
                className={`reveal group ${idx === 1 ? 'md:mt-10' : ''}`}
              >
                {/* Mobile: compact horizontal card */}
                <div className="flex md:hidden items-center gap-4 bg-obsidian/5 rounded-2xl ring-1 ring-obsidian/10 px-5 py-4 group-hover:bg-obsidian/8 transition-colors">
                  <span className="font-headline italic text-4xl text-obsidian/20 leading-none w-10 flex-shrink-0">{step.id}</span>
                  <div>
                    <h3 className="font-headline italic text-lg text-obsidian mb-1">{step.title}</h3>
                    <p className="font-body text-obsidian/70 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </div>

                {/* Desktop: square card with spinning ring */}
                <div className="hidden md:flex flex-col space-y-5">
                  <div className="aspect-square relative overflow-hidden bg-obsidian/5 rounded-2xl shadow-md ring-1 ring-obsidian/10 flex items-center justify-center p-6 group-hover:-translate-y-2 transition-transform duration-700">
                    <h4 className="absolute top-3 right-5 font-headline italic text-5xl text-obsidian/10 group-hover:text-obsidian/20 transition-colors uppercase">
                      {step.id}
                    </h4>
                    <div className="w-3/4 h-3/4 rounded-full border border-obsidian/10 animate-[spin_60s_linear_infinite] group-hover:border-obsidian/30 transition-colors"></div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <h3 className="font-headline text-2xl md:text-3xl italic text-obsidian group-hover:scale-105 transition-transform">
                        {step.title}
                      </h3>
                    </div>
                  </div>
                  <div className="max-w-sm px-1">
                    <p className="font-body text-obsidian/80 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Audio Playback / Listening Room Fused ──────────────────────────── */}
      <section className="py-32 sm:py-40 bg-obsidian text-primary overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 relative z-10">
          <div className="text-center mb-16">
            <h2 className="font-headline italic text-5xl md:text-7xl mb-12">Check Out Our Catalogue</h2>
          </div>

          {/* Fluid Sound Visualization embedded centrally */}
          <div className="h-64 flex flex-col items-center justify-center relative mb-24 max-w-4xl mx-auto">
            <svg
              className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
              viewBox="0 0 800 200"
              preserveAspectRatio="none"
            >
              <path
                className={`fluid-thread stroke-primary transition-all duration-[3000ms] ${isPlaying ? 'opacity-100 scale-y-110' : 'opacity-50'}`}
                d="M 0 100 Q 200 20 400 100 T 800 100"
                fill="none"
                strokeWidth="2"
              />
              <path
                className={`fluid-thread stroke-primary/40 transition-all duration-[2000ms] ${isPlaying ? 'opacity-100 -scale-y-125' : 'opacity-40'}`}
                d="M 0 100 Q 200 180 400 100 T 800 100"
                fill="none"
                strokeWidth="1"
              />
              <path
                className={`fluid-thread stroke-primary/20 transition-all duration-[4000ms] ${isPlaying ? 'opacity-100 scale-y-150' : 'opacity-20'}`}
                d="M 0 100 Q 150 50 400 100 T 800 100"
                fill="none"
                strokeWidth="3"
              />
            </svg>

            <button
              onClick={togglePlay}
              className={`relative z-20 w-32 h-32 rounded-full bg-primary flex items-center justify-center shadow-[0_8px_28px_rgba(212,175,55,0.22)] transition-all duration-500 ${isPlaying ? 'scale-105 shadow-[0_10px_34px_rgba(212,175,55,0.28)]' : 'hover:scale-[1.02]'}`}
            >
              <span
                className="material-symbols-outlined text-obsidian text-6xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            <div className="absolute -bottom-16 flex flex-col items-center space-y-3 pb-8">
              <p className="font-headline italic text-3xl md:text-4xl">
                {activeSong ? activeSong.title : 'Select a frequency'}
              </p>
              <p className="font-label text-xs uppercase tracking-widest text-primary/70">
                {activeSong ? `${activeSong.genre} • ${activeSong.duration}` : 'Idle'}
              </p>
            </div>
          </div>

          {/* The Grid of Tracks */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-40">
            {songs.map((song) => (
              <div
                key={song.id}
                className={`flex items-center gap-6 p-6 rounded-2xl cursor-pointer transition-all duration-500 border border-primary/10 ${activeSong?.id === song.id ? 'bg-primary/10 border-primary/30' : 'bg-transparent hover:bg-primary/5'}`}
                onClick={() => playSong(song)}
              >
                <div className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden shadow-obsidian">
                  <img
                    src={song.coverUrl}
                    alt={song.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-obsidian/40 flex items-center justify-center">
                    {activeSong?.id === song.id && isPlaying ? (
                      <span className="material-symbols-outlined text-primary text-3xl animate-pulse">
                        equalizer
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-primary text-3xl opacity-0 group-hover:opacity-100 transition-opacity">
                        play_circle
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-label text-primary/60 uppercase tracking-widest mb-1">
                    {song.genre}
                  </span>
                  <h4 className="text-xl font-headline italic text-primary mb-2 line-clamp-1">
                    {song.title}
                  </h4>
                  <p className="text-sm font-body text-primary/70 line-clamp-2 leading-relaxed">
                    {song.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {isSongsLoading && songs.length === 0 && (
            <div className="mt-24 text-center text-primary/70">
              <span className="material-symbols-outlined mb-3 block text-4xl" aria-hidden="true">
                library_music
              </span>
              <p className="font-display text-lg">Loading songs...</p>
            </div>
          )}

          {songsError && !isSongsLoading && (
            <div className="mx-auto mt-24 max-w-xl rounded-2xl border border-primary/20 bg-primary/10 px-6 py-5 text-center text-primary">
              <span className="material-symbols-outlined mb-2 block text-3xl" aria-hidden="true">
                cloud_off
              </span>
              <p className="font-display text-lg font-bold">Catalogue unavailable</p>
              <p className="mt-1 text-sm text-primary/75">{songsError}</p>
              <button
                type="button"
                onClick={reloadSongs}
                className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-widest text-obsidian"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Texture overlay for the section */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        ></div>
      </section>

      {/* ── A Song for Everyone ─────────────────────────────────────────────── */}
      <section className="py-32 sm:py-40 px-6 sm:px-12 bg-obsidian">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="font-headline italic text-5xl md:text-7xl text-primary leading-[0.95] mb-4">
              A Song for Everyone
            </h2>
            <p className="font-body text-primary/60 text-lg max-w-xl mx-auto">
              Pick who it's for and we'll craft something they'll never forget.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { label: 'For Your Partner',   icon: 'favorite',         gradient: 'from-[#3d2e00] to-[#241a00]' },
              { label: 'For Your Children',  icon: 'child_care',       gradient: 'from-[#2a1f00] to-[#1a1400]' },
              { label: 'For Your Father',    icon: 'man',              gradient: 'from-[#332500] to-[#241a00]' },
              { label: 'For Your Mother',    icon: 'woman',            gradient: 'from-[#3a2800] to-[#241a00]' },
              { label: 'For Your Sibling',   icon: 'people',           gradient: 'from-[#2e2200] to-[#1a1400]' },
              { label: 'For Your Friend',    icon: 'group',            gradient: 'from-[#3d2e00] to-[#241a00]' },
              { label: 'For Yourself',       icon: 'self_improvement', gradient: 'from-[#241a00] to-[#0d0a00]' },
              { label: 'For Anyone Special', icon: 'star',             gradient: 'from-[#2a1f00] to-[#241a00]' },
            ].map((item) => (
              <Link
                key={item.label}
                to="/create"
                className={`group relative aspect-square rounded-2xl bg-gradient-to-br ${item.gradient} ring-1 ring-primary/10 overflow-hidden flex flex-col justify-between p-5 hover:ring-primary/30 hover:scale-[1.03] transition-all duration-500`}
              >
                {/* Icon centered */}
                <div className="flex-1 flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-primary/40 group-hover:text-primary/70 transition-colors duration-500"
                    style={{ fontSize: '72px', fontVariationSettings: "'FILL' 1" }}
                  >
                    {item.icon}
                  </span>
                </div>
                {/* Label bottom-left */}
                <p className="font-headline italic text-lg md:text-xl text-primary leading-tight">
                  {item.label}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Browse by Genre ─────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-6 sm:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="font-headline italic text-5xl md:text-6xl text-obsidian leading-[0.95] mb-4">
              Every Genre. One Platform.
            </h2>
            <p className="font-body text-obsidian/60 text-lg max-w-xl mx-auto">
              Whatever sound moves you — we'll make it personal.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: 'Afro-Beats',  icon: 'music_note',               desc: 'Vibrant & Rhythmic' },
              { name: 'Afro-R&B',   icon: 'favorite',                 desc: 'Romantic & Groovy' },
              { name: 'Afro-House',  icon: 'speaker',                  desc: 'Energetic & Electric' },
              { name: 'Afro-Reggae', icon: 'queue_music',              desc: 'Island Vibes' },
              { name: 'Gospel',      icon: 'volunteer_activism',       desc: 'Uplifting & Spiritual' },
              { name: 'R&B',         icon: 'radio',                    desc: 'Smooth & Soulful' },
              { name: 'Hip-Hop',     icon: 'mic',                      desc: 'Bold & Rhythmic' },
              { name: 'Pop',         icon: 'album',                    desc: 'Catchy & Bright' },
              { name: 'Soul',        icon: 'sentiment_very_satisfied', desc: 'Deep & Emotive' },
              { name: 'Highlife',    icon: 'celebration',              desc: 'Joyful & Cultural' },
            ].map((genre) => (
              <Link
                key={genre.name}
                to="/create"
                className="group flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-obsidian/5 ring-1 ring-obsidian/10 hover:bg-obsidian hover:ring-obsidian transition-all duration-400 hover:-translate-y-1"
              >
                <span
                  className="material-symbols-outlined text-obsidian/50 group-hover:text-primary transition-colors duration-400"
                  style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}
                >
                  {genre.icon}
                </span>
                <div>
                  <p className="font-headline italic text-obsidian group-hover:text-primary text-base leading-tight transition-colors duration-400">
                    {genre.name}
                  </p>
                  <p className="font-label text-[10px] uppercase tracking-widest text-obsidian/40 group-hover:text-primary/60 mt-1 transition-colors duration-400">
                    {genre.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section (Adapting to Royal Gold) */}
      <div className="bg-surface">
        <FAQ />
      </div>

      {/* ── CTA Section: The Royal Finale ──────────────────────────────────── */}
      <section className="py-40 px-6 sm:px-12 bg-surface">
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
          <h2 className="font-headline italic text-5xl md:text-7xl lg:text-8xl mb-12 leading-[1.1] text-obsidian">
            Your story is waiting to be heard.
          </h2>
          <Link
            to="/create"
            className="bg-obsidian text-primary px-16 py-6 font-label uppercase tracking-[0.2em] text-sm rounded-full shadow-[0_8px_24px_rgba(36,26,0,0.14)] hover:-translate-y-1 transition-all duration-500"
          >
            Create Your Song
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
