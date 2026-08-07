import React, { useEffect, useState } from 'react';
import { ACCOUNT_SESSION_KEY, createStoredAccountSession, parseStoredAccountSession, StoredAccountSession } from '../shared/account-session';
import { MembershipApiError, MembershipClient, MembershipStatus } from '../shared/membership-client';
import { Language } from '../shared/i18n/types';

interface AccountPanelProps {
  client: MembershipClient | null;
  language: Language;
  onPlanChange?: (plan: MembershipStatus['plan']) => void;
}

const copy = {
  zh: {
    title: '账户与会员', unavailable: '会员服务尚未配置。BYOK 基础功能仍可正常使用。', email: '邮箱',
    emailPlaceholder: 'name@example.com', code: '验证码', codePlaceholder: '6 位验证码', send: '发送验证码',
    resend: '重新发送', verify: '登录', sending: '发送中…', verifying: '登录中…', sent: '验证码已发送，请检查邮箱。',
    free: '免费版', pro: 'Pro 会员', status: '订阅状态', expires: '当前会话到期', logout: '退出登录', retry: '重新同步',
    error: '操作失败，请稍后重试。', invalid: '请填写有效的邮箱和 6 位验证码。', signedInAs: '当前账户',
  },
  en: {
    title: 'Account & Membership', unavailable: 'Membership service is not configured. BYOK features remain available.', email: 'Email',
    emailPlaceholder: 'name@example.com', code: 'Code', codePlaceholder: '6-digit code', send: 'Send code',
    resend: 'Resend', verify: 'Sign in', sending: 'Sending…', verifying: 'Signing in…', sent: 'Code sent. Check your inbox.',
    free: 'Free', pro: 'Pro', status: 'Subscription', expires: 'Session expires', logout: 'Sign out', retry: 'Sync again',
    error: 'Something went wrong. Please try again.', invalid: 'Enter a valid email and 6-digit code.', signedInAs: 'Signed in as',
  },
};

export const AccountPanel: React.FC<AccountPanelProps> = ({ client, language, onPlanChange }) => {
  const t = copy[language];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [session, setSession] = useState<StoredAccountSession | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'verifying' | 'syncing'>('idle');
  const [notice, setNotice] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const syncMembership = async (currentSession: StoredAccountSession) => {
    if (!client) return;
    setPhase('syncing');
    setNotice('');
    try {
      const status = await client.getMembership(currentSession.accessToken);
      setMembership(status);
      onPlanChange?.(status.plan);
    } catch (error) {
      if (error instanceof MembershipApiError && error.status === 401) {
        await chrome.storage.session.remove(ACCOUNT_SESSION_KEY);
        setSession(null);
        setMembership(null);
        onPlanChange?.('free');
      } else {
        setNotice(t.error);
      }
    } finally {
      setPhase('idle');
    }
  };

  useEffect(() => {
    if (!client) return;
    chrome.storage.session.get(ACCOUNT_SESSION_KEY).then(async (result) => {
      const stored = parseStoredAccountSession(result[ACCOUNT_SESSION_KEY]);
      if (!stored) {
        await chrome.storage.session.remove(ACCOUNT_SESSION_KEY);
        return;
      }
      setSession(stored);
      setEmail(stored.email);
      await syncMembership(stored);
    }).catch(() => setNotice(t.error));
  // The API client is stable for the lifetime of the popup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const requestCode = async () => {
    if (!client) return;
    setPhase('sending');
    setNotice('');
    try {
      await client.requestEmailCode(email);
      setCodeSent(true);
      setNotice(t.sent);
    } catch {
      setNotice(t.error);
    } finally {
      setPhase('idle');
    }
  };

  const verifyCode = async () => {
    if (!client || !/^\d{6}$/.test(code.trim())) {
      setNotice(t.invalid);
      return;
    }
    setPhase('verifying');
    setNotice('');
    try {
      const auth = await client.verifyEmailCode(email, code);
      const stored = createStoredAccountSession(email, auth);
      await chrome.storage.session.set({ [ACCOUNT_SESSION_KEY]: stored });
      setSession(stored);
      setCode('');
      await syncMembership(stored);
    } catch {
      setNotice(t.error);
      setPhase('idle');
    }
  };

  const logout = async () => {
    await chrome.storage.session.remove(ACCOUNT_SESSION_KEY);
    setSession(null);
    setMembership(null);
    setCodeSent(false);
    setNotice('');
    onPlanChange?.('free');
  };

  if (!client) return <section className="account-section"><h2>{t.title}</h2><div className="account-unavailable">{t.unavailable}</div></section>;

  return (
    <section className="account-section">
      <h2>{t.title}</h2>
      {session ? (
        <div className="account-card">
          <div className="account-row"><span>{t.signedInAs}</span><strong>{session.email}</strong></div>
          <div className="account-row"><span>{t.status}</span><span className={`plan-badge ${membership?.plan || 'free'}`}>{membership?.plan === 'pro' ? t.pro : t.free}</span></div>
          <div className="account-row"><span>{t.expires}</span><strong>{new Date(session.expiresAt).toLocaleString()}</strong></div>
          <div className="account-actions">
            <button className="secondary-button" disabled={phase !== 'idle'} onClick={() => syncMembership(session)}>{t.retry}</button>
            <button className="danger-button" onClick={logout}>{t.logout}</button>
          </div>
        </div>
      ) : (
        <div className="account-form">
          <div className="form-group"><label htmlFor="account-email">{t.email}</label><input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.emailPlaceholder} /></div>
          {codeSent && <div className="form-group"><label htmlFor="account-code">{t.code}</label><input id="account-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder={t.codePlaceholder} /></div>}
          <div className="account-actions">
            <button className="secondary-button" disabled={phase !== 'idle' || !email.trim()} onClick={requestCode}>{phase === 'sending' ? t.sending : (codeSent ? t.resend : t.send)}</button>
            {codeSent && <button className="primary-button" disabled={phase !== 'idle' || code.length !== 6} onClick={verifyCode}>{phase === 'verifying' ? t.verifying : t.verify}</button>}
          </div>
        </div>
      )}
      {notice && <p className="account-notice" role="status">{notice}</p>}
    </section>
  );
};
