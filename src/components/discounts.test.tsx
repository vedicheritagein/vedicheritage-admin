import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscountCodes } from './DiscountCodes';
import type { DiscountCodeView } from '../lib/api';

/**
 * Managing discount codes.
 *
 * What these pin down is the boundary between what a person types and what the
 * API is told: dollars in the form, integer cents on the wire, and a switch-off
 * that sends nothing but the flag so it cannot quietly rewrite the rest of a
 * code's terms with whatever the form happened to hold.
 */

const TOKEN = 'vh1.9999999999999.signature';

function discount(overrides: Partial<DiscountCodeView> = {}): DiscountCodeView {
  return {
    code: 'DIPAWALI10',
    kind: 'percent',
    value: 10,
    label: '10% off admission',
    appliesTo: 'ticket',
    minSubtotalCents: 20000,
    maxDiscountCents: 5000,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    oncePerCustomer: false,
    active: true,
    createdBy: 'seed',
    createdAt: '2026-09-01T10:00:00Z',
    redeemed: 0,
    deletable: true,
    unusableReason: null,
    ...overrides
  };
}

interface Call {
  url: string;
  init?: RequestInit;
}

function stubApi(
  options: { discounts?: DiscountCodeView[]; writeStatus?: number; writeBody?: object } = {}
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

      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return json(200, { discounts: options.discounts ?? [discount()] });
      }

      const status = options.writeStatus ?? (method === 'DELETE' ? 204 : 201);
      if (status >= 400) {
        return json(status, options.writeBody ?? { error: 'invalid_discount', message: 'No good.' });
      }
      if (method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') });
      }
      return json(status, { discount: discount({ code: 'NAVRATRI15' }) });
    })
  );

  return calls;
}

function renderSection() {
  render(
    <DiscountCodes
      token={TOKEN}
      currency="USD"
      refreshKey={0}
      onSessionExpired={() => undefined}
    />
  );
  return userEvent.setup();
}

/** The body of the last non-GET request. */
function lastWrite(calls: Call[]) {
  const write = [...calls].reverse().find((call) => (call.init?.method ?? 'GET') !== 'GET');
  return {
    url: write!.url,
    method: write!.init?.method,
    body: write!.init?.body ? JSON.parse(String(write!.init.body)) : undefined
  };
}

describe('Discount codes list', () => {
  beforeEach(() => stubApi());

  it('says what each code gives, and how many have used it', async () => {
    renderSection();

    expect(await screen.findByText('DIPAWALI10')).toBeInTheDocument();
    // The cap belongs in the description: "10% off" alone is misleading.
    expect(screen.getByText('10% off, up to $50')).toBeInTheDocument();
    expect(screen.getByText(/orders over \$200/i)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('explains why an unusable code is unusable', async () => {
    stubApi({
      discounts: [discount({ active: false, unusableReason: 'Switched off' })]
    });
    renderSection();

    expect(await screen.findByText('Switched off')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('offers no Delete for a code an order has paid with', async () => {
    // The order cites the code; deleting it would leave that order explaining
    // itself with something that no longer exists.
    stubApi({ discounts: [discount({ redeemed: 3, deletable: false })] });
    renderSection();

    expect(await screen.findByRole('button', { name: /switch off/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});

describe('Creating a code', () => {
  // Globals are unstubbed after every test, so each one needs its own.
  beforeEach(() => stubApi());

  it('sends a percentage as points and a cap in cents', async () => {
    const calls = stubApi();
    const user = renderSection();
    await user.click(await screen.findByRole('button', { name: /new code/i }));

    await user.type(screen.getByLabelText(/^code/i), 'navratri15');
    await user.type(screen.getByLabelText(/percentage/i), '15');
    await user.type(screen.getByLabelText(/description/i), '15% off admission');
    await user.type(screen.getByLabelText(/minimum order/i), '200');
    await user.type(screen.getByLabelText(/most it can give/i), '75.50');
    await user.click(screen.getByRole('button', { name: /create code/i }));

    await waitFor(() => expect(lastWrite(calls).method).toBe('POST'));
    const { body } = lastWrite(calls);

    expect(body.code).toBe('NAVRATRI15');
    expect(body.kind).toBe('percent');
    // Points for a percentage...
    expect(body.value).toBe(15);
    // ...and cents for every amount, from dollars typed in the form.
    expect(body.minSubtotalCents).toBe(20000);
    expect(body.maxDiscountCents).toBe(7550);
  });

  it('sends a fixed amount as cents', async () => {
    const calls = stubApi();
    const user = renderSection();
    await user.click(await screen.findByRole('button', { name: /new code/i }));

    await user.selectOptions(screen.getByLabelText(/^type/i), 'fixed');
    await user.type(screen.getByLabelText(/^code/i), 'FLAT25');
    await user.type(screen.getByLabelText(/amount off/i), '25');
    await user.type(screen.getByLabelText(/description/i), '$25 off');
    await user.click(screen.getByRole('button', { name: /create code/i }));

    await waitFor(() => expect(lastWrite(calls).method).toBe('POST'));
    expect(lastWrite(calls).body.value).toBe(2500);
    // A cap is a percentage concept; a fixed amount is already its own cap.
    expect(lastWrite(calls).body.maxDiscountCents).toBeNull();
  });

  it('says the code is live immediately, because it is', async () => {
    const user = renderSection();
    await user.click(await screen.findByRole('button', { name: /new code/i }));

    await user.type(screen.getByLabelText(/^code/i), 'NAVRATRI15');
    await user.type(screen.getByLabelText(/percentage/i), '15');
    await user.type(screen.getByLabelText(/description/i), '15% off');
    await user.click(screen.getByRole('button', { name: /create code/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /live on the booking form now/i
    );
  });

  it('shows the server reason when a code is refused', async () => {
    stubApi({
      writeStatus: 400,
      writeBody: {
        error: 'invalid_discount',
        message: 'A percentage cannot be above 100.'
      }
    });
    const user = renderSection();
    await user.click(await screen.findByRole('button', { name: /new code/i }));

    await user.type(screen.getByLabelText(/^code/i), 'TOOMUCH');
    await user.type(screen.getByLabelText(/percentage/i), '150');
    await user.type(screen.getByLabelText(/description/i), 'Too much');
    await user.click(screen.getByRole('button', { name: /create code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/above 100/i);
  });
});

describe('Switching a code off', () => {
  // Globals are unstubbed after every test, so each one needs its own.
  beforeEach(() => stubApi());

  it('sends nothing but the flag', async () => {
    const calls = stubApi();
    const user = renderSection();

    await user.click(await screen.findByRole('button', { name: /switch off/i }));

    await waitFor(() => expect(lastWrite(calls).method).toBe('PATCH'));
    const { body, url } = lastWrite(calls);
    // Not the whole definition: a switch-off must not rewrite the terms with
    // whatever the form happened to hold.
    expect(body).toEqual({ active: false });
    expect(url).toContain('/admin/discounts/DIPAWALI10');
  });

  it('says it stops working immediately', async () => {
    const user = renderSection();
    await user.click(await screen.findByRole('button', { name: /switch off/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /stops working immediately/i
    );
  });
});

describe('Editing a code', () => {
  // Globals are unstubbed after every test, so each one needs its own.
  beforeEach(() => stubApi());

  it('prefills from the row, in dollars', async () => {
    stubApi({
      discounts: [discount({ kind: 'fixed', value: 2500, maxDiscountCents: null })]
    });
    const user = renderSection();

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    // Stored as 2500 cents, shown as 25 dollars.
    expect(screen.getByLabelText(/amount off/i)).toHaveValue('25');
    expect(screen.getByLabelText(/minimum order/i)).toHaveValue('200');
  });

  it('will not rename a code, and patches the one from the row', async () => {
    const calls = stubApi();
    const user = renderSection();

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    // Printed on flyers and cited by past orders, so it is read-only.
    expect(screen.getByLabelText(/^code/i)).toHaveAttribute('readonly');

    await user.clear(screen.getByLabelText(/percentage/i));
    await user.type(screen.getByLabelText(/percentage/i), '20');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(lastWrite(calls).method).toBe('PATCH'));
    expect(lastWrite(calls).url).toContain('/admin/discounts/DIPAWALI10');
    expect(lastWrite(calls).body.value).toBe(20);
  });
});

describe('Deleting a code', () => {
  // Globals are unstubbed after every test, so each one needs its own.
  beforeEach(() => stubApi());

  it('asks first, and sends a DELETE when confirmed', async () => {
    const calls = stubApi();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = renderSection();

    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(lastWrite(calls).method).toBe('DELETE'));
    expect(lastWrite(calls).url).toContain('/admin/discounts/DIPAWALI10');
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const calls = stubApi();
    vi.stubGlobal('confirm', vi.fn(() => false));
    const user = renderSection();

    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    expect(calls.every((call) => (call.init?.method ?? 'GET') === 'GET')).toBe(true);
  });
});
