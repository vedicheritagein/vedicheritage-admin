import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  fetchOrders,
  type AdminOrder,
  type OrderSort,
  type OrderStatus,
  type OrdersPage,
  type OrdersQuery,
  type ProductKind,
  type SortDirection
} from '../lib/api';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { StatusBadge } from './StatusBadge';

export interface OrdersTableProps {
  token: string;
  timezone: string;
  /** Bumped by the dashboard's Refresh button, to reload alongside the figures. */
  refreshKey: number;
  /** Called when the API says the session is over. */
  onSessionExpired: () => void;
}

const PAGE_SIZE = 25;
/** The API's own ceiling. An export asks for one page of this size. */
const EXPORT_LIMIT = 500;

interface Column {
  key: string;
  label: string;
  sort?: OrderSort;
  align?: 'right';
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'contact', label: 'Contact' },
  { key: 'item', label: 'Bought' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Paid', sort: 'amount', align: 'right' },
  { key: 'paidAt', label: 'When', sort: 'paidAt' },
  { key: 'ref', label: 'Reference' }
];

/**
 * Every order, with the buyer's contact details.
 *
 * This is the working end of the dashboard: the door list, and the list of
 * people to ring when a payment fails. So it is built for the two things
 * actually done with it - find one person fast (search), and take the whole
 * thing away (export) - rather than for browsing.
 *
 * Filtering, sorting and paging all happen on the server. Doing any of it in
 * the browser would mean either shipping the entire table to filter three rows
 * out of it, or showing a "sorted" view that only sorts the page you can see.
 */
export function OrdersTable({
  token,
  timezone,
  refreshKey,
  onSessionExpired
}: OrdersTableProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [kind, setKind] = useState<ProductKind | ''>('');
  const [sort, setSort] = useState<OrderSort>('createdAt');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [offset, setOffset] = useState(0);

  const [page, setPage] = useState<OrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Typing must not fire a request per keystroke; a short pause is enough to
  // feel immediate while asking the server once.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Any change to what is being asked for starts again at the first page -
  // otherwise a search that matches three rows shows nothing, because the view
  // is still on page four of the previous result.
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, status, kind, sort, direction]);

  const query: OrdersQuery = useMemo(
    () => ({
      search: debouncedSearch,
      status,
      kind,
      sort,
      direction,
      limit: PAGE_SIZE,
      offset
    }),
    [debouncedSearch, status, kind, sort, direction, offset]
  );

  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchOrders(token, query)
      .then((result) => {
        if (cancelled) return;
        setPage(result);
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
            : 'Could not load the orders.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, query, refreshKey]);

  const toggleSort = (column: OrderSort) => {
    if (sort === column) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(column);
    // Names read naturally A-Z; amounts and dates are most useful biggest and
    // newest first.
    setDirection(column === 'name' ? 'asc' : 'desc');
  };

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      // Exports what the current filters select, not just the visible page -
      // a door list of one page of twenty-five would be useless.
      const all = await fetchOrders(token, {
        ...query,
        limit: EXPORT_LIMIT,
        offset: 0
      });
      downloadCsv(all.orders, timezone);
      if (all.total > all.orders.length) {
        setError(
          `Exported the first ${all.orders.length} of ${all.total} matching orders (the server caps one request at ${EXPORT_LIMIT}). Narrow the filter to export the rest.`
        );
      }
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        expired.current();
        return;
      }
      setError(
        cause instanceof ApiError ? cause.message : 'Could not export the orders.'
      );
    } finally {
      setExporting(false);
    }
  }, [token, query, timezone]);

  const orders = page?.orders ?? [];
  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <section
      className="rounded-xl border bg-[var(--surface-1)]"
      style={{ borderColor: 'var(--hairline)' }}
      aria-labelledby="orders-heading"
    >
      <div
        className="flex flex-col gap-3 border-b px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div>
          <h2 id="orders-heading" className="m-0 text-[15px] font-bold">
            Orders
          </h2>
          <p
            className="m-0 mt-0.5 text-[11.5px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Everyone who started a payment, whether or not it completed.
          </p>
        </div>

        {/* Filters in one row above the table, as a single control group. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="orders-search">
            Search orders
          </label>
          <input
            id="orders-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, reference"
            className="w-full rounded-md border px-2.5 py-1.5 text-[12.5px] sm:w-[280px]"
            style={{ borderColor: 'var(--baseline)', background: '#fff' }}
          />

          <label className="sr-only" htmlFor="orders-status">
            Filter by status
          </label>
          <select
            id="orders-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatus | '')}
            className="rounded-md border px-2 py-1.5 text-[12.5px]"
            style={{ borderColor: 'var(--baseline)', background: '#fff' }}
          >
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="canceled">Canceled</option>
            <option value="refunded">Refunded</option>
          </select>

          <label className="sr-only" htmlFor="orders-kind">
            Filter by what was bought
          </label>
          <select
            id="orders-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as ProductKind | '')}
            className="rounded-md border px-2 py-1.5 text-[12.5px]"
            style={{ borderColor: 'var(--baseline)', background: '#fff' }}
          >
            <option value="">Tickets &amp; sponsorships</option>
            <option value="ticket">Tickets only</option>
            <option value="sponsorship">Sponsorships only</option>
          </select>

          <button
            type="button"
            onClick={() => void runExport()}
            disabled={exporting || total === 0}
            className="rounded-md px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--brand-maroon)' }}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="m-0 border-b px-4 py-2.5 text-[12px]"
          style={{
            borderColor: 'var(--hairline)',
            color: 'var(--status-critical)',
            background: 'rgba(208, 59, 59, 0.06)'
          }}
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <caption className="sr-only">
            Orders, with buyer contact details
          </caption>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    column.sort && sort === column.sort
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={`whitespace-nowrap border-b px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.sort!)}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em]"
                      style={{ color: 'inherit' }}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {sort === column.sort ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-10 text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Loading orders...
                </td>
              </tr>
            )}

            {!loading && orders.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-10 text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {debouncedSearch || status || kind
                    ? 'No orders match that filter.'
                    : 'No orders yet.'}
                </td>
              </tr>
            )}

            {orders.map((order) => (
              <OrderRow key={order.orderRef} order={order} timezone={timezone} />
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <p
          className="m-0 text-[11.5px] tabular"
          style={{ color: 'var(--text-secondary)' }}
        >
          {total === 0
            ? 'No orders'
            : `Showing ${formatNumber(from)}-${formatNumber(to)} of ${formatNumber(total)}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="rounded-md border px-3 py-1 text-[11.5px] font-semibold disabled:opacity-40"
            style={{ borderColor: 'var(--baseline)' }}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={to >= total || loading}
            className="rounded-md border px-3 py-1 text-[11.5px] font-semibold disabled:opacity-40"
            style={{ borderColor: 'var(--baseline)' }}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function OrderRow({
  order,
  timezone
}: {
  order: AdminOrder;
  timezone: string;
}) {
  const discounted = order.discountAmountCents > 0;

  return (
    <tr
      className="align-top hover:bg-[rgba(42,120,214,0.04)]"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <td className="px-4 py-2.5">
        <div className="font-semibold">{order.customer.fullName}</div>
        {order.customer.location && (
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {order.customer.location}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <a
          href={`mailto:${order.customer.email}`}
          className="block underline-offset-2 hover:underline"
          style={{ color: 'var(--series-1)' }}
        >
          {order.customer.email}
        </a>
        <a
          href={`tel:${order.customer.phone.replace(/[^+0-9]/g, '')}`}
          className="block text-[11.5px] tabular"
          style={{ color: 'var(--text-secondary)' }}
        >
          {order.customer.phone}
        </a>
      </td>
      <td className="px-4 py-2.5">
        <div>{order.productLabel}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {order.quantity} x · {order.seats} {order.seats === 1 ? 'seat' : 'seats'}
          {discounted && ` · ${order.discountCode}`}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={order.status} />
        {order.lastError && (
          <div
            className="mt-1 max-w-[220px] text-[10.5px] leading-snug"
            style={{ color: 'var(--status-serious)' }}
            title={order.lastError}
          >
            Needs a look
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="font-bold tabular">
          {formatMoney(order.totalAmountCents, order.currency)}
        </div>
        {discounted && (
          <div className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
            was {formatMoney(order.subtotalAmountCents, order.currency)}
          </div>
        )}
        {order.cardBrand && order.cardLast4 && (
          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            {order.cardBrand} ····{order.cardLast4}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 tabular" style={{ color: 'var(--text-secondary)' }}>
        {order.paidAt ? (
          formatDateTime(order.paidAt, timezone)
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>
            started {formatDateTime(order.createdAt, timezone)}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <code className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
          {order.orderRef}
        </code>
      </td>
    </tr>
  );
}

/**
 * Quote one CSV cell.
 *
 * Two separate jobs. The quoting is ordinary CSV escaping so a comma, a quote
 * or a newline inside a name cannot break the column layout. The leading
 * apostrophe on anything starting with `=`, `+`, `-` or `@` is the important
 * one: those cells are buyer-supplied text, and a spreadsheet opening the file
 * would otherwise treat them as formulas. That is a real attack on whoever
 * opens the export, not a theoretical one.
 */
export function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Build the CSV text for a set of orders. Exported so it can be tested. */
export function buildCsv(orders: AdminOrder[], timezone: string): string {
  const header = [
    'Reference',
    'Status',
    'Name',
    'Email',
    'Phone',
    'Location',
    'Item',
    'Kind',
    'Quantity',
    'Seats',
    'Subtotal',
    'Discount code',
    'Discount',
    'Paid',
    'Currency',
    'Card',
    'Paid at',
    'Started at',
    'Note'
  ];

  const rows = orders.map((order) =>
    [
      order.orderRef,
      order.status,
      order.customer.fullName,
      order.customer.email,
      order.customer.phone,
      order.customer.location,
      order.productLabel,
      order.productKind,
      order.quantity,
      order.seats,
      // Amounts as plain decimal numbers, not currency strings: this file is
      // opened in a spreadsheet and then added up.
      (order.subtotalAmountCents / 100).toFixed(2),
      order.discountCode,
      (order.discountAmountCents / 100).toFixed(2),
      (order.totalAmountCents / 100).toFixed(2),
      order.currency,
      order.cardBrand && order.cardLast4
        ? `${order.cardBrand} ${order.cardLast4}`
        : '',
      formatDateTime(order.paidAt, timezone),
      formatDateTime(order.createdAt, timezone),
      order.lastError
    ].map(csvCell).join(',')
  );

  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

function downloadCsv(orders: AdminOrder[], timezone: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`﻿${buildCsv(orders, timezone)}`], {
    // The byte-order mark above makes Excel read it as UTF-8, so a name with
    // an accent does not arrive mangled.
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dipawali-orders-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default OrdersTable;
