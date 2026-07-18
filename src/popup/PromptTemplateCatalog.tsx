import React from 'react';
import { MembershipPlan } from '../shared/entitlements';
import { PromptTemplate } from '../shared/types';
import { Language } from '../shared/i18n/types';

interface PromptTemplateCatalogProps {
  plan: MembershipPlan;
  templates: readonly PromptTemplate[];
  lockedTemplates: readonly PromptTemplate[];
  language?: Language;
}

const COPY = {
  zh: {
    free: 'FREE',
    pro: 'PRO',
    available: '个模板可用',
    title: '职场行政 Pro',
    locked: '个 Pro 模板待解锁',
    description: '解锁完整职场模板库、批量处理和免配置 AI 额度。',
    price: '¥19/月',
    annual: '年付 ¥159',
    pending: '支付通道接入中',
    lockedBadge: 'PRO',
  },
  en: {
    free: 'FREE',
    pro: 'PRO',
    available: 'templates available',
    title: 'Workplace Admin Pro',
    locked: 'Pro templates locked',
    description: 'Unlock the full template library, batch processing, and included AI usage.',
    price: '¥19/month',
    annual: '¥159/year',
    pending: 'Payments coming soon',
    lockedBadge: 'PRO',
  },
} as const;

export const PromptTemplateCatalog: React.FC<PromptTemplateCatalogProps> = ({
  plan,
  templates,
  lockedTemplates,
  language = 'zh',
}) => {
  const copy = COPY[language];
  const isPro = plan === 'pro';

  return (
    <div className="plan-catalog" aria-label={copy.title}>
      <div className="plan-status-row">
        <span className={`plan-badge ${isPro ? 'pro' : 'free'}`}>{isPro ? copy.pro : copy.free}</span>
        <span className="plan-template-count">{templates.length} {copy.available}</span>
      </div>

      {!isPro && lockedTemplates.length > 0 ? (
        <div className="pro-upgrade-card">
          <div className="pro-upgrade-heading">
            <div>
              <strong>{copy.title}</strong>
              <span>{lockedTemplates.length} {copy.locked}</span>
            </div>
            <div className="pro-price">
              <strong>{copy.price}</strong>
              <span>{copy.annual}</span>
            </div>
          </div>
          <p>{copy.description}</p>
          <div className="locked-template-grid">
            {lockedTemplates.map((template) => (
              <div key={template.id} className="locked-template-item">
                <span>{template.icon || '📋'} {template.name}</span>
                <span className="pro-badge">{copy.lockedBadge}</span>
              </div>
            ))}
          </div>
          <button type="button" className="upgrade-button" disabled>{copy.pending}</button>
        </div>
      ) : null}
    </div>
  );
};
