import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ADMIN_PROMPT_TEMPLATES } from '../shared/templates';
import { PromptTemplateCatalog } from './PromptTemplateCatalog';

describe('PromptTemplateCatalog', () => {
  it('向免费用户展示计划、价格和锁定模板数量', () => {
    const html = renderToStaticMarkup(
      <PromptTemplateCatalog
        plan="free"
        templates={ADMIN_PROMPT_TEMPLATES.slice(0, 6)}
        lockedTemplates={ADMIN_PROMPT_TEMPLATES.slice(6).map((template) => ({ ...template, prompt: '' }))}
        language="zh"
      />,
    );

    expect(html).toContain('FREE');
    expect(html).toContain('24 个 Pro 模板');
    expect(html).toContain('¥19/月');
    expect(html).toContain('支付通道接入中');
  });

  it('Pro 用户不显示升级卡片', () => {
    const html = renderToStaticMarkup(
      <PromptTemplateCatalog plan="pro" templates={ADMIN_PROMPT_TEMPLATES} lockedTemplates={[]} language="zh" />,
    );

    expect(html).toContain('PRO');
    expect(html).not.toContain('支付通道接入中');
  });
});
