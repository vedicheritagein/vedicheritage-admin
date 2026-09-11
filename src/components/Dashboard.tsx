import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchStats, type AdminStats } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { DailyTakingsChart } from './DailyTakingsChart';
import { DiscountCodes } from './DiscountCodes';
import { OrdersTable } from './OrdersTable';
import { StatTile } from './StatTile';

export interface DashboardProps {
  token: string;
  onSignOut: () => void;
  /** Called when the API says the session is over, rather than on a click. */
  onSessionExpired: () => void;
}

/**
 * The dashboard.
 *
 * Ordered by the question it answers, most urgent first: what have we raised,
 * who has paid, what is stuck. The figures come from the server already
 * aggregated - nothing here adds up money in the browser, so the committee's
 * headline number and the database cannot disagree.
 */
export function Dashboard({
  token,
  onSignOut,
  onSessionExpired
}: DashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchStats(token)
      .then((result) => {
        if (cancelled) return;
        setStats(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expired.current();
          return;
        }
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Could not load the figures.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const currency = stats?.currency ?? 'USD';
  const timezone = stats?.timezone ?? 'America/New_York';

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: 'var(--brand-maroon)', borderColor: 'rgba(0,0,0,0.2)' }}
      >
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <h1 className="m-0 text-[15px] font-bold text-[#FFD238]">
              Annual Dipawali Fundraiser
            </h1>
            <p className="m-0 text-[11px] text-[#FFF5ED]/75">
              Vedic Heritage Inc. · figures by {timezone.replace('_', ' ')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats && (
              <span className="hidden text-[11px] text-[#FFF5ED]/70 sm:inline">
                Updated {formatDateTime(stats.generatedAt, timezone)}
              </span>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-md bg-white/10 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wider"
              style={{ background: 'var(--brand-gold)', color: '#fff' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-lg border px-4 py-3 text-[12.5px]"
            style={{
              borderColor: 'rgba(208, 59, 59, 0.4)',
              background: 'rgba(208, 59, 59, 0.06)',
              color: 'var(--status-critical)'
            }}
          >
            {error}
          </p>
        )}

        {stats && (
          <>
            <h2 className="sr-only">Headline figures</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                hero
                label="Raised so far"
                value={formatMoney(stats.paid.grossCents, currency)}
                detail={
                  <>
                    {formatNumber(stats.paid.orders)} completed{' '}
                    {stats.paid.orders === 1 ? 'payment' : 'payments'} · counts
                    money actually captured
                  </>
                }
              />
              <StatTile
                hero
                label="People who have paid"
                value={formatNumber(stats.paid.payers)}
                detail={
                  <>
                    {formatNumber(stats.paid.seats)} seats committed · average{' '}
                    {formatMoney(stats.paid.averageOrderCents, currency)} per order
                  </>
                }
              />
              <StatTile
                label="Ticket buyers"
                value={formatNumber(stats.tickets.payers)}
                detail={
                  <>
                    {formatNumber(stats.tickets.quantity)} tickets ·{' '}
                    {formatMoney(stats.tickets.grossCents, currency)}
                  </>
                }
              />
              <StatTile
                label="Sponsors"
                value={formatNumber(stats.sponsorships.payers)}
                detail={
                  <>
                    {formatNumber(stats.sponsorships.orders)} sponsorships ·{' '}
                    {formatMoney(stats.sponsorships.grossCents, currency)}
                  </>
                }
              />
            </div>

            <h2 className="sr-only">Payments needing attention</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Started, not finished"
                tone={stats.pipeline.pending > 0 ? 'warning' : 'neutral'}
                value={formatNumber(stats.pipeline.pending)}
                detail="Reached the payment page and did not come back. Worth a call."
              />
              <StatTile
                label="Failed"
                tone={stats.pipeline.failed > 0 ? 'critical' : 'neutral'}
                value={formatNumber(stats.pipeline.failed)}
                detail="Card declined or checkout could not be created."
              />
              <StatTile
                label="Refunded"
                value={formatNumber(stats.pipeline.refunded)}
                detail={`${formatMoney(stats.pipeline.refundedCents, currency)} returned`}
              />
              <StatTile
                label="Discounts given"
                value={formatMoney(stats.paid.discountCents, currency)}
                detail={
                  <>
                    Face value {formatMoney(stats.paid.subtotalCents, currency)}{' '}
                    before codes
                  </>
                }
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <section
                className="rounded-xl border bg-[var(--surface-1)] p-4 lg:col-span-2"
                style={{ borderColor: 'var(--hairline)' }}
                aria-labelledby="daily-heading"
              >
                <h2 id="daily-heading" className="m-0 text-[15px] font-bold">
                  Money taken per day
                </h2>
                <p
                  className="m-0 mb-3 mt-0.5 text-[11.5px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Completed payments only, grouped by{' '}
                  {timezone.replace('_', ' ')} calendar day.
                </p>
                <DailyTakingsChart points={stats.daily} currency={currency} />
              </section>

              <section
                className="rounded-xl border bg-[var(--surface-1)] p-4"
                style={{ borderColor: 'var(--hairline)' }}
                aria-labelledby="tiers-heading"
              >
                <h2 id="tiers-heading" className="m-0 text-[15px] font-bold">
                  Sponsorship tiers
                </h2>
                <p
                  className="m-0 mb-3 mt-0.5 text-[11.5px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Paid sponsorships, largest first.
                </p>

                {stats.sponsorships.byTier.length === 0 ? (
                  <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                    No sponsorships paid yet.
                  </p>
                ) : (
                  <table className="w-full border-collapse text-[12.5px]">
                    <caption className="sr-only">Sponsorship tiers</caption>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th scope="col" className="pb-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em]">
                          Tier
                        </th>
                        <th scope="col" className="pb-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em]">
                          No.
                        </th>
                        <th scope="col" className="pb-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em]">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.sponsorships.byTier.map((tier) => (
                        <tr
                          key={tier.sku}
                          style={{ borderTop: '1px solid var(--hairline)' }}
                        >
                          <th scope="row" className="py-1.5 text-left font-medium">
                            {tier.label}
                          </th>
                          <td className="py-1.5 text-right tabular">{tier.orders}</td>
                          <td className="py-1.5 text-right font-semibold tabular">
                            {formatMoney(tier.grossCents, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <div className="mt-5">
              <OrdersTable
                token={token}
                timezone={timezone}
                refreshKey={refreshKey}
                onSessionExpired={onSessionExpired}
              />
            </div>

            <div className="mt-5">
              <DiscountCodes
                token={token}
                currency={currency}
                refreshKey={refreshKey}
                onSessionExpired={onSessionExpired}
              />
            </div>

            <p
              className="mt-5 text-[11px] leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              This page shows buyers&rsquo; names, email addresses and phone
              numbers. Sign out when you have finished, and do not leave it open
              on a shared screen. Refunds are issued in the Square dashboard,
              never here &mdash; this view can only read.
            </p>
          </>
        )}

        {!stats && loading && (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Loading the figures...
          </p>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
