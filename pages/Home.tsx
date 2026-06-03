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
    visual: 'parents',
    tone: 'bg-sage-pale text-sage-dark',
    eyebrow: 'For the ones who raised you',
    caption: 'Gratitude, birthdays, legacy, prayers, and the memories that shaped home.',
  },
  {
    label: 'Friends & Loved Ones',
    slug: 'friends-loved-ones',
    visual: 'loved_ones',
    tone: 'bg-mustard-pale text-[#6F521F]',
    eyebrow: 'For your chosen circle',
    caption: 'Inside jokes, loyalty, celebration, encouragement, and shared history.',
  },
  {
    label: 'Partner',
    slug: 'partner',
    visual: 'partner',
    tone: 'bg-terracotta-pale text-terracotta-dark',
    eyebrow: 'For romantic stories',
    caption: 'Anniversaries, proposals, Valentine moments, apologies, and devotion.',
  },
  {
    label: 'Yourself',
    slug: 'yourself',
    visual: 'yourself',
    tone: 'bg-[#F4EADB] text-ink-soft',
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

const PeoplePortrait: React.FC<{ variant: string }> = ({ variant }) => {
  const head = (cx: number, cy: number, r = 16, opacity = 0.9) => (
    <circle cx={cx} cy={cy} r={r} fill="currentColor" opacity={opacity} />
  );
  const body = (d: string, opacity = 0.18) => (
    <path d={d} fill="currentColor" opacity={opacity} />
  );
  const line = (d: string, opacity = 0.28) => (
    <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity={opacity} />
  );

  let portrait: React.ReactNode;
  switch (variant) {
    case 'parents':
      portrait = (
        <>
          {head(72, 62, 17, 0.82)}
          {head(126, 62, 17)}
          {head(100, 90, 12, 0.72)}
          {body('M38 132c8-33 27-50 56-50s48 17 56 50H38Z')}
          {body('M75 132c5-24 17-37 34-37s29 13 34 37H75Z', 0.14)}
          {line('M62 43c10-14 28-14 39 0M111 43c10-14 28-14 39 0', 0.26)}
          {line('M78 103c15 12 29 12 44 0', 0.34)}
        </>
      );
      break;
    case 'loved_ones':
      portrait = (
        <>
          {head(62, 72, 13, 0.7)}
          {head(92, 58, 16)}
          {head(122, 68, 14, 0.78)}
          {head(145, 82, 11, 0.62)}
          {body('M35 134c9-34 31-52 65-52s56 18 65 52H35Z')}
          {line('M58 102c27 20 58 20 84 0', 0.32)}
          <path d="M100 112c-7-8-20-8-20 4 0 12 20 22 20 22s20-10 20-22c0-12-13-12-20-4Z" fill="currentColor" opacity="0.17" />
        </>
      );
      break;
    case 'partner':
      portrait = (
        <>
          {head(80, 64, 16)}
          {head(120, 64, 16, 0.78)}
          {body('M50 128c10-28 30-42 58-42s48 14 58 42H50Z')}
          {line('M94 94c8 8 20 8 28 0', 0.45)}
          <path d="M100 112c-7-8-20-8-20 4 0 12 20 22 20 22s20-10 20-22c0-12-13-12-20-4Z" fill="currentColor" opacity="0.2" />
        </>
      );
      break;
    case 'mother':
      portrait = (
        <>
          {head(96, 58, 18)}
          {body('M52 132c7-36 26-55 50-55s43 19 50 55H52Z')}
          {head(126, 94, 12, 0.62)}
          {body('M106 132c4-22 16-32 30-32s26 10 30 32h-60Z', 0.16)}
          {line('M72 44c16-18 48-18 64 0', 0.3)}
        </>
      );
      break;
    case 'father':
      portrait = (
        <>
          {head(100, 58, 18)}
          {body('M42 132c11-33 32-50 58-50s47 17 58 50H42Z')}
          {line('M78 84h44', 0.35)}
          {line('M72 108c18 10 38 10 56 0', 0.24)}
        </>
      );
      break;
    case 'children':
      portrait = (
        <>
          {head(78, 70, 13)}
          {head(104, 58, 15, 0.78)}
          {head(130, 72, 13, 0.7)}
          {body('M48 132c6-26 20-40 38-40s32 14 38 40H48Z')}
          {body('M84 132c6-31 21-46 42-46s36 15 42 46H84Z', 0.14)}
          {line('M70 48l-8-10M136 50l9-10M104 36v-13', 0.28)}
        </>
      );
      break;
    case 'friend':
      portrait = (
        <>
          {head(76, 62, 16)}
          {head(124, 62, 16, 0.78)}
          {body('M42 132c10-30 29-45 56-45s46 15 56 45H42Z')}
          {line('M82 94c12 12 24 12 36 0', 0.4)}
          {line('M62 96c16 14 60 14 76 0', 0.18)}
        </>
      );
      break;
    case 'sibling':
      portrait = (
        <>
          {head(86, 62, 16)}
          {head(118, 78, 14, 0.76)}
          {body('M54 132c8-31 25-48 52-48s44 17 52 48H54Z')}
          {line('M72 98c20 14 38 14 58 0', 0.32)}
          {line('M82 40c13-10 31-10 44 0', 0.22)}
        </>
      );
      break;
    case 'yourself':
      portrait = (
        <>
          {head(100, 70, 20)}
          {body('M54 134c9-34 26-51 46-51s37 17 46 51H54Z')}
          {line('M100 34V20M74 44 64 32M126 44l10-12M66 82H50M134 82h16', 0.3)}
          <circle cx="100" cy="72" r="44" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.16" />
        </>
      );
      break;
    default:
      portrait = (
        <>
          {head(75, 70, 13)}
          {head(103, 58, 16, 0.84)}
          {head(131, 72, 13, 0.68)}
          {body('M42 134c8-33 28-50 58-50s50 17 58 50H42Z')}
          {line('M60 104c24 18 56 18 80 0', 0.28)}
          <circle cx="151" cy="43" r="7" fill="currentColor" opacity="0.2" />
        </>
      );
  }

  return (
    <svg viewBox="0 0 200 160" className="h-full w-full" role="img" aria-hidden="true">
      <rect x="18" y="18" width="164" height="124" rx="28" fill="currentColor" opacity="0.07" />
      <circle cx="100" cy="76" r="58" fill="currentColor" opacity="0.06" />
      {portrait}
    </svg>
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
                className="group flex min-h-[360px] flex-col rounded-2xl border border-cream/15 bg-cream/10 p-4 transition-colors hover:bg-cream hover:text-ink"
              >
                <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl ${item.tone}`}>
                  <PeoplePortrait variant={item.visual} />
                </div>
                <p className="mt-5 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-cream/55 group-hover:text-ink-muted">
                  {item.eyebrow}
                </p>
                <h3 className="mt-1 font-headline text-3xl italic leading-none">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-cream/70 group-hover:text-ink-soft">
                  {item.caption}
                </p>
                <span className="mt-auto pt-6 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-sage-soft group-hover:text-terracotta">
                  Start this brief
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
