import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { buildCsv, csvCell } from './OrdersTable';
import type { AdminOrder, AdminStats, OrdersPage } from '../lib/api';

/**
 * The dashboard, driven through a real DOM with only `fetch` replaced.
 *
 * The figures are money and the rows are people, so what is tested is that the
 * page shows what the server said - never a number the browser worked out for
 * itself - and that a dead session ends in the sign-in screen rather than a
 * blank page.
 */

const STATS: AdminStats = {
  currency: 'USD',
  generatedAt: '2026-09-10T14:00:00Z',
  timezone: 'America/New_York',
  paid: {
    orders: 12,
    payers: 10,
    grossCents: 450000,
    subtotalCents: 470000,
    discountCents: 20000,
    seats: 26,
    averageOrderCents: 37500
  },
  tickets: { orders: 9, payers: 8, quantity: 17, grossCents: 150000 },
  sponsorships: {
    orders: 3,
    payers: 3,
    grossCents: 300000,
    seats: 8,
    byTier: [
      { sku: 'sponsor-gold', label: 'Gold Sponsor', orders: 1, grossCents: 500000, seats: 4 },
      { sku: 'sponsor-bronze', label: 'Bronze Sponsor', orders: 2, grossCents: 200000, seats: 4 }
    ]
  },
  pipeline: {
    pending: 2,
    failed: 1,
    canceled: 0,
    refunded: 1,
    refundedCents: 10000,
    abandoned: 2
  },
  daily: [
    { date: '2026-09-08', orders: 2, grossCents: 40000 },
    { date: '2026-09-09', orders: 5, grossCents: 210000 },
    { date: '2026-09-10', orders: 5, grossCents: 200000 }
  ]
};

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    orderRef: 'VH-0123456789ABCDEF',
    status: 'paid',
    sku: 'ticket-general',
    productKind: 'ticket',
    productLabel: 'General Admission',
    quantity: 2,
    seats: 2,
    subtotalAmountCents: 20000,
    discountCode: null,
    discountLabel: null,
    discountAmountCents: 0,
    totalAmountCents: 20000,
    currency: 'USD',
    cardBrand: 'VISA',
    cardLast4: '1111',
    paidAt: '2026-09-09T22:15:00Z',
    createdAt: '2026-09-09T22:10:00Z',
    provider: 'square',
    lastError: null,
    customer: {
      fullName: 'Asha Iyer',
      email: 'asha@example.com',
      phone: '(631) 555-0123',
      location: 'Hicksville, NY'
    },
    ...overrides
  };
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** Stub the three routes the app calls. */
function stubApi(
  options: {
    signInStatus?: number;
    signInBody?: object;
    statsStatus?: number;
    ordersStatus?: number;
    orders?: AdminOrder[];
    total?: number;
  } = {}
) {
  const calls: Call[] = [];

  const json = (status: number, body: object) =>
    Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve(JSON.stringify(body))
    });

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });

      if (url.includes('/admin/session')) {
        const status = options.signInStatus ?? 201;
        return json(
          status,
          options.signInBody ?? {
            token: 'vh1.9999999999999.signature',
            expiresAt: new Date(Date.now() + 3600_000).toISOString()
          }
        );
      }

      if (url.includes('/admin/stats')) {
        const status = options.statsStatus ?? 200;
        return json(
          status,
          status === 200
            ? STATS
            : { error: 'unauthorized', message: 'Please sign in again.' }
        );
      }

      if (url.includes('/admin/orders')) {
        const status = options.ordersStatus ?? 200;
        const rows = options.orders ?? [order()];
        const page: OrdersPage = {
          total: options.total ?? rows.length,
          limit: 25,
          offset: 0,
          orders: rows
        };
        return json(
          status,
          status === 200
            ? page
            : { error: 'unauthorized', message: 'Please sign in again.' }
        );
      }

      return json(404, { error: 'not_found' });
    })
  );

  return calls;
}

const EMAIL = 'vedic.heritage@gmail.com';
const PASSWORD = 'a-long-enough-password';

/** Fill both credential fields and submit. */
async function enterCredentials(
  user: ReturnType<typeof userEvent.setup>,
  email = EMAIL,
  password = PASSWORD
) {
  await user.type(screen.getByLabelText(/^email$/i), email);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

/** Sign in and wait for the dashboard. */
async function signedIn() {
  const user = userEvent.setup();
  render(<App />);

  await enterCredentials(user);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  );
  return user;
}

describe('Signing in', () => {
  beforeEach(() => stubApi());

  it('asks for credentials before showing anything', () => {
    render(<App />);

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    // No figures, and nothing that hints at a buyer, before authentication.
    expect(screen.queryByText(/raised so far/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('sends the credentials in the body, never in the URL', async () => {
    const calls = stubApi();
    await signedIn();

    const signIn = calls.find((call) => call.url.includes('/admin/session'))!;
    expect(signIn.init?.method).toBe('POST');
    // A query string ends up in history, in proxy logs and in the referrer of
    // the next request.
    expect(signIn.url).not.toContain('password');
    expect(signIn.url).not.toContain(EMAIL);

    const sent = JSON.parse(String(signIn.init?.body));
    expect(sent.email).toBe(EMAIL);
    expect(sent.password).toBe(PASSWORD);
  });

  it('trims the email but never the password', async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    render(<App />);

    // A password may legitimately end in a space; an email never usefully does.
    await enterCredentials(user, '  Vedic.Heritage@Gmail.com  ', 'has a space ');

    await waitFor(() =>
      expect(calls.some((call) => call.url.includes('/admin/session'))).toBe(true)
    );
    const sent = JSON.parse(
      String(calls.find((call) => call.url.includes('/admin/session'))!.init?.body)
    );
    expect(sent.email).toBe('Vedic.Heritage@Gmail.com');
    expect(sent.password).toBe('has a space ');
  });

  it('presents the session token as a bearer header on every read', async () => {
    const calls = stubApi();
    await signedIn();

    const reads = calls.filter((call) => !call.url.includes('/admin/session'));
    expect(reads.length).toBeGreaterThan(0);
    for (const call of reads) {
      const headers = call.init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer vh1.9999999999999.signature');
    }
  });

  it('shows the server reason, clears the password, keeps the email', async () => {
    stubApi({
      signInStatus: 401,
      signInBody: {
        error: 'invalid_credentials',
        message: 'That email and password combination is not correct.'
      }
    });
    const user = userEvent.setup();
    render(<App />);

    await enterCredentials(user, EMAIL, 'wrong-password');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not correct/i);
    // The message must not reveal which half was wrong.
    expect(alert).not.toHaveTextContent(/no such|unknown email|not registered/i);
    // A rejected password must not sit in the field or in the DOM; retyping the
    // email would be friction for no security gain.
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue(EMAIL);
  });

  it('will not submit with only one field filled', async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/^email$/i), EMAIL);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();
    expect(calls.some((call) => call.url.includes('/admin/session'))).toBe(false);
  });

  it('can reveal the password, and re-masks it after a rejection', async () => {
    stubApi({ signInStatus: 401 });
    const user = userEvent.setup();
    render(<App />);

    const field = screen.getByLabelText(/^password$/i);
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(field).toHaveAttribute('type', 'password');

    // Revealed, then rejected: the next attempt starts masked again rather
    // than typing the retry into a field left in clear text.
    await user.click(screen.getByRole('button', { name: /show password/i }));
    await enterCredentials(user);

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'type',
      'password'
    );
  });

  it('explains a 404 as "not switched on" rather than a broken link', async () => {
    // The API answers 404 for the whole /admin surface when it has no
    // passphrase configured, which is a setup step, not a wrong URL.
    stubApi({ signInStatus: 404, signInBody: { error: 'not_found' } });
    const user = userEvent.setup();
    render(<App />);

    await enterCredentials(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/ADMIN_PASSWORD/);
  });
});

describe('Headline figures', () => {
  beforeEach(() => stubApi());

  it('shows what the server said, formatted, without recomputing it', async () => {
    await signedIn();

    // Raised, people, tickets, sponsors - the four questions asked of it.
    expect(screen.getByText('$4,500')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: /people who have paid/i })).getByText('10')
    ).toBeInTheDocument();
    expect(screen.getByText(/17 tickets/)).toBeInTheDocument();
    expect(screen.getByText(/3 sponsorships/)).toBeInTheDocument();
    expect(screen.getByText(/26 seats committed/)).toBeInTheDocument();
    expect(screen.getByText(/\$375 per order/)).toBeInTheDocument();
  });

  it('separates money taken from payments merely started', async () => {
    await signedIn();

    const pending = screen.getByRole('group', { name: /started, not finished/i });
    expect(within(pending).getByText('2')).toBeInTheDocument();
    // The headline is captured money only, so the two figures must not be equal
    // by accident: 12 paid orders, 2 pending.
    expect(screen.getByText(/12 completed payments/)).toBeInTheDocument();
  });

  it('reports what discount codes cost the fundraiser', async () => {
    await signedIn();

    const discounts = screen.getByRole('group', { name: /discounts given/i });
    expect(within(discounts).getByText('$200')).toBeInTheDocument();
    expect(within(discounts).getByText(/face value \$4,700/i)).toBeInTheDocument();
  });

  it('lists sponsorship tiers largest first', async () => {
    await signedIn();

    const tiers = screen.getByRole('table', { name: /sponsorship tiers/i });
    expect(tiers).toBeInTheDocument();
    const rows = within(tiers).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/gold sponsor/i);
    expect(rows[1]).toHaveTextContent(/bronze sponsor/i);
  });

  it('plots a day per payment day, and offers the same figures as a table', async () => {
    await signedIn();

    const chart = screen.getByRole('img', { name: /money taken per day/i });
    expect(chart).toBeInTheDocument();
    // The peak is labelled directly, so the chart reads without hovering.
    expect(within(chart).getByText('$2,100')).toBeInTheDocument();

    // A table equivalent exists for anyone not reading the picture.
    const table = screen.getByRole('table', { name: /money taken per day/i });
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3 days
  });
});

describe('Orders table', () => {
  it('shows the buyer details the committee needs to make a call', async () => {
    stubApi();
    await signedIn();

    const table = screen.getByRole('table', { name: /orders/i });
    // The rows arrive on their own request, after the figures.
    expect(await within(table).findByText('Asha Iyer')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'asha@example.com' })).toHaveAttribute(
      'href',
      'mailto:asha@example.com'
    );
    // The phone is a tel: link, so it dials straight from a phone. The digits
    // are as the buyer typed them - the stored number is not rewritten here.
    expect(within(table).getByRole('link', { name: '(631) 555-0123' })).toHaveAttribute(
      'href',
      'tel:6315550123'
    );
    // Scoped to the row: "Paid" is also a column heading.
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('Paid')).toBeInTheDocument();
    expect(within(row).getByText('VH-0123456789ABCDEF')).toBeInTheDocument();
  });

  it('asks the server to filter, rather than filtering the page it has', async () => {
    const calls = stubApi();
    const user = await signedIn();

    await user.selectOptions(screen.getByLabelText(/filter by status/i), 'pending');

    await waitFor(() =>
      expect(
        calls.some((call) => call.url.includes('status=pending'))
      ).toBe(true)
    );
  });

  it('asks the server to sort, and says which way in the markup', async () => {
    const calls = stubApi();
    const user = await signedIn();

    await user.click(screen.getByRole('button', { name: /^paid/i }));

    await waitFor(() =>
      expect(calls.some((call) => call.url.includes('sort=amount'))).toBe(true)
    );
    const header = screen.getByRole('columnheader', { name: /paid/i });
    expect(header).toHaveAttribute('aria-sort');
  });

  it('debounces the search into one request', async () => {
    const calls = stubApi();
    const user = await signedIn();

    await user.type(screen.getByLabelText(/search orders/i), 'asha');

    await waitFor(() =>
      expect(calls.some((call) => call.url.includes('search=asha'))).toBe(true)
    );
    // One request for the whole word, not one per keystroke.
    expect(calls.filter((call) => call.url.includes('search=')).length).toBe(1);
  });

  it('says so when a filter matches nothing, rather than showing an empty grid', async () => {
    stubApi({ orders: [], total: 0 });
    const user = await signedIn();

    await user.type(screen.getByLabelText(/search orders/i), 'nobody');
    expect(await screen.findByText(/no orders match that filter/i)).toBeInTheDocument();
  });

  it('shows a discounted order at what was actually charged', async () => {
    stubApi({
      orders: [
        order({
          subtotalAmountCents: 30000,
          totalAmountCents: 27000,
          discountCode: 'DIPAWALI10',
          discountAmountCents: 3000
        })
      ]
    });
    await signedIn();

    const table = screen.getByRole('table', { name: /orders/i });
    expect(await within(table).findByText('$270')).toBeInTheDocument();
    expect(within(table).getByText(/was \$300/i)).toBeInTheDocument();
    expect(within(table).getByText(/DIPAWALI10/)).toBeInTheDocument();
  });

  it('marks an order the reconciliation flagged', async () => {
    stubApi({
      orders: [order({ lastError: 'Amount mismatch: provider captured 1' })]
    });
    await signedIn();

    expect(await screen.findByText(/needs a look/i)).toBeInTheDocument();
  });
});

describe('When the session ends', () => {
  it('returns to sign-in and says why, instead of showing a broken page', async () => {
    // The token is present but the API rejects it - an expired session.
    stubApi({ statsStatus: 401 });
    const user = userEvent.setup();
    render(<App />);

    await enterCredentials(user);

    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('forgets the token on sign out', async () => {
    stubApi();
    const user = await signedIn();

    expect(window.sessionStorage.getItem('vh-admin-token')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(window.sessionStorage.getItem('vh-admin-token')).toBeNull();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });
});

describe('CSV export', () => {
  it('writes amounts as numbers a spreadsheet can add up', () => {
    const csv = buildCsv(
      [order({ subtotalAmountCents: 30000, discountAmountCents: 3000, totalAmountCents: 27000 })],
      'America/New_York'
    );
    const [header, row] = csv.split('\r\n');

    expect(header).toContain('"Paid"');
    expect(row).toContain('"270.00"');
    expect(row).toContain('"300.00"');
    // Not "$270" - a currency string cannot be summed.
    expect(row).not.toContain('$270');
  });

  it('carries the buyer details the door list needs', () => {
    const csv = buildCsv([order()], 'America/New_York');

    expect(csv).toContain('Asha Iyer');
    expect(csv).toContain('asha@example.com');
    expect(csv).toContain('(631) 555-0123');
    expect(csv).toContain('Hicksville, NY');
    expect(csv).toContain('VH-0123456789ABCDEF');
  });

  it('neutralises a cell a spreadsheet would run as a formula', () => {
    // A buyer-supplied name is untrusted text. Excel treats a leading = as a
    // formula, which is a live attack on whoever opens the export.
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('-2+3')).toBe(`"'-2+3"`);
    // Ordinary text is untouched, and quotes are doubled rather than dropped.
    expect(csvCell('Asha Iyer')).toBe('"Asha Iyer"');
    expect(csvCell('O"Brien')).toBe('"O""Brien"');
    expect(csvCell(null)).toBe('""');
  });

  it('keeps a comma inside a field from becoming a new column', () => {
    const csv = buildCsv(
      [order({ customer: { ...order().customer, location: 'Hicksville, NY' } })],
      'America/New_York'
    );
    expect(csv).toContain('"Hicksville, NY"');
  });
});
