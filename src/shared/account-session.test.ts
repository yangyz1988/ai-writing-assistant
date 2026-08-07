import { describe, expect, it } from 'vitest';
import { createStoredAccountSession, parseStoredAccountSession } from './account-session';

describe('account session', () => {
  it('创建会话时规范化邮箱', () => {
    expect(createStoredAccountSession(' User@Example.COM ', {
      accessToken: 'short-lived-access-token',
      expiresAt: '2026-08-02T15:00:00.000Z',
    })).toEqual({
      email: 'user@example.com',
      accessToken: 'short-lived-access-token',
      expiresAt: '2026-08-02T15:00:00.000Z',
    });
  });

  it('拒绝已过期会话', () => {
    expect(parseStoredAccountSession({
      email: 'user@example.com',
      accessToken: 'short-lived-access-token',
      expiresAt: '2026-08-02T13:00:00.000Z',
    }, Date.parse('2026-08-02T14:00:00.000Z'))).toBeNull();
  });

  it('接受仍有效的短期会话', () => {
    expect(parseStoredAccountSession({
      email: 'user@example.com',
      accessToken: 'short-lived-access-token',
      expiresAt: '2026-08-02T15:00:00.000Z',
    }, Date.parse('2026-08-02T14:00:00.000Z'))).not.toBeNull();
  });
});
