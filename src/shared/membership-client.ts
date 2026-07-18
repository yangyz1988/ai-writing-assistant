export type MembershipPlan = 'free' | 'pro';
export type SubscriptionStatus = 'anonymous' | 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingCycle = 'monthly' | 'annual';

export interface MembershipStatus {
  plan: MembershipPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export interface CheckoutSession {
  checkoutUrl: string;
  expiresAt: string;
}

export interface CreateCheckoutSessionInput {
  plan: 'pro';
  billingCycle: BillingCycle;
  returnUrl: string;
}

interface MembershipClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ApiErrorBody {
  error?: {
    code?: unknown;
  };
}

const MEMBERSHIP_PLANS = new Set<MembershipPlan>(['free', 'pro']);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  'anonymous',
  'trialing',
  'active',
  'past_due',
  'canceled',
]);
const BILLING_CYCLES = new Set<BillingCycle>(['monthly', 'annual']);
const DEFAULT_TIMEOUT_MS = 10_000;

export class MembershipApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'MembershipApiError';
    this.code = code;
    this.status = status;
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MembershipApiError('invalid_configuration', 'Membership API URL is invalid');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new MembershipApiError('invalid_configuration', 'Membership API must use HTTPS');
  }
  if (url.username || url.password) {
    throw new MembershipApiError('invalid_configuration', 'Membership API URL cannot contain credentials');
  }

  return url.toString().replace(/\/$/, '');
}

function requireAccessToken(value: string): string {
  const token = value.trim();
  if (!token) {
    throw new MembershipApiError('authentication_required', 'Sign in is required', 401);
  }
  return token;
}

function isIsoDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function parseMembershipStatus(value: unknown): MembershipStatus {
  if (!value || typeof value !== 'object') {
    throw new MembershipApiError('invalid_response', 'Membership response is invalid');
  }

  const data = value as Record<string, unknown>;
  if (
    !MEMBERSHIP_PLANS.has(data.plan as MembershipPlan)
    || !SUBSCRIPTION_STATUSES.has(data.subscription_status as SubscriptionStatus)
    || !isIsoDateOrNull(data.trial_ends_at)
    || !isIsoDateOrNull(data.current_period_end)
  ) {
    throw new MembershipApiError('invalid_response', 'Membership response is invalid');
  }

  return {
    plan: data.plan as MembershipPlan,
    status: data.subscription_status as SubscriptionStatus,
    trialEndsAt: data.trial_ends_at,
    currentPeriodEnd: data.current_period_end,
  };
}

function parseCheckoutSession(value: unknown): CheckoutSession {
  if (!value || typeof value !== 'object') {
    throw new MembershipApiError('invalid_response', 'Checkout response is invalid');
  }

  const data = value as Record<string, unknown>;
  if (typeof data.checkout_url !== 'string' || !isIsoDateOrNull(data.expires_at) || data.expires_at === null) {
    throw new MembershipApiError('invalid_response', 'Checkout response is invalid');
  }

  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(data.checkout_url);
  } catch {
    throw new MembershipApiError('invalid_response', 'Checkout URL is invalid');
  }
  if (checkoutUrl.protocol !== 'https:') {
    throw new MembershipApiError('invalid_response', 'Checkout URL must use HTTPS');
  }

  return { checkoutUrl: checkoutUrl.toString(), expiresAt: data.expires_at };
}

function validateCheckoutInput(input: CreateCheckoutSessionInput): void {
  if (input.plan !== 'pro' || !BILLING_CYCLES.has(input.billingCycle)) {
    throw new MembershipApiError('validation_error', 'Checkout selection is invalid', 422);
  }

  let returnUrl: URL;
  try {
    returnUrl = new URL(input.returnUrl);
  } catch {
    throw new MembershipApiError('validation_error', 'Return URL is invalid', 422);
  }
  if (!['https:', 'chrome-extension:'].includes(returnUrl.protocol)) {
    throw new MembershipApiError('validation_error', 'Return URL is not allowed', 422);
  }
}

export class MembershipClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: MembershipClientOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async getMembership(accessToken: string): Promise<MembershipStatus> {
    const body = await this.request('/api/v1/membership', requireAccessToken(accessToken), { method: 'GET' });
    return parseMembershipStatus(body.data);
  }

  async createCheckoutSession(
    accessToken: string,
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession> {
    const token = requireAccessToken(accessToken);
    validateCheckoutInput(input);
    const body = await this.request('/api/v1/checkout-sessions', token, {
      method: 'POST',
      body: JSON.stringify({
        plan: input.plan,
        billing_cycle: input.billingCycle,
        return_url: input.returnUrl,
      }),
    });
    return parseCheckoutSession(body.data);
  }

  private async request(
    path: string,
    accessToken: string,
    init: Pick<RequestInit, 'method' | 'body'>,
  ): Promise<{ data: unknown }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      const body = await this.readJson(response);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody;
        const code = typeof errorBody.error?.code === 'string' ? errorBody.error.code : 'request_failed';
        throw new MembershipApiError(code, 'Membership request failed', response.status);
      }
      if (!body || typeof body !== 'object' || !('data' in body)) {
        throw new MembershipApiError('invalid_response', 'Membership response is invalid');
      }
      return body as { data: unknown };
    } catch (error) {
      if (error instanceof MembershipApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MembershipApiError('request_timeout', 'Membership request timed out');
      }
      throw new MembershipApiError('network_error', 'Membership service is unavailable');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new MembershipApiError('invalid_response', 'Membership response is not valid JSON', response.status);
    }
  }
}
