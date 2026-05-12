import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TrackOrderModal from './TrackOrderModal';

const Header: React.FC = () => {
  const location = useLocation();
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinkClass = (path: string) =>
    `font-bold border-b-2 transition-colors duration-300 ${location.pathname === path ? 'text-[#9f402d] border-[#9f402d]' : 'text-[#5e5e63] border-transparent hover:text-[#9f402d]'}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#fff8f0]/80 backdrop-blur-xl shadow-ambient">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <h2 className="text-[#241a00] text-xl md:text-2xl font-semibold tracking-tight italic">
              YourGbedu
            </h2>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center space-x-12 font-headline italic tracking-tight text-lg">
            <Link to="/" className={navLinkClass('/')}>
              Gallery
            </Link>
            <Link to="/library" className={navLinkClass('/library')}>
              Our Catalogue
            </Link>
            <button
              onClick={() => setIsTrackModalOpen(true)}
              className="text-[#5e5e63] border-b-2 border-transparent hover:text-[#9f402d] transition-colors duration-300 font-bold"
            >
              Track Order
            </button>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-6">
            <Link
              to="/create"
              className="bg-obsidian text-primary px-8 py-2.5 font-label uppercase tracking-widest text-[10px] rounded-full hover:scale-[1.02] transition-transform duration-300 shadow-[0_5px_16px_rgba(36,26,0,0.12)]"
            >
              Create Your Song
            </Link>
          </div>

          {/* Mobile CTA — always visible, no dropdown needed */}
          <Link
            to="/create"
            className="md:hidden bg-obsidian text-primary px-5 py-2 font-label uppercase tracking-widest text-[9px] rounded-full hover:scale-105 transition-transform duration-300"
          >
            Create Your Song
          </Link>

          {/* Mobile menu toggle */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="text-[#241a00] p-2 rounded-lg hover:bg-surface-container-highest/40 transition-colors"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="material-symbols-outlined">
                {isMobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#fff2d8] h-[1px] w-full"></div>

      {/* Mobile dropdown menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-[#fff8f0]/95 backdrop-blur-xl absolute top-[65px] left-0 right-0 shadow-ambient border-b border-[#fff2d8]">
          <nav className="flex flex-col px-4 py-6 gap-4 font-headline italic text-xl">
            <Link
              to="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-2 ${location.pathname === '/' ? 'text-[#9f402d] font-bold' : 'text-[#5e5e63]'}`}
            >
              Gallery
            </Link>
            <Link
              to="/library"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-2 ${location.pathname === '/library' ? 'text-[#9f402d] font-bold' : 'text-[#5e5e63]'}`}
            >
              Our Catalogue
            </Link>
            <button
              onClick={() => {
                setIsTrackModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="px-4 py-2 text-[#5e5e63] text-left"
            >
              Track Order
            </button>
            <div className="px-4 pt-4 mt-2 border-t border-[#fff2d8]">
              <Link
                to="/create"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-center bg-obsidian text-primary px-8 py-4 font-label not-italic uppercase tracking-widest text-xs rounded-full shadow-[0_5px_16px_rgba(36,26,0,0.12)]"
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
