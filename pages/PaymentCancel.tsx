import React from 'react';
import { Link } from 'react-router-dom';

const PaymentCancel: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-ivory px-6 py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 rounded-2xl border border-line bg-cream p-6 text-center sm:p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-terracotta-pale text-terracotta">
        <span className="material-symbols-outlined text-5xl" aria-hidden="true">close</span>
      </div>

      <div>
        <h1 className="font-headline text-5xl font-medium leading-none text-ink">Payment cancelled</h1>
        <p className="mt-4 max-w-md text-base leading-7 text-ink-soft">
          No worries. Your song brief has been saved. You can pick up right where you left off
          whenever you're ready.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <Link
          to="/create"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Return to Brief
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong px-6 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
        >
          Back to Home
        </Link>
      </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
