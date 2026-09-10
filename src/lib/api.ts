/**
 * Client for the admin API.
 *
 * Every call carries the session token as a bearer header and every response
 * of 401 means the session is over - the caller's job is then to show the
 * sign-in screen again, never to retry silently.
 *
 * Nothing here caches. The figures are money and the rows are people's contact
 * details; a stale dashboard is worse than a slow one, and the API marks all of
 * it `no-store` for the same reason.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Ten seconds: enough for a cold start, short enough not to feel hung. */
const REQUEST_TIMEOUT_MS = 10_000;

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'refunded';

export type ProductKind = 'ticket' | 'sponsorship';

export interface TierBreakdown {
  sku: string;
  label: string;
  orders: number;
  grossCents: number;
  seats: number;
}

export interface DailyPoint {
  date: string;
  orders: number;
  grossCents: number;
}

export interface AdminStats {
  currency: string;
  generatedAt: string;
  timezone: string;
  paid: {
    orders: number;
    payers: number;
    grossCents: number;
    subtotalCents: number;
    discountCents: number;
    seats: number;
    averageOrderCents: number;
  };
  tickets: {
    orders: number;
    payers: number;
    quantity: number;
    grossCents: number;
  };
  sponsorships: {
    orders: number;
    payers: number;
    grossCents: number;
    seats: number;
    byTier: TierBreakdown[];
  };
  pipeline: {
    pending: number;
    failed: number;
    canceled: number;
    refunded: number;
    refundedCents: number;
    abandoned: number;
  };
  daily: DailyPoint[];
}

export interface AdminOrder {
  orderRef: string;
  status: OrderStatus;
  sku: string;
  productKind: ProductKind;
  productLabel: string;
  quantity: number;
  seats: number;
  subtotalAmountCents: number;
  discountCode: string | null;
  discountLabel: string | null;
  discountAmountCents: number;
  totalAmountCents: number;
  currency: string;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: string | null;
  createdAt: string;
  provider: string;
  lastError: string | null;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    location: string | null;
  };
}

export interface OrdersPage {
  total: number;
  limit: number;
  offset: number;
  orders: AdminOrder[];
}

export type OrderSort = 'createdAt' | 'paidAt' | 'amount' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface OrdersQuery {
  status?: OrderStatus | '';
  kind?: ProductKind | '';
  search?: string;
  limit?: number;
  offset?: number;
  sort?: OrderSort;
  direction?: SortDirection;
}

/** An error carrying the server's machine-readable code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** True when the session is gone and signing in again is the only fix. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiError(
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? 'The server took too long to answer. Check the API is running.'
        : 'Could not reach the server. Check the API is running.',
      0
    );
  }

  const text = await response.text();
  let payload: unknown = {};
  let parsed = true;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    parsed = false;
  }

  if (!response.ok) {
    // Two envelope shapes, exactly as on the public API: the handlers' own
    // `{ error, message }`, and node-server-engine's `{ errorCode, hint }`
    // for anything a request validator rejected.
    const body = payload as {
      error?: string;
      message?: string;
      errorCode?: string;
      hint?: unknown;
    };

    const hint =
      body.hint && typeof body.hint === 'object'
        ? Object.values(body.hint as Record<string, unknown>)
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
        : typeof body.hint === 'string'
          ? body.hint
          : undefined;

    // A 404 here does not mean "no such page" - the admin routes answer 404
    // when the API has no admin credentials configured, so say what that means
    // rather than leaving whoever is setting this up hunting a broken URL.
    const message =
      response.status === 404 && !body.message
        ? 'The dashboard is switched off on the server. Set ADMIN_EMAIL and ADMIN_PASSWORD in the API environment and restart it.'
        : (body.message ?? hint ?? 'Something went wrong. Please try again.');

    throw new ApiError(
      body.error ?? body.errorCode ?? 'request_failed',
      message,
      response.status
    );
  }

  // A 204 is a successful empty answer - the delete route uses one - so an
  // empty body there is correct rather than suspicious.
  if (!parsed && response.status !== 204) {
    // A 2xx that is not JSON means the request never reached the API - a dev
    // server answering with index.html, or a proxy in the way.
    throw new ApiError(
      'invalid_response',
      'The server sent something unexpected. Is the API proxy configured?',
      response.status
    );
  }

  return payload as T;
}

export interface SignInResult {
  token: string;
  expiresAt: string;
}

/**
 * Exchange the email and password for a session token.
 *
 * Sent in the body, never in the URL: a query string ends up in browser
 * history, in proxy logs and in the referrer of the next request.
 */
export function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  return request<SignInResult>('/admin/session', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function fetchStats(token: string): Promise<AdminStats> {
  return request<AdminStats>('/admin/stats', { token });
}

export function fetchOrders(
  token: string,
  query: OrdersQuery
): Promise<OrdersPage> {
  const params = new URLSearchParams();

  // Empty values are omitted rather than sent blank: the API validates each
  // filter against a known set, and an empty `status=` is not in it.
  if (query.status) params.set('status', query.status);
  if (query.kind) params.set('kind', query.kind);
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  if (query.sort) params.set('sort', query.sort);
  if (query.direction) params.set('direction', query.direction);

  const suffix = params.toString();
  return request<OrdersPage>(
    `/admin/orders${suffix ? `?${suffix}` : ''}`,
    { token }
  );
}

export type DiscountKind = 'percent' | 'fixed';
export type DiscountScope = 'ticket' | 'sponsorship' | 'all';

export interface DiscountCodeView {
  code: string;
  kind: DiscountKind;
  /** Percentage points for 'percent', integer cents for 'fixed'. */
  value: number;
  label: string;
  appliesTo: DiscountScope;
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  oncePerCustomer: boolean;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  /** Orders that have paid with this code. */
  redeemed: number;
  /** True when nothing has redeemed it, so it can be deleted outright. */
  deletable: boolean;
  /** Why a buyer cannot use it right now, or null when it is usable. */
  unusableReason: string | null;
}

/** What the create and edit endpoints accept. Amounts are in CENTS. */
export interface DiscountCodeInput {
  code: string;
  kind: DiscountKind;
  value: number;
  label: string;
  appliesTo: DiscountScope;
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  oncePerCustomer: boolean;
  active?: boolean;
}

export function fetchDiscounts(token: string): Promise<{
  discounts: DiscountCodeView[];
}> {
  return request<{ discounts: DiscountCodeView[] }>('/admin/discounts', { token });
}

export function createDiscount(
  token: string,
  body: DiscountCodeInput
): Promise<{ discount: DiscountCodeView }> {
  return request<{ discount: DiscountCodeView }>('/admin/discounts', {
    token,
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function updateDiscount(
  token: string,
  code: string,
  body: DiscountCodeInput
): Promise<{ discount: DiscountCodeView }> {
  return request<{ discount: DiscountCodeView }>(
    `/admin/discounts/${encodeURIComponent(code)}`,
    { token, method: 'PATCH', body: JSON.stringify(body) }
  );
}

/**
 * Switch a code on or off.
 *
 * A body of nothing but `active` on purpose: the API treats that as the switch
 * rather than an edit, so turning a code off cannot accidentally rewrite the
 * rest of its definition with whatever the form happened to hold.
 */
export function setDiscountActive(
  token: string,
  code: string,
  active: boolean
): Promise<{ discount: DiscountCodeView }> {
  return request<{ discount: DiscountCodeView }>(
    `/admin/discounts/${encodeURIComponent(code)}`,
    { token, method: 'PATCH', body: JSON.stringify({ active }) }
  );
}

export async function deleteDiscount(token: string, code: string): Promise<void> {
  await request<unknown>(`/admin/discounts/${encodeURIComponent(code)}`, {
    token,
    method: 'DELETE'
  });
}
