import { AuthSession } from './membership-client';

export const ACCOUNT_SESSION_KEY = 'membershipSession';

export interface StoredAccountSession extends AuthSession {
  email: string;
}

export function createStoredAccountSession(email: string, session: AuthSession): StoredAccountSession {
  return {
    email: email.trim().toLowerCase(),
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
  };
}

export function parseStoredAccountSession(value: unknown, now = Date.now()): StoredAccountSession | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.email !== 'string'
    || typeof data.accessToken !== 'string'
    || data.accessToken.length < 16
    || typeof data.expiresAt !== 'string'
  ) return null;

  const expiresAt = Date.parse(data.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return {
    email: data.email,
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
  };
}
