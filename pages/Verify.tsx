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
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
        <span className="material-symbols-outlined text-6xl text-primary animate-spin">
          progress_activity
        </span>
        <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">Signing you in…</h2>
        <p className="text-[#e2c15a] font-body opacity-80">Verifying your magic link.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
        <div className="size-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary font-light">task_alt</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">Signed in!</h2>
        <p className="text-[#e2c15a] font-body opacity-80">Redirecting to your orders…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
      <span className="material-symbols-outlined text-7xl text-red-500 font-light">
        link_off
      </span>
      <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">Link Invalid</h2>
      <p className="text-[#e2c15a] font-body text-center max-w-md opacity-80">{errorMessage}</p>
      <Link
        to="/track"
        className="mt-4 flex items-center gap-2 px-8 h-12 rounded-full bg-primary text-obsidian hover:bg-[#e2c15a] transition-all font-display text-sm font-bold uppercase tracking-widest"
      >
        Request a New Link
      </Link>
    </div>
  );
};

export default Verify;
