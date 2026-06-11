import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, Mail } from 'lucide-react';

interface TrackOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState = 'input' | 'sending' | 'sent' | 'error';

async function getApiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return data?.error || data?.message || fallback;
}

const TrackOrderModal: React.FC<TrackOrderModalProps> = ({ isOpen, onClose }) => {
  const [identifier, setIdentifier] = useState('');
  const [modalState, setModalState] = useState<ModalState>('input');
  const [errorMessage, setErrorMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => inputRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) {
      setErrorMessage('Please enter an Order ID or Email.');
      return;
    }

    setErrorMessage('');

    const isEmail = value.includes('@');

    if (isEmail) {
      // Email-based tracking requires authentication.
      // Send a magic link and tell the user to check their inbox.
      setModalState('sending');
      try {
        const res = await fetch('/api/auth/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value }),
        });
        setModalState(res.ok ? 'sent' : 'error');
        if (!res.ok) {
          setErrorMessage(await getApiError(res, 'Something went wrong. Please try again.'));
        }
      } catch {
        setModalState('error');
        setErrorMessage('Network error. Please try again.');
      }
    } else {
      // Order ID access is direct; email-based order lists still use magic-link auth.
      sessionStorage.setItem('yourgbedu_track_id', value);
      onClose();
      navigate(`/track?id=${encodeURIComponent(value)}`);
    }
  };

  const handleClose = () => {
    setIdentifier('');
    setModalState('input');
    setErrorMessage('');
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-line bg-cream p-6 shadow-[0_18px_44px_rgba(31,27,20,0.2)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-order-title"
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-ink-muted transition-colors hover:text-ink"
          aria-label="Close order tracking"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'sent' ? (
          <div className="text-center py-4 flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-pale">
              <Mail className="h-8 w-8 text-sage-dark" />
            </div>
            <h2 id="track-order-title" className="font-headline text-4xl font-medium leading-none text-ink">
              Check your inbox
            </h2>
            <p className="font-body text-sm leading-6 text-ink-soft">
              If <strong>{identifier}</strong> matches an order, a secure sign-in link is on the
              way. Open it to view every order attached to that email.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 font-label text-sm font-bold text-terracotta underline hover:text-terracotta-dark"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6 pt-2">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-pale">
                <Search className="h-7 w-7 text-terracotta" />
              </div>
              <h2 id="track-order-title" className="font-headline text-4xl font-medium leading-none text-ink">
                Track your song
              </h2>
              <p className="mt-3 font-body text-sm leading-6 text-ink-soft">
                Enter your Order ID to open that order, or your email to receive a secure link for all orders.
              </p>
            </div>

            <form onSubmit={handleTrack} className="space-y-4">
              <div>
                <input
                  ref={inputRef}
                  aria-label="Order ID or email address"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setErrorMessage('');
                    if (modalState === 'error') setModalState('input');
                  }}
                  placeholder="Order ID or email@example.com"
                  className="w-full rounded-xl border border-line bg-ivory px-4 py-3.5 font-body text-ink placeholder:text-ink-muted transition-colors focus:border-terracotta focus:bg-cream focus:outline-none focus:ring-4 focus:ring-terracotta/10"
                />
                {errorMessage && (
                  <p className="mt-2 px-1 text-sm text-red-700">{errorMessage}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={modalState === 'sending' || !identifier.trim()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modalState === 'sending' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : identifier.includes('@') ? (
                  'Send Sign-in Link'
                ) : (
                  'Find My Order'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TrackOrderModal;
