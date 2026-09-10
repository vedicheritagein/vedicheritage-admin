import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createDiscount,
  deleteDiscount,
  fetchDiscounts,
  setDiscountActive,
  updateDiscount,
  type DiscountCodeInput,
  type DiscountCodeView,
  type DiscountKind,
  type DiscountScope
} from '../lib/api';
import { formatMoney, formatNumber } from '../lib/format';

export interface DiscountCodesProps {
  token: string;
  currency: string;
  /** Bumped by the dashboard's Refresh button, to reload with the figures. */
  refreshKey: number;
  onSessionExpired: () => void;
}

/**
 * Create, switch off and delete discount codes.
 *
 * The codes live in the database and are read at the moment of purchase, so
 * anything done here is live on the public site immediately - no deploy, no
 * restart, no cache to wait out. That immediacy is the reason the destructive
 * action is deliberately awkward and the reversible one is a single click:
 *
 *  - **Switch off** is the everyday control. It stops the code at once and
 *    keeps the record of what it gave away.
 *  - **Delete** is offered only for a code nothing has redeemed. Once an order
 *    has paid with it, that order cites the code, and deleting it would leave
 *    the order explaining itself with a code that no longer exists.
 *
 * Amounts are typed and shown in dollars and sent in cents, because money is
 * only ever integer cents past this component - the same rule the API follows.
 */

const EMPTY_FORM = {
  code: '',
  kind: 'percent' as DiscountKind,
  /** As typed: a percentage, or dollars for a fixed amount. */
  value: '',
  label: '',
  appliesTo: 'ticket' as DiscountScope,
  minSubtotal: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  oncePerCustomer: false
};

type FormState = typeof EMPTY_FORM;

/** Dollars as typed -> integer cents, or null for blank. NaN stays NaN. */
function dollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(/[$,]/g, '');
  if (trimmed === '') return null;
  const amount = Number.parseFloat(trimmed);
  // Rounded, not truncated: "12.005" typed by hand should not silently drop a
  // cent, and a float that cannot be represented exactly must not leave a
  // fraction of a cent in the payload.
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

function centsToDollars(cents: number | null): string {
  return cents === null ? '' : String(cents / 100);
}

/** A local datetime-local value -> ISO, or null for blank. */
function toIso(value: string): string | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // datetime-local wants local time with no zone suffix.
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInput(form: FormState): DiscountCodeInput {
  const isPercent = form.kind === 'percent';

  return {
    code: form.code.trim(),
    kind: form.kind,
    // A percentage is points; a fixed amount is cents.
    value: isPercent
      ? Number.parseInt(form.value.trim(), 10)
      : (dollarsToCents(form.value) ?? Number.NaN),
    label: form.label.trim(),
    appliesTo: form.appliesTo,
    minSubtotalCents: dollarsToCents(form.minSubtotal),
    maxDiscountCents: isPercent ? dollarsToCents(form.maxDiscount) : null,
    startsAt: toIso(form.startsAt),
    endsAt: toIso(form.endsAt),
    maxRedemptions:
      form.maxRedemptions.trim() === ''
        ? null
        : Number.parseInt(form.maxRedemptions.trim(), 10),
    oncePerCustomer: form.oncePerCustomer
  };
}

/** What a code gives, in words, e.g. "10% off, up to $50". */
function describeValue(
  discount: DiscountCodeView,
  currency: string
): string {
  if (discount.kind === 'percent') {
    const cap =
      discount.maxDiscountCents !== null
        ? `, up to ${formatMoney(discount.maxDiscountCents, currency)}`
        : '';
    return `${discount.value}% off${cap}`;
  }
  return `${formatMoney(discount.value, currency)} off`;
}

const SCOPE_LABEL: Record<DiscountScope, string> = {
  ticket: 'Tickets',
  sponsorship: 'Sponsorships',
  all: 'Both'
};

export function DiscountCodes({
  token,
  currency,
  refreshKey,
  onSessionExpired
}: DiscountCodesProps) {
  const [discounts, setDiscounts] = useState<DiscountCodeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  /**
   * The code being edited, or null when the form is creating a new one.
   *
   * The same form does both, because the fields are identical and a separate
   * edit dialog would be a second place for the rules to drift.
   */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  const handleFailure = useCallback((cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.isUnauthorized) {
      expired.current();
      return;
    }
    setError(cause instanceof ApiError ? cause.message : fallback);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchDiscounts(token)
      .then((result) => {
        if (cancelled) return;
        setDiscounts(result.discounts);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        handleFailure(cause, 'Could not load the discount codes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, reload, handleFailure]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  /** Load an existing code into the form for editing. */
  const startEdit = (discount: DiscountCodeView) => {
    setForm({
      code: discount.code,
      kind: discount.kind,
      // A percentage is points as stored; a fixed amount is cents, shown as
      // dollars because that is what a person types.
      value:
        discount.kind === 'percent'
          ? String(discount.value)
          : centsToDollars(discount.value),
      label: discount.label,
      appliesTo: discount.appliesTo,
      minSubtotal: centsToDollars(discount.minSubtotalCents),
      maxDiscount: centsToDollars(discount.maxDiscountCents),
      startsAt: toLocalInput(discount.startsAt),
      endsAt: toLocalInput(discount.endsAt),
      maxRedemptions:
        discount.maxRedemptions === null ? '' : String(discount.maxRedemptions),
      oncePerCustomer: discount.oncePerCustomer
    });
    setEditing(discount.code);
    setFormOpen(true);
    setError(null);
    setNotice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      // Editing keeps the code from the row, not from the field: a code is
      // printed on flyers and cited by orders that already redeemed it, so it
      // cannot be renamed. The API refuses a rename for the same reason.
      const { discount } = editing
        ? await updateDiscount(token, editing, toInput(form))
        : await createDiscount(token, toInput(form));

      setForm(EMPTY_FORM);
      setFormOpen(false);
      setEditing(null);
      setNotice(
        editing
          ? `${discount.code} updated - the new terms apply to the next booking.`
          : `${discount.code} is live on the booking form now - buyers can use it immediately.`
      );
      setReload((key) => key + 1);
    } catch (cause: unknown) {
      handleFailure(cause, editing ? 'Could not save the code.' : 'Could not create the code.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (discount: DiscountCodeView) => {
    setBusyCode(discount.code);
    setError(null);
    setNotice(null);

    try {
      const next = !discount.active;
      await setDiscountActive(token, discount.code, next);
      setNotice(
        next
          ? `${discount.code} is on again and works on the next booking.`
          : `${discount.code} is off and stops working immediately.`
      );
      setReload((key) => key + 1);
    } catch (cause: unknown) {
      handleFailure(cause, 'Could not change the code.');
    } finally {
      setBusyCode(null);
    }
  };

  const remove = async (discount: DiscountCodeView) => {
    // A confirm rather than an undo: there is nothing to undo a delete with,
    // and the code is only deletable because nothing has used it.
    if (
      !window.confirm(
        `Delete ${discount.code}? Nothing has used it, so this removes it completely.`
      )
    ) {
      return;
    }

    setBusyCode(discount.code);
    setError(null);
    setNotice(null);

    try {
      await deleteDiscount(token, discount.code);
      setNotice(`${discount.code} deleted.`);
      setReload((key) => key + 1);
    } catch (cause: unknown) {
      handleFailure(cause, 'Could not delete the code.');
    } finally {
      setBusyCode(null);
    }
  };

  const isPercent = form.kind === 'percent';
  const rows = discounts ?? [];

  return (
    <section
      className="rounded-xl border bg-[var(--surface-1)]"
      style={{ borderColor: 'var(--hairline)' }}
      aria-labelledby="discounts-heading"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div>
          <h2 id="discounts-heading" className="m-0 text-[15px] font-bold">
            Discount codes
          </h2>
          <p
            className="m-0 mt-0.5 text-[11.5px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Anything you change here takes effect on the booking form
            immediately.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (formOpen) {
              closeForm();
              return;
            }
            setFormOpen(true);
            setEditing(null);
            setForm(EMPTY_FORM);
            setError(null);
            setNotice(null);
          }}
          className="rounded-md px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: 'var(--brand-maroon)' }}
        >
          {formOpen ? 'Cancel' : 'New code'}
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className="m-0 border-b px-4 py-2.5 text-[12px] font-semibold"
          style={{
            borderColor: 'var(--hairline)',
            color: '#0a7a0a',
            background: 'rgba(12, 163, 12, 0.08)'
          }}
        >
          {notice}
        </p>
      )}

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

      {formOpen && (
        <form
          onSubmit={submit}
          className="grid gap-3 border-b px-4 py-4 sm:grid-cols-2 lg:grid-cols-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <Field
            label="Code"
            hint={
              editing
                ? 'Cannot be renamed - it is on flyers and on past orders.'
                : 'Upper case, no spaces. Printed on flyers.'
            }
          >
            <input
              name="code"
              value={form.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              placeholder="NAVRATRI15"
              className={inputClass}
              style={
                editing
                  ? { ...inputStyle, background: '#f3f3f1', color: 'var(--text-secondary)' }
                  : inputStyle
              }
              readOnly={editing !== null}
              required
            />
          </Field>

          <Field label="Type">
            <select
              name="kind"
              value={form.kind}
              onChange={(event) => set('kind', event.target.value as DiscountKind)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </Field>

          <Field
            label={isPercent ? 'Percentage' : 'Amount off'}
            hint={isPercent ? '1 to 100' : 'In dollars'}
          >
            <input
              name="value"
              value={form.value}
              onChange={(event) => set('value', event.target.value)}
              placeholder={isPercent ? '15' : '25'}
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
              required
            />
          </Field>

          <Field
            label="Description"
            hint="Buyers see this on the form and the receipt."
          >
            <input
              name="label"
              value={form.label}
              onChange={(event) => set('label', event.target.value)}
              placeholder="15% off admission"
              className={inputClass}
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Applies to">
            <select
              name="appliesTo"
              value={form.appliesTo}
              onChange={(event) =>
                set('appliesTo', event.target.value as DiscountScope)
              }
              className={inputClass}
              style={inputStyle}
            >
              <option value="ticket">Tickets only</option>
              <option value="sponsorship">Sponsorships only</option>
              <option value="all">Tickets and sponsorships</option>
            </select>
          </Field>

          <Field label="Minimum order" hint="Optional. Dollars.">
            <input
              name="minSubtotal"
              value={form.minSubtotal}
              onChange={(event) => set('minSubtotal', event.target.value)}
              placeholder="200"
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          {isPercent && (
            <Field
              label="Most it can give"
              hint="Strongly recommended: caps what a big order gives away."
            >
              <input
                name="maxDiscount"
                value={form.maxDiscount}
                onChange={(event) => set('maxDiscount', event.target.value)}
                placeholder="50"
                inputMode="decimal"
                className={inputClass}
                style={inputStyle}
              />
            </Field>
          )}

          <Field label="Starts" hint="Optional. Blank means now.">
            <input
              name="startsAt"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set('startsAt', event.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field label="Ends" hint="Optional. Blank means no end.">
            <input
              name="endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set('endsAt', event.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field label="Total uses" hint="Optional. Counts paid orders only.">
            <input
              name="maxRedemptions"
              value={form.maxRedemptions}
              onChange={(event) => set('maxRedemptions', event.target.value)}
              placeholder="100"
              inputMode="numeric"
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <label className="flex items-center gap-2 self-end pb-2 text-[12px]">
            <input
              name="oncePerCustomer"
              type="checkbox"
              checked={form.oncePerCustomer}
              onChange={(event) => set('oncePerCustomer', event.target.checked)}
            />
            One use per email address
          </label>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
              style={{ background: 'var(--brand-gold)' }}
            >
              {saving
                ? editing
                  ? 'Saving...'
                  : 'Creating...'
                : editing
                  ? 'Save changes'
                  : 'Create code'}
            </button>
            <span
              className="ml-3 text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {editing
                ? 'The new terms apply to the next booking.'
                : 'It will work on the booking form as soon as it is created.'}
            </span>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <caption className="sr-only">Discount codes</caption>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {['Code', 'Gives', 'Applies to', 'Limits', 'Used', 'Status', ''].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap border-b px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                    style={{ borderColor: 'var(--hairline)' }}
                  >
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Loading codes...
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  No discount codes yet. Create one and it works straight away.
                </td>
              </tr>
            )}

            {rows.map((discount) => (
              <tr
                key={discount.code}
                style={{ borderBottom: '1px solid var(--hairline)' }}
                className="align-top"
              >
                <td className="px-4 py-2.5">
                  <code className="text-[12px] font-bold tabular">
                    {discount.code}
                  </code>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {discount.label}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-semibold">
                  {describeValue(discount, currency)}
                </td>
                <td className="px-4 py-2.5">{SCOPE_LABEL[discount.appliesTo]}</td>
                <td
                  className="px-4 py-2.5 text-[11.5px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {discount.minSubtotalCents !== null && (
                    <div>
                      Orders over {formatMoney(discount.minSubtotalCents, currency)}
                    </div>
                  )}
                  {discount.maxRedemptions !== null && (
                    <div>Max {formatNumber(discount.maxRedemptions)} uses</div>
                  )}
                  {discount.oncePerCustomer && <div>One per person</div>}
                  {discount.endsAt && (
                    <div>Ends {new Date(discount.endsAt).toLocaleDateString()}</div>
                  )}
                  {discount.minSubtotalCents === null &&
                    discount.maxRedemptions === null &&
                    !discount.oncePerCustomer &&
                    !discount.endsAt && <span>No limits</span>}
                </td>
                <td className="px-4 py-2.5 tabular">
                  {formatNumber(discount.redeemed)}
                </td>
                <td className="px-4 py-2.5">
                  {discount.unusableReason ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: '#8a6100',
                        backgroundColor: 'rgba(250, 178, 25, 0.16)'
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: '#8a6100' }}
                      />
                      {discount.unusableReason}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: 'var(--status-good)',
                        backgroundColor: 'rgba(12, 163, 12, 0.10)'
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: 'var(--status-good)' }}
                      />
                      Live
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => startEdit(discount)}
                    className="mr-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: 'var(--baseline)' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(discount)}
                    disabled={busyCode === discount.code}
                    className="rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                    style={{ borderColor: 'var(--baseline)' }}
                  >
                    {discount.active ? 'Switch off' : 'Switch on'}
                  </button>
                  {discount.deletable && (
                    <button
                      type="button"
                      onClick={() => void remove(discount)}
                      disabled={busyCode === discount.code}
                      className="ml-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                      style={{
                        borderColor: 'rgba(208, 59, 59, 0.4)',
                        color: 'var(--status-critical)'
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputClass = 'w-full rounded-md border px-2.5 py-1.5 text-[12.5px]';
const inputStyle = { borderColor: 'var(--baseline)', background: '#fff' };

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.07em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          className="mt-0.5 block text-[10.5px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

export default DiscountCodes;
