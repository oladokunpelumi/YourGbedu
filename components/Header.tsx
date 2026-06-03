import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TrackOrderModal from './TrackOrderModal';

const MOBILE_MENU_ID = 'mobile-navigation-panel';

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

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    closeMobileMenu();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const mobileNavLinkClass = (path: string) =>
    `flex min-h-16 items-center justify-between rounded-2xl border px-5 font-label text-base font-bold uppercase tracking-[0.14em] transition-colors ${
      location.pathname === path
        ? 'border-terracotta bg-terracotta-pale text-terracotta-dark'
        : 'border-line bg-cream text-ink hover:border-terracotta hover:text-terracotta'
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

          {/* Mobile actions */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/create"
              className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
            >
              Create
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors ${
                isMobileMenuOpen
                  ? 'border-terracotta bg-terracotta-pale text-terracotta-dark'
                  : 'border-line bg-cream text-ink hover:border-terracotta hover:text-terracotta'
              }`}
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls={MOBILE_MENU_ID}
            >
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                {isMobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          id={MOBILE_MENU_ID}
          className="fixed inset-x-0 top-16 z-40 block h-[calc(100svh-4rem)] bg-ink/20 backdrop-blur-sm md:hidden"
        >
          <div className="h-full overflow-y-auto bg-ivory px-4 pb-8 pt-4 shadow-ambient-lg">
            <nav className="flex flex-col gap-3" aria-label="Mobile navigation">
              <Link to="/" onClick={closeMobileMenu} className={mobileNavLinkClass('/')}>
                <span>Home</span>
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  home
                </span>
              </Link>
              <Link to="/library" onClick={closeMobileMenu} className={mobileNavLinkClass('/library')}>
                <span>Catalogue</span>
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  library_music
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  setIsTrackModalOpen(true);
                }}
                className="flex min-h-16 items-center justify-between rounded-2xl border border-line bg-cream px-5 text-left font-label text-base font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-terracotta hover:text-terracotta"
              >
                <span>Track Order</span>
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  receipt_long
                </span>
              </button>
            </nav>

            <div className="mt-5 rounded-3xl border border-line bg-cream p-4">
              <p className="font-headline text-3xl italic leading-none text-ink">
                Start with the person you love.
              </p>
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                Build a custom song brief, then we configure the record around your story.
              </p>
              <Link
                to="/create"
                onClick={closeMobileMenu}
                className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-ink px-8 text-center font-label text-xs font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
              >
                Create Your Song
              </Link>
            </div>
          </div>
        </div>
      )}

      <TrackOrderModal isOpen={isTrackModalOpen} onClose={() => setIsTrackModalOpen(false)} />
    </header>
  );
};

export default Header;
