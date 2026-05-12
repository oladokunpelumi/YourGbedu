import React, { useState } from 'react';
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
  const navigate = useNavigate();

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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#241a00]/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-surface-container-lowest rounded-xl p-6 relative shadow-[0_8px_28px_rgba(36,26,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-order-title"
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-[#78614A] hover:text-[#241a00] transition-colors"
          aria-label="Close order tracking"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'sent' ? (
          <div className="text-center py-4 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
              <h2 id="track-order-title" className="text-xl font-bold text-[#241a00] font-display">Check your inbox</h2>
            <p className="text-[#78614A] text-sm font-body">
              We've sent a sign-in link to <strong>{identifier}</strong>. Click the link in the
              email to view all your orders.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 text-sm text-[#78614A] underline hover:text-[#241a00]"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6 pt-2">
              <div className="w-12 h-12 bg-surface-container-highest rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-secondary" />
              </div>
              <h2 id="track-order-title" className="text-2xl font-bold text-[#241a00] font-display">Track Your Song</h2>
              <p className="text-[#78614A] text-sm mt-2 font-body">
                Enter your Order ID to open that order, or your email to receive a secure link for all orders.
              </p>
            </div>

            <form onSubmit={handleTrack} className="space-y-4">
              <div>
                <input
                  aria-label="Order ID or email address"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setErrorMessage('');
                    if (modalState === 'error') setModalState('input');
                  }}
                  placeholder="Order ID or email@example.com"
                  className="w-full bg-surface-bright rounded-xl px-4 py-3.5 text-[#241a00] placeholder-[#78614A]/60 focus:outline-none focus:bg-surface-container-lowest focus:shadow-[inset_0_0_0_1px_rgba(0,106,106,0.15)] transition-all font-body"
                />
                {errorMessage && (
                  <p className="text-secondary text-sm mt-2 px-1">{errorMessage}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={modalState === 'sending' || !identifier.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl btn-gradient text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide text-sm font-ui mt-2"
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
