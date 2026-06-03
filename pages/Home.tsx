import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import FAQ from '../components/FAQ';

const PROCESS_STEPS = [
  {
    id: '01',
    title: 'Tell us the heart of it',
    desc: 'Share who the song is for, the occasion, the memories, and the words you want them to feel.',
  },
  {
    id: '02',
    title: 'We shape the record',
    desc: 'Your brief becomes lyrics, melody, arrangement, vocals, and a final master built around the story.',
  },
  {
    id: '03',
    title: 'Receive it ready to share',
    desc: 'Your finished song arrives by email with a private tracker and a polished file for the moment.',
  },
];

const RELATIONSHIPS = [
  {
    label: 'Parents',
    slug: 'parents',
    cover: '/images/relationship-covers/parents.jpg',
    coverAlt: 'Warm portrait representing a custom song for parents',
    coverPosition: 'object-center',
    accentLine: 'bg-sage-soft',
    borderClass: 'border-sage-soft/30 hover:border-sage-soft focus-visible:border-sage-soft',
    washClass: 'bg-sage/20',
    eyebrowClass: 'text-sage-soft group-hover:text-sage-dark group-focus-visible:text-sage-dark',
    ctaClass: 'text-sage-soft group-hover:text-sage-dark group-focus-visible:text-sage-dark',
    eyebrow: 'For the ones who raised you',
    caption: 'Gratitude, birthdays, legacy, prayers, and the memories that shaped home.',
  },
  {
    label: 'Friends & Loved Ones',
    slug: 'friends-loved-ones',
    cover: '/images/relationship-covers/friends-loved-ones.jpg',
    coverAlt: 'Warm portrait representing a custom song for friends and loved ones',
    coverPosition: 'object-center',
    accentLine: 'bg-mustard-soft',
    borderClass: 'border-mustard-soft/35 hover:border-mustard-soft focus-visible:border-mustard-soft',
    washClass: 'bg-mustard/20',
    eyebrowClass: 'text-mustard-soft group-hover:text-[#6F521F] group-focus-visible:text-[#6F521F]',
    ctaClass: 'text-mustard-soft group-hover:text-[#6F521F] group-focus-visible:text-[#6F521F]',
    eyebrow: 'For your chosen circle',
    caption: 'Inside jokes, loyalty, celebration, encouragement, and shared history.',
  },
  {
    label: 'Partner',
    slug: 'partner',
    cover: '/images/relationship-covers/partner.jpg',
    coverAlt: 'Warm portrait representing a custom song for a partner',
    coverPosition: 'object-center',
    accentLine: 'bg-terracotta-soft',
    borderClass: 'border-terracotta-soft/35 hover:border-terracotta-soft focus-visible:border-terracotta-soft',
    washClass: 'bg-terracotta/20',
    eyebrowClass: 'text-terracotta-soft group-hover:text-terracotta-dark group-focus-visible:text-terracotta-dark',
    ctaClass: 'text-terracotta-soft group-hover:text-terracotta-dark group-focus-visible:text-terracotta-dark',
    eyebrow: 'For romantic stories',
    caption: 'Anniversaries, proposals, Valentine moments, apologies, and devotion.',
  },
  {
    label: 'Yourself',
    slug: 'yourself',
    cover: '/images/relationship-covers/yourself.jpg',
    coverAlt: 'Warm portrait representing a custom song for yourself',
    coverPosition: 'object-center',
    accentLine: 'bg-line-strong',
    borderClass: 'border-line-strong/45 hover:border-line-strong focus-visible:border-line-strong',
    washClass: 'bg-cream/20',
    eyebrowClass: 'text-cream/70 group-hover:text-ink-muted group-focus-visible:text-ink-muted',
    ctaClass: 'text-cream/80 group-hover:text-ink group-focus-visible:text-ink',
    eyebrow: 'For your own chapter',
    caption: 'Healing, courage, self-belief, new seasons, and words you need to hear.',
  },
];

const GENRES = [
  ['Afro-Beats', 'Vibrant and rhythmic'],
  ['Afro-R&B', 'Romantic and groovy'],
  ['Afro-House', 'Energetic and electric'],
  ['Afro-Reggae', 'Warm island pulse'],
  ['Gospel', 'Uplifting and spiritual'],
  ['R&B', 'Smooth and soulful'],
  ['Hip-Hop', 'Bold and rhythmic'],
  ['Highlife', 'Joyful and cultural'],
];

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
      className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-cream/20 bg-ink/70 px-4 py-2 font-label text-xs font-bold uppercase tracking-[0.14em] text-cream backdrop-blur transition-colors hover:bg-ink"
    >
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        {muted ? 'volume_off' : 'volume_up'}
      </span>
      {muted ? 'Sound' : 'Mute'}
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
      { threshold: 0.14 }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="editorial-shell flex flex-col">
      <section className="flex min-h-[100svh] items-center px-5 pb-10 pt-20 sm:px-8 sm:pb-12 sm:pt-24 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center lg:gap-10">
          <div>
            <p className="editorial-kicker mb-4">Custom songs across every occasion</p>
            <h1 className="font-headline text-6xl font-medium leading-[0.92] text-ink sm:text-7xl lg:text-8xl">
              Hear what your heart <em className="text-terracotta">meant to say.</em>
            </h1>
            <p className="mt-6 max-w-2xl font-body text-lg leading-8 text-ink-soft sm:text-xl">
              Tell us the story, the person, and the moment. YourGbedu turns it into a finished song
              with lyrics, vocals, production, and a delivery flow that still feels personal.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/create"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
              >
                Create your song
              </Link>
              <Link
                to="/library"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-cream px-8 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
              >
                Hear the catalogue
              </Link>
            </div>

            <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3 border-y border-line py-4">
              {[
                ['48h', 'built & delivered'],
                ['12+', 'occasion arcs'],
                ['100%', 'story led'],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="font-headline text-4xl font-semibold leading-none text-ink">
                    {value}
                  </p>
                  <p className="mt-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="editorial-panel overflow-hidden p-3">
              <img
                src="/images/Homepage.jpg"
                alt="A YourGbedu artist listening through a finished custom song"
                className="aspect-[4/5] w-full rounded-2xl object-cover sepia-[0.12] lg:aspect-auto lg:h-[52svh] lg:max-h-[620px] lg:min-h-[420px]"
              />
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t border-line px-2 py-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mustard-pale text-mustard">
                  <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                    graphic_eq
                  </span>
                </div>
                <div>
                  <p className="font-headline text-2xl italic leading-none text-ink">
                    Real stories, produced like records.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    Built for birthdays, anniversaries, apologies, memorials, proposals, and the
                    quiet moments that deserve music too.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-terracotta px-5 py-20 text-cream sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-terracotta-soft">
              Real song. Real story.
            </p>
            <h2 className="mt-4 font-headline text-5xl font-medium leading-none sm:text-6xl">
              Hear it come <em className="text-mustard-soft">to life.</em>
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-cream/75">
              A real anniversary became a polished song. The visual language stays warm and
              grounded, letting the music carry the emotion.
            </p>
            <Link
              to="/create"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-cream px-7 py-3 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-cream"
            >
              Start your brief
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-[1.25rem] border border-cream/15 bg-ink shadow-[0_20px_50px_rgba(31,27,20,0.22)]">
            <video
              data-mv
              src="/musics/Music%20Video/Anniversary_Music_Video.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full object-cover sm:aspect-video"
            />
            <SoundToggleVideo />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/70 to-transparent px-5 pb-5 pt-14">
              <p className="font-headline text-2xl italic text-cream">Anniversary</p>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-cream/60">
                Afro-Beats sample
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ivory px-5 py-20 sm:px-8 lg:px-12 lg:py-28" id="how">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <p className="editorial-kicker mb-4">How YourGbedu works</p>
            <h2 className="font-headline text-5xl font-medium leading-none text-ink sm:text-6xl">
              A focused brief, then a finished record.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {PROCESS_STEPS.map((step, idx) => (
              <div
                key={step.id}
                ref={(el) => {
                  revealRefs.current[idx] = el;
                }}
                className="reveal rounded-2xl border border-line bg-cream p-6 transition-transform duration-300 hover:-translate-y-1"
              >
                <p className="font-headline text-5xl italic text-terracotta/30">{step.id}</p>
                <h3 className="mt-8 font-headline text-3xl font-semibold leading-none text-ink">
                  {step.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-ink-soft">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cream px-5 py-20 sm:px-8 lg:px-12 lg:py-28" id="catalogue">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="editorial-kicker mb-4">The listening room</p>
              <h2 className="font-headline text-5xl font-medium leading-none text-ink sm:text-6xl">
                Catalogue samples without the noise.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-ink-soft lg:justify-self-end">
              Browse real examples, then use the floating player for a calm preview. The art leans
              into vinyl and editorial cover treatments instead of generic interface decoration.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="rounded-[1.4rem] bg-ink p-7 text-cream">
              <div className="mx-auto flex aspect-square max-w-[280px] items-center justify-center rounded-full border border-cream/10 bg-[radial-gradient(circle,#3a3123_0_17%,#15120d_18%_28%,#2a2218_29%_36%,#100d09_37%_100%)] shadow-[inset_0_0_0_16px_rgba(255,253,246,0.03)]">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-mustard text-ink transition-transform hover:scale-105"
                  aria-label={isPlaying ? 'Pause catalogue sample' : 'Play catalogue sample'}
                >
                  <span className="material-symbols-outlined text-4xl" aria-hidden="true">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
              </div>
              <p className="mt-8 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-mustard-soft">
                Now selected
              </p>
              <h3 className="mt-2 font-headline text-4xl italic leading-none text-cream">
                {activeSong?.title || 'Select a sample'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-cream/60">
                {activeSong ? `${activeSong.genre} - ${activeSong.duration}` : 'The first song will load when the catalogue is ready.'}
              </p>
            </div>

            <div className="grid gap-4">
              {songs.slice(0, 5).map((song) => {
                const isCurrent = activeSong?.id === song.id;
                return (
                  <button
                    type="button"
                    key={song.id}
                    onClick={() => playSong(song)}
                    className={`grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border p-3 text-left transition-colors ${
                      isCurrent
                        ? 'border-terracotta bg-terracotta-pale'
                        : 'border-line bg-ivory hover:border-terracotta/60 hover:bg-cream'
                    }`}
                  >
                    <img
                      src={song.coverUrl}
                      alt=""
                      loading="lazy"
                      className="h-[72px] w-[72px] rounded-xl object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                        {song.genre}
                      </span>
                      <span className="mt-1 block truncate font-headline text-2xl italic leading-none text-ink">
                        {song.title}
                      </span>
                      <span className="mt-2 line-clamp-1 block text-sm text-ink-soft">
                        {song.description}
                      </span>
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream">
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">
                        {isCurrent && isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                    </span>
                  </button>
                );
              })}

              {isSongsLoading && songs.length === 0 && (
                <div className="rounded-2xl border border-line bg-ivory p-8 text-center text-ink-muted">
                  Loading songs...
                </div>
              )}

              {songsError && !isSongsLoading && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
                  <p className="font-bold">Catalogue unavailable</p>
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

              <Link
                to="/library"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong px-7 py-3 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
              >
                Open full catalogue
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-sage px-5 py-20 text-cream sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-sage-soft">
              A song for everyone
            </p>
            <h2 className="mt-4 font-headline text-5xl font-medium leading-none sm:text-6xl">
              Four simple paths into the people you love.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {RELATIONSHIPS.map((item) => (
              <Link
                key={item.label}
                to={`/create?recipient=${item.slug}`}
                className={`group relative flex min-h-[430px] flex-col overflow-hidden rounded-2xl border bg-cream/[0.08] p-3 text-cream transition-colors duration-300 hover:bg-cream hover:text-ink focus-visible:bg-cream focus-visible:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mustard-soft motion-reduce:transition-none ${item.borderClass}`}
              >
                <span className={`absolute inset-x-5 top-0 h-1 rounded-b-full ${item.accentLine}`} aria-hidden="true" />
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-ink/20">
                  <img
                    src={item.cover}
                    alt={item.coverAlt}
                    className={`h-full w-full object-cover saturate-[0.72] contrast-[0.92] brightness-[0.9] transition-[filter,transform] duration-500 ease-out group-hover:scale-[1.035] group-hover:saturate-100 group-hover:contrast-100 group-hover:brightness-100 group-focus-visible:scale-[1.035] group-focus-visible:saturate-100 group-focus-visible:contrast-100 group-focus-visible:brightness-100 group-active:saturate-100 group-active:contrast-100 group-active:brightness-100 motion-reduce:transform-none motion-reduce:transition-none ${item.coverPosition}`}
                    loading="lazy"
                  />
                  <div
                    className={`absolute inset-0 opacity-80 transition-opacity duration-500 group-hover:opacity-0 group-focus-visible:opacity-0 group-active:opacity-0 motion-reduce:transition-none ${item.washClass}`}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/55 to-transparent"
                    aria-hidden="true"
                  />
                </div>
                <p className={`mt-5 font-label text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${item.eyebrowClass}`}>
                  {item.eyebrow}
                </p>
                <h3 className="mt-1 font-headline text-3xl italic leading-none">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-cream/70 transition-colors group-hover:text-ink-soft group-focus-visible:text-ink-soft">
                  {item.caption}
                </p>
                <span className={`mt-auto inline-flex items-center gap-2 pt-6 font-label text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${item.ctaClass}`}>
                  Start this brief
                  <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none" aria-hidden="true">
                    arrow_forward
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ivory px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="editorial-kicker mb-4">Genre palette</p>
            <h2 className="font-headline text-5xl font-medium leading-none text-ink sm:text-6xl">
              Every genre, one personal brief.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GENRES.map(([name, desc], idx) => (
              <Link
                key={name}
                to="/create"
                className={`rounded-2xl border p-5 transition-transform hover:-translate-y-1 ${
                  idx === 0
                    ? 'border-ink bg-ink text-cream'
                    : 'border-line bg-cream text-ink hover:border-terracotta'
                }`}
              >
                <p className="font-headline text-3xl italic leading-none">{name}</p>
                <p className={`mt-3 font-label text-[10px] font-bold uppercase tracking-[0.14em] ${idx === 0 ? 'text-mustard-soft' : 'text-ink-muted'}`}>
                  {desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <FAQ />

      <section className="bg-terracotta px-5 py-24 text-center text-cream sm:px-8 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-headline text-6xl font-medium leading-none sm:text-7xl">
            Your story is waiting <em className="text-mustard-soft">to be heard.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-cream/75">
            A few thoughtful answers are enough for our producers to begin shaping something
            specific, emotional, and ready for the person you love.
          </p>
          <Link
            to="/create"
            className="mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-cream px-8 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            Create your song
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
