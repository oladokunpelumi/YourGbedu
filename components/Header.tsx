import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TrackOrderModal from './TrackOrderModal';

const Header: React.FC = () => {
  const location = useLocation();
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinkClass = (path: string) =>
    `border-b border-transparent pb-1 font-label text-sm font-bold uppercase tracking-[0.12em] transition-colors duration-200 ${
      location.pathname === path
        ? 'border-terracotta text-terracotta'
        : 'text-ink-soft hover:border-terracotta/40 hover:text-terracotta'
    }`;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-line bg-ivory/88 backdrop-blur-xl">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <h2 className="font-headline text-2xl font-semibold italic text-ink md:text-3xl">
              YourGbedu
            </h2>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center space-x-10 md:flex">
            <Link to="/" className={navLinkClass('/')}>
              Home
            </Link>
            <Link to="/library" className={navLinkClass('/library')}>
              Catalogue
            </Link>
            <button
              type="button"
              onClick={() => setIsTrackModalOpen(true)}
              className="border-b border-transparent pb-1 font-label text-sm font-bold uppercase tracking-[0.12em] text-ink-soft transition-colors duration-200 hover:border-terracotta/40 hover:text-terracotta"
            >
              Track Order
            </button>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-6">
            <Link
              to="/create"
              className="rounded-full bg-ink px-7 py-2.5 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-cream transition-colors duration-200 hover:bg-terracotta"
            >
              Create Your Song
            </Link>
          </div>

          {/* Mobile CTA — always visible, no dropdown needed */}
          <Link
            to="/create"
            className="rounded-full bg-ink px-4 py-2 font-label text-[9px] font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta md:hidden"
          >
            Create
          </Link>

          {/* Mobile menu toggle */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="rounded-lg p-2 text-ink transition-colors hover:bg-cream"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              <span className="material-symbols-outlined">
                {isMobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {isMobileMenuOpen && (
        <div className="absolute left-0 right-0 top-[65px] border-b border-line bg-ivory/96 shadow-ambient backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2 px-4 py-5">
            <Link
              to="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`rounded-xl px-4 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] ${location.pathname === '/' ? 'bg-terracotta-pale text-terracotta-dark' : 'text-ink-soft'}`}
            >
              Home
            </Link>
            <Link
              to="/library"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`rounded-xl px-4 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] ${location.pathname === '/library' ? 'bg-terracotta-pale text-terracotta-dark' : 'text-ink-soft'}`}
            >
              Catalogue
            </Link>
            <button
              type="button"
              onClick={() => {
                setIsTrackModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="rounded-xl px-4 py-3 text-left font-label text-sm font-bold uppercase tracking-[0.12em] text-ink-soft"
            >
              Track Order
            </button>
            <div className="mt-2 border-t border-line px-4 pt-4">
              <Link
                to="/create"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full rounded-full bg-ink px-8 py-4 text-center font-label text-xs font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
              >
                Create Your Song
              </Link>
            </div>
          </nav>
        </div>
      )}

      <TrackOrderModal isOpen={isTrackModalOpen} onClose={() => setIsTrackModalOpen(false)} />
    </header>
  );
};

export default Header;
