import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import PersistentPlayer from './components/PersistentPlayer';
import EmailCapturePopup from './components/EmailCapturePopup';
import AnalyticsConsent from './components/AnalyticsConsent';
import Home from './pages/Home';
import PaymentCancel from './pages/PaymentCancel';
import Verify from './pages/Verify';
import { Song } from './types';
import { PlayerContext, PlayerContextType } from './contexts/PlayerContext';

const CreateSong = lazy(() => import('./pages/CreateSong'));
const OrderStatus = lazy(() => import('./pages/OrderStatus'));
const Library = lazy(() => import('./pages/Library'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const Admin = lazy(() => import('./pages/Admin'));
const Checkout = lazy(() => import('./pages/Checkout'));

const PREVIEW_LIMIT_SECONDS = 30;
const DIRECT_HASH_ROUTES = new Set([
  '/admin',
  '/create',
  '/track',
  '/library',
  '/payment-success',
  '/payment-cancel',
  '/checkout',
  '/checkout/return',
  '/verify',
]);

function normalizeDirectHashRoute() {
  if (typeof window === 'undefined' || window.location.hash) return;

  const normalizedPath = window.location.pathname.replace(/\/$/, '') || '/';
  if (!DIRECT_HASH_ROUTES.has(normalizedPath)) return;

  window.history.replaceState(null, '', `/#${normalizedPath}${window.location.search}`);
}

function resolveMediaUrl(url: string) {
  return new URL(url, window.location.origin).href;
}

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin';
  const isCheckoutRoute = location.pathname.startsWith('/checkout');
  const [songs, setSongs] = useState<Song[]>([]);
  const [isSongsLoading, setIsSongsLoading] = useState(true);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewLocked, setIsPreviewLocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  const loadSongs = useCallback(async () => {
    setIsSongsLoading(true);
    setSongsError(null);

    try {
      const res = await fetch('/api/songs');
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Songs request failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Songs request returned an unexpected response.');
      }

      setSongs(data);
      setActiveSong((current) => current || data[0] || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load songs.';
      console.error('Failed to fetch songs:', err);
      setSongsError(message);
      setSongs([]);
    } finally {
      setIsSongsLoading(false);
    }
  }, []);

  // Fetch songs from API
  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  const playSong = useCallback(
    (song: Song) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (!song.audioUrl) {
        setActiveSong(song);
        audio.removeAttribute('src');
        setIsPlaying(false);
        return;
      }

      if (activeSong?.id !== song.id) {
        setActiveSong(song);
        setIsPreviewLocked(false); // reset lock when changing song
      }

      const nextSrc = resolveMediaUrl(song.audioUrl);
      if (audio.src !== nextSrc) {
        audio.src = nextSrc;
        audio.load();
      }

      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    },
    [activeSong]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !activeSong?.audioUrl) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // If src is not set, set it first
      if (!audio.src || audio.src === window.location.href) {
        if (activeSong.audioUrl) {
          audio.src = resolveMediaUrl(activeSong.audioUrl);
          audio.load();
        }
      }
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  }, [isPlaying, activeSong]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const skipNext = useCallback(() => {
    if (!activeSong || songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === activeSong.id);
    const nextIdx = (idx + 1) % songs.length;
    playSong(songs[nextIdx]);
  }, [activeSong, songs, playSong]);

  const skipPrev = useCallback(() => {
    if (!activeSong || songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === activeSong.id);
    const prevIdx = idx === 0 ? songs.length - 1 : idx - 1;
    playSong(songs[prevIdx]);
  }, [activeSong, songs, playSong]);

  // Audio element setup
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // 30-second preview limit for sample songs
      if (audio.currentTime >= PREVIEW_LIMIT_SECONDS) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
        setIsPreviewLocked(true);
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onError = () => {
      setIsPlaying(false);
      console.error('Audio failed to load:', audio.currentSrc || audio.src);
    };
    const onEnded = () => {
      setIsPlaying(false);
      // Auto-advance to next song
      if (activeSong && songs.length > 0) {
        const idx = songs.findIndex((s) => s.id === activeSong.id);
        if (idx < songs.length - 1) {
          playSong(songs[idx + 1]);
        }
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [activeSong, songs, playSong, volume]);

  const contextValue: PlayerContextType = {
    songs,
    activeSong,
    isSongsLoading,
    songsError,
    isPlaying,
    isPreviewLocked,
    currentTime,
    duration,
    volume,
    setActiveSong,
    reloadSongs: loadSongs,
    playSong,
    togglePlay,
    seek,
    setVolume,
    skipNext,
    skipPrev,
  };

  return (
    <PlayerContext.Provider value={contextValue}>
      <div className={`min-h-screen flex flex-col ${isAdminRoute || isCheckoutRoute ? '' : 'pb-28 md:pb-24'}`}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {!isAdminRoute && <Header />}
        <main id="main-content" role="main" className={`${isAdminRoute ? '' : 'pt-16'} flex-grow`}>{children}</main>
        {!isAdminRoute && <Footer />}
        {!isAdminRoute && !isCheckoutRoute && <PersistentPlayer />}
        {!isAdminRoute && <EmailCapturePopup />}
        <AnalyticsConsent />

        {/* Background Texture Overlay */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.03] z-[1000]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>
    </PlayerContext.Provider>
  );
};

const App: React.FC = () => {
  normalizeDirectHashRoute();

  return (
    <Router>
      <AppLayout>
        <Suspense fallback={<div className="min-h-[60vh] bg-ivory" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateSong />} />
            <Route path="/track" element={<OrderStatus />} />
            <Route path="/library" element={<Library />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-cancel" element={<PaymentCancel />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/return" element={<Checkout />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/verify" element={<Verify />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </Router>
  );
};

export default App;
