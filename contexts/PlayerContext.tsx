import { createContext, useContext } from 'react';
import type { Song } from '../types';

export interface PlayerContextType {
  songs: Song[];
  activeSong: Song | null;
  isSongsLoading: boolean;
  songsError: string | null;
  isPlaying: boolean;
  isPreviewLocked: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  setActiveSong: (song: Song) => void;
  reloadSongs: () => Promise<void>;
  playSong: (song: Song) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
}

export const PlayerContext = createContext<PlayerContextType | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
