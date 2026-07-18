import { describe, expect, it, vi } from 'vitest';
import { MembershipApiError, MembershipClient } from './membership-client';

const ACCESS_TOKEN = 'short-lived-access-token';

describe('MembershipClient', () => {
  it('拒绝非 HTTPS 的生产 API 地址', () => {
    expect(() => new MembershipClient({ baseUrl: 'http://example.com' })).toThrow('HTTPS');
  });

  it('允许本机 HTTP 地址用于开发', () => {
    expect(() => new MembershipClient({ baseUrl: 'http://127.0.0.1:8787' })).not.toThrow();
  });

  it('缺少访问令牌时不发起会员请求', async () => {
    const fetchImpl = vi.fn();
    const client = new MembershipClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(client.getMembership('')).rejects.toMatchObject({ code: 'authentication_required' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('使用 Bearer 令牌获取并解析会员状态', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        plan: 'pro',
        subscription_status: 'active',
        trial_ends_at: null,
        current_period_end: '2026-08-16T00:00:00.000Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = new MembershipClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    await expect(client.getMembership(ACCESS_TOKEN)).resolves.toEqual({
      plan: 'pro',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: '2026-08-16T00:00:00.000Z',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/membership',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
      }),
    );
  });

  it('拒绝格式异常的会员响应', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { plan: 'enterprise' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = new MembershipClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(client.getMembership(ACCESS_TOKEN)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('创建年付 Pro 收银台并校验 HTTPS 地址', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        checkout_url: 'https://pay.example.com/session/checkout-123',
        expires_at: '2026-07-16T13:00:00.000Z',
      },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const client = new MembershipClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(client.createCheckoutSession(ACCESS_TOKEN, {
      plan: 'pro',
      billingCycle: 'annual',
      returnUrl: 'chrome-extension://extension-id/popup.html',
    })).resolves.toEqual({
      checkoutUrl: 'https://pay.example.com/session/checkout-123',
      expiresAt: '2026-07-16T13:00:00.000Z',
    });
  });

  it('不会接受服务端返回的非 HTTPS 收银台地址', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { checkout_url: 'javascript:alert(1)', expires_at: '2026-07-16T13:00:00.000Z' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const client = new MembershipClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(client.createCheckoutSession(ACCESS_TOKEN, {
      plan: 'pro',
      billingCycle: 'monthly',
      returnUrl: 'chrome-extension://extension-id/popup.html',
    })).rejects.toBeInstanceOf(MembershipApiError);
  });

  it('将服务端错误转换为稳定的客户端错误码', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests' },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }));
    const client = new MembershipClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(client.getMembership(ACCESS_TOKEN)).rejects.toMatchObject({
      code: 'rate_limit_exceeded',
      status: 429,
    });
  });
});
