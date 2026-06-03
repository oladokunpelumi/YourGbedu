import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// Landing page for magic link clicks.
// The email link format is /#/verify?token=<plaintext-token>.
// This component calls the server to exchange the token for an HttpOnly session
// cookie, then redirects the user to their orders.
const Verify: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'error'
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? '' : 'No sign-in token found in this link.'
  );

  useEffect(() => {
    if (!token) return;

    // POST keeps the token out of server access logs (body, not URL query string)
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus('success');
          // Give user a moment to see the success state, then send to track page
          setTimeout(() => navigate('/track', { replace: true }), 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error || 'This sign-in link is invalid or has expired.');
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorMessage('A network error occurred. Please try again.');
        setStatus('error');
      });
  }, [navigate, token]);

  if (status === 'verifying') {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-ivory px-6 text-center">
        <span className="material-symbols-outlined text-6xl text-terracotta animate-spin" aria-hidden="true">
          progress_activity
        </span>
        <h1 className="font-headline text-5xl font-medium leading-none text-ink">Signing you in</h1>
        <p className="font-body text-ink-soft">Verifying your magic link.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-ivory px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sage-pale text-sage-dark">
          <span className="material-symbols-outlined text-4xl" aria-hidden="true">task_alt</span>
        </div>
        <h1 className="font-headline text-5xl font-medium leading-none text-ink">Signed in</h1>
        <p className="font-body text-ink-soft">Redirecting to your orders...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-ivory px-6 text-center">
      <span className="material-symbols-outlined text-7xl text-red-600" aria-hidden="true">
        link_off
      </span>
      <h1 className="font-headline text-5xl font-medium leading-none text-ink">Link invalid</h1>
      <p className="max-w-md font-body text-ink-soft">{errorMessage}</p>
      <Link
        to="/track"
        className="mt-4 flex h-12 items-center gap-2 rounded-full bg-ink px-8 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
      >
        Request a New Link
      </Link>
    </div>
  );
};

export default Verify;
