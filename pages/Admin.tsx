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
  in_production: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
  completed: 'border-green-500/30 bg-green-500/10 text-green-700',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-600',
};

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 pb-20 pt-32">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-background-border bg-background-surface p-10 shadow-sm">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <div className="relative mb-8 text-center">
            <span className="material-symbols-outlined mb-4 block text-4xl text-primary/80">
              admin_panel_settings
            </span>
            <h2 className="font-display text-2xl font-bold text-[#1C1008]">Admin Login</h2>
            <p className="mt-3 font-body text-sm text-[#A08B74]">Sign in to work on orders</p>
          </div>

          <form onSubmit={handleLogin} className="relative space-y-5">
            {loginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
                {loginError}
              </div>
            )}
            <div>
              <label className="mb-2 block pl-1 font-display text-xs font-medium uppercase tracking-widest text-[#A08B74]">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-background-border bg-background px-4 py-3.5 font-body text-sm text-[#1C1008] transition-all placeholder-[#A08B74] focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="mb-2 block pl-1 font-display text-xs font-medium uppercase tracking-widest text-[#A08B74]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-background-border bg-background px-4 py-3.5 font-body text-sm text-[#1C1008] transition-all placeholder-[#A08B74] focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 w-full rounded-xl bg-[#241a00] px-6 py-4 font-display text-sm font-bold uppercase tracking-wider text-primary transition-all hover:bg-[#352600] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Access Workbench'}
            </button>
            <div className="pt-6 text-center">
              <Link to="/" className="text-xs text-[#A08B74] transition-colors hover:text-[#1C1008]">
                Back to Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-background-border bg-background-surface px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[#8a7124]">
              Production Workbench
            </p>
            <h1 className="font-serif text-3xl font-bold italic text-[#1C1008]">
              Orders to Work On
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fetchData(currentPage)}
              className="inline-flex items-center gap-2 rounded-full border border-background-border px-4 py-2 text-sm text-[#78614A] transition-colors hover:border-primary/50 hover:text-[#1C1008]"
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
            <Link to="/" className="rounded-full border border-background-border px-4 py-2 text-sm text-[#78614A] hover:text-[#1C1008]">
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
              className="flex items-center gap-3 rounded-xl border border-background-border bg-background-surface px-4 py-3"
            >
              <span className="material-symbols-outlined text-xl text-primary">{stat.icon}</span>
              <div>
                <p className="font-display text-[10px] font-bold uppercase tracking-widest text-[#A08B74]">
                  {stat.label}
                </p>
                <p className="font-display text-lg font-bold text-[#1C1008]">{stat.value}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-background-border bg-background-surface">
          <div className="flex flex-col gap-4 border-b border-background-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-[#1C1008]">Order Queue</h2>
              <p className="text-sm text-[#78614A]">
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
                className="w-56 rounded-lg border border-background-border bg-background px-3 py-2 text-sm text-[#1C1008] placeholder-[#A08B74] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-background-border bg-background px-3 py-2 text-sm text-[#1C1008] focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All statuses</option>
                <option value="in_production">In Production</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                type="button"
                onClick={handleExportQueue}
                className="inline-flex items-center gap-2 rounded-lg bg-[#241a00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-primary"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export Queue JSON
              </button>
            </div>
          </div>

          {adminMessage && (
            <div className="border-b border-background-border bg-[#FFF8E5] px-5 py-3 text-sm text-[#5C4A2F]">
              {adminMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center p-16">
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">
                progress_activity
              </span>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-[#A08B74]">
              <span className="material-symbols-outlined text-4xl">inbox</span>
              <p>No orders match this view</p>
            </div>
          ) : (
            <div className="divide-y divide-background-border">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const hasBrief = !!order.ai_brief?.trim();

                return (
                  <article key={order.id} className="px-5 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                          <span className="material-symbols-outlined text-primary">music_note</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-[#1C1008]">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_COLORS[order.status] || STATUS_COLORS.in_production}`}>
                              {order.status.replace('_', ' ')}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${hasBrief ? 'bg-violet-500/10 text-violet-700' : 'bg-amber-500/10 text-amber-700'}`}>
                              {hasBrief ? 'AI brief ready' : 'AI brief pending'}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-[#78614A]">
                            {labelize(order.occasion)} · {order.genre || 'Custom'} · {order.voice_gender || 'Voice TBD'} · {formatDate(order.created_at)}
                          </p>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <span className="font-display text-sm font-bold text-[#1C1008]">
                          {formatAmount(order.amount)}
                        </span>
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                          disabled={updatingId === order.id}
                          className="rounded-lg border border-background-border bg-background px-3 py-2 text-xs text-[#1C1008] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="in_production">In Production</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleExportOrder(order)}
                          className="inline-flex items-center gap-1 rounded-lg border border-background-border px-3 py-2 text-xs font-bold text-[#5C4A2F] hover:border-primary/50"
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateBrief(order.id)}
                          disabled={generatingId === order.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-[#241a00] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className={`material-symbols-outlined text-sm ${generatingId === order.id ? 'animate-spin' : ''}`}>
                            {generatingId === order.id ? 'progress_activity' : 'auto_awesome'}
                          </span>
                          {hasBrief ? 'Regenerate' : 'Generate Brief'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          className="flex size-9 items-center justify-center rounded-lg border border-background-border text-[#78614A] hover:text-[#1C1008]"
                          aria-label={isExpanded ? 'Collapse order' : 'Expand order'}
                        >
                          <span className="material-symbols-outlined text-base">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 rounded-xl border border-background-border bg-background p-4 text-sm">
                        <div className="grid gap-3 border-b border-background-border pb-4 md:grid-cols-3">
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
                              <span className="block font-display text-[10px] font-bold uppercase tracking-widest text-[#A08B74]">
                                {label}
                              </span>
                              <p className="mt-1 break-words font-medium text-[#1C1008]">{value || '-'}</p>
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
                              <span className="mb-2 block font-display text-xs font-bold uppercase tracking-wider text-primary">
                                {label}
                              </span>
                              <p className="min-h-28 whitespace-pre-wrap rounded-lg border border-background-border bg-[#1C1008]/5 p-3 leading-relaxed text-[#5C4A2F]">
                                {value || '-'}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 border-t border-background-border pt-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-base text-violet-600">
                                auto_awesome
                              </span>
                              <span className="font-display text-xs font-bold uppercase tracking-wider text-violet-700">
                                AI Production Brief
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleGenerateBrief(order.id)}
                              disabled={generatingId === order.id}
                              className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              {generatingId === order.id ? 'Generating...' : hasBrief ? 'Regenerate' : 'Generate'}
                            </button>
                          </div>
                          <p className="whitespace-pre-wrap rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 leading-relaxed text-[#4C3B5C]">
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
            <div className="flex items-center justify-between gap-4 border-t border-background-border px-5 py-4">
              <span className="font-display text-xs text-[#A08B74]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrev}
                  className="rounded-lg border border-background-border bg-background px-3 py-1.5 text-sm text-[#1C1008] transition-colors hover:border-primary/50 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!pagination.hasNext}
                  className="rounded-lg border border-background-border bg-background px-3 py-1.5 text-sm text-[#1C1008] transition-colors hover:border-primary/50 disabled:opacity-40"
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
