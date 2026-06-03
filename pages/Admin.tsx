import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface Order {
  id: string;
  song_title: string;
  genre: string;
  mood: string;
  tempo: number;
  occasion: string;
  occasion_detail: string;
  story: string;
  status: string;
  created_at: string;
  delivery_date: string;
  stripe_session_id: string | null;
  paystack_reference: string | null;
  amount: number;
  recipient_type: string;
  sender_name: string;
  voice_gender: string;
  special_qualities: string;
  favorite_memories: string;
  special_message: string;
  customer_email: string;
  ai_brief: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  songCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  in_production: 'border-terracotta/25 bg-terracotta-pale text-terracotta-dark',
  completed: 'border-sage-soft bg-sage-pale text-sage-dark',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

const adminInputClass =
  'rounded-xl border border-line bg-ivory px-4 py-3 font-body text-sm text-ink placeholder:text-ink-muted transition-colors focus:border-terracotta focus:bg-cream focus:outline-none focus:ring-4 focus:ring-terracotta/10';

const adminActionClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2 font-label text-xs font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50';

function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, { ...options, credentials: 'include' });
}

function formatDate(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatAmount(amount: number) {
  return `₦${((amount || 0) / 100).toLocaleString('en-NG')}`;
}

function labelize(value?: string | null) {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildOrderExport(order: Order) {
  return {
    orderId: order.id,
    shortOrderId: order.id.slice(0, 8).toUpperCase(),
    status: order.status,
    paymentReference: order.paystack_reference || order.stripe_session_id || null,
    amount: order.amount,
    deliveryDate: order.delivery_date,
    customerEmail: order.customer_email || null,
    form: {
      recipientType: order.recipient_type || '',
      senderName: order.sender_name || '',
      genre: order.genre || '',
      voiceGender: order.voice_gender || '',
      occasion: order.occasion || '',
      occasionDetail: order.occasion_detail || '',
      specialQualities: order.special_qualities || '',
      favoriteMemories: order.favorite_memories || '',
      specialMessage: order.special_message || order.story || '',
    },
    aiBrief: order.ai_brief || '',
    createdAt: order.created_at,
  };
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const Admin: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState('');

  const currentPendingBriefs = useMemo(
    () => orders.filter((order) => !order.ai_brief?.trim()).length,
    [orders]
  );

  useEffect(() => {
    adminFetch('/api/admin/stats')
      .then((res) => setAuthenticated(res.ok))
      .catch(() => setAuthenticated(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      /* best effort */
    }
    setAuthenticated(false);
    setOrders([]);
    setStats(null);
  }, []);

  const fetchData = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setAdminMessage('');
      try {
        const params = new URLSearchParams({ page: String(page), limit: '25' });
        if (statusFilter) params.set('status', statusFilter);
        if (search) params.set('search', search);

        const [ordersRes, statsRes] = await Promise.all([
          adminFetch(`/api/admin/orders?${params}`),
          adminFetch('/api/admin/stats'),
        ]);

        if (ordersRes.status === 401 || ordersRes.status === 403) {
          logout();
          return;
        }

        const [ordersPayload, statsData] = await Promise.all([ordersRes.json(), statsRes.json()]);
        setOrders(ordersPayload.data ?? ordersPayload);
        setPagination(ordersPayload.pagination ?? null);
        setStats(statsData);
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
        setAdminMessage('Could not load the order queue.');
      } finally {
        setIsLoading(false);
      }
    },
    [logout, search, statusFilter]
  );

  useEffect(() => {
    if (authenticated) fetchData(currentPage);
  }, [authenticated, currentPage, fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    try {
      const res = await adminFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        setAuthenticated(true);
        setPassword('');
      } else {
        setLoginError('Invalid credentials');
      }
    } catch {
      setLoginError('An error occurred during log in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    setAdminMessage('');
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Status update failed');
      await fetchData(currentPage);
    } catch (err) {
      console.error('Failed to update status:', err);
      setAdminMessage('Could not update the order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleGenerateBrief = async (orderId: string) => {
    setGeneratingId(orderId);
    setAdminMessage('');
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/ai-brief`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'AI brief generation failed');

      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, ai_brief: data.aiBrief } : order))
      );
      setAdminMessage('AI production brief generated.');
    } catch (err) {
      console.error('Failed to generate AI brief:', err);
      setAdminMessage(err instanceof Error ? err.message : 'Could not generate the AI brief.');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleExportOrder = (order: Order) => {
    downloadJson(`yourgbedu-order-${order.id.slice(0, 8).toUpperCase()}.json`, buildOrderExport(order));
  };

  const handleExportQueue = async () => {
    setAdminMessage('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await adminFetch(`/api/admin/orders/export?${params}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Queue export failed');

      downloadJson('yourgbedu-order-queue.json', data);
    } catch (err) {
      console.error('Failed to export queue:', err);
      setAdminMessage(err instanceof Error ? err.message : 'Could not export the order queue.');
    }
  };

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <span className="material-symbols-outlined animate-spin text-4xl text-terracotta">
          progress_activity
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ivory px-5 py-12">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-cream p-6 shadow-ambient sm:p-9">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-terracotta" />
          <div className="relative mb-8 text-center">
            <span className="material-symbols-outlined mb-4 block text-4xl text-terracotta">
              admin_panel_settings
            </span>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-terracotta">
              Production Workbench
            </p>
            <h2 className="mt-3 font-headline text-4xl font-medium leading-none text-ink">
              Admin login
            </h2>
            <p className="mt-3 font-body text-sm text-ink-soft">Sign in to work on orders</p>
          </div>

          <form onSubmit={handleLogin} className="relative space-y-5">
            {loginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
                {loginError}
              </div>
            )}
            <div>
              <label className="mb-2 block font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full ${adminInputClass}`}
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="mb-2 block font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full ${adminInputClass}`}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 w-full rounded-full bg-ink px-6 py-4 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Access Workbench'}
            </button>
            <div className="pt-6 text-center">
              <Link to="/" className="font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-muted transition-colors hover:text-terracotta">
                Back to Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-10 border-b border-line bg-cream/92 px-5 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
              Production Workbench
            </p>
            <h1 className="font-headline text-4xl font-medium italic leading-none text-ink">
              Orders to Work On
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fetchData(currentPage)}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              Log Out
            </button>
            <Link to="/" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-ink-soft hover:border-terracotta hover:text-terracotta">
              Site
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            { label: 'Total Orders', value: stats?.totalOrders ?? '-', icon: 'receipt_long' },
            { label: 'Revenue', value: stats ? formatAmount(stats.totalRevenue) : '-', icon: 'payments' },
            { label: 'Visible Pending Briefs', value: currentPendingBriefs, icon: 'auto_awesome' },
            { label: 'Songs in Library', value: stats?.songCount ?? '-', icon: 'library_music' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-3"
            >
              <span className="material-symbols-outlined text-xl text-terracotta">{stat.icon}</span>
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                  {stat.label}
                </p>
                <p className="font-label text-lg font-bold text-ink">{stat.value}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-cream">
          <div className="flex flex-col gap-4 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-headline text-3xl font-medium leading-none text-ink">Order Queue</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Expand an order to review the brief, export JSON, or generate the production brief.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search name / email / ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Search orders"
                className={`w-full sm:w-64 ${adminInputClass}`}
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter orders by status"
                className={adminInputClass}
              >
                <option value="">All statuses</option>
                <option value="in_production">In Production</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                type="button"
                onClick={handleExportQueue}
                className={adminActionClass}
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export Queue JSON
              </button>
            </div>
          </div>

          {adminMessage && (
            <div role="status" className="border-b border-line bg-mustard-pale px-5 py-3 text-sm font-medium text-[#6F521F]">
              {adminMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center p-16">
              <span className="material-symbols-outlined animate-spin text-3xl text-terracotta">
                progress_activity
              </span>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-ink-muted">
              <span className="material-symbols-outlined text-4xl">inbox</span>
              <p>No orders match this view</p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const hasBrief = !!order.ai_brief?.trim();
                const orderSummary = [
                  labelize(order.occasion),
                  order.genre || 'Custom',
                  order.voice_gender || 'Voice TBD',
                  formatDate(order.created_at),
                ].filter((value) => value && value !== '-');

                return (
                  <article key={order.id} className="px-5 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mustard-pale">
                          <span className="material-symbols-outlined text-mustard">music_note</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-ink">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_COLORS[order.status] || STATUS_COLORS.in_production}`}>
                              {order.status.replace('_', ' ')}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${hasBrief ? 'bg-sage-pale text-sage-dark' : 'bg-mustard-pale text-[#6F521F]'}`}>
                              {hasBrief ? 'AI brief ready' : 'AI brief pending'}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-ink-soft">
                            {orderSummary.join(' · ')}
                          </p>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <span className="font-label text-sm font-bold text-ink">
                          {formatAmount(order.amount)}
                        </span>
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                          disabled={updatingId === order.id}
                          className="rounded-lg border border-line bg-ivory px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 disabled:opacity-50"
                        >
                          <option value="in_production">In Production</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleExportOrder(order)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-3 py-2 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta"
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateBrief(order.id)}
                          disabled={generatingId === order.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-terracotta px-3 py-2 text-xs font-bold text-cream disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className={`material-symbols-outlined text-sm ${generatingId === order.id ? 'animate-spin' : ''}`}>
                            {generatingId === order.id ? 'progress_activity' : 'auto_awesome'}
                          </span>
                          {hasBrief ? 'Regenerate' : 'Generate Brief'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          className="flex size-9 items-center justify-center rounded-lg border border-line-strong text-ink-muted hover:text-ink"
                          aria-label={isExpanded ? 'Collapse order' : 'Expand order'}
                        >
                          <span className="material-symbols-outlined text-base">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 rounded-xl border border-line bg-ivory p-4 text-sm">
                        <div className="grid gap-3 border-b border-line pb-4 md:grid-cols-3">
                          {[
                            ['For', order.recipient_type],
                            ['From', order.sender_name],
                            ['Occasion', labelize(order.occasion)],
                            ['Occasion Detail', order.occasion_detail],
                            ['Voice', order.voice_gender],
                            ['Delivery', formatDate(order.delivery_date)],
                            ['Email', order.customer_email],
                            ['Payment Ref', order.paystack_reference || order.stripe_session_id],
                            ['Created', formatDate(order.created_at)],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <span className="block font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                                {label}
                              </span>
                              <p className="mt-1 break-words font-medium text-ink">{value || '-'}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-3">
                          {[
                            ['Special Qualities', order.special_qualities],
                            ['Favorite Memories', order.favorite_memories],
                            ['Special Message', order.special_message || order.story],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <span className="mb-2 block font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta">
                                {label}
                              </span>
                              <p className="min-h-28 whitespace-pre-wrap rounded-lg border border-line bg-cream p-3 leading-relaxed text-ink-soft">
                                {value || '-'}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 border-t border-line pt-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-base text-terracotta">
                                auto_awesome
                              </span>
                              <span className="font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta">
                                AI Production Brief
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleGenerateBrief(order.id)}
                              disabled={generatingId === order.id}
                              className="rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-cream hover:bg-terracotta disabled:opacity-60"
                            >
                              {generatingId === order.id ? 'Generating...' : hasBrief ? 'Regenerate' : 'Generate'}
                            </button>
                          </div>
                          <p className="whitespace-pre-wrap rounded-lg border border-terracotta/20 bg-terracotta-pale/60 p-4 leading-relaxed text-ink-soft">
                            {order.ai_brief || 'AI brief pending generation. Use Generate Brief when this order is ready for production review.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
              <span className="font-label text-xs text-ink-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrev}
                  className="rounded-lg border border-line bg-ivory px-3 py-1.5 text-sm text-ink transition-colors hover:border-terracotta disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!pagination.hasNext}
                  className="rounded-lg border border-line bg-ivory px-3 py-1.5 text-sm text-ink transition-colors hover:border-terracotta disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Admin;
