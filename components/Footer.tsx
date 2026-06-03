import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="relative z-10 mt-auto w-full border-t border-line bg-ink px-6 pb-32 pt-12 text-cream md:pb-28">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
        <div>
          <div className="font-headline text-3xl italic text-cream">YourGbedu</div>
          <p className="mt-3 max-w-md font-headline text-xl italic leading-7 text-cream/55">
            Personal songs for moments that deserve more than a message.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 font-label text-xs font-bold uppercase tracking-[0.14em]">
          <Link to="/" className="text-cream/65 transition-colors hover:text-mustard-soft">
            Home
          </Link>
          <Link
            to="/library"
            className="text-cream/65 transition-colors hover:text-mustard-soft"
          >
            Catalogue
          </Link>
          <a
            href="mailto:hello@yourgbedu.com"
            className="text-cream/65 transition-colors hover:text-mustard-soft"
          >
            Contact
          </a>
        </div>
        <div className="font-label text-xs text-cream/45">
          © {new Date().getFullYear()} YourGbedu
        </div>
      </div>
    </footer>
  );
};

export default Footer;
