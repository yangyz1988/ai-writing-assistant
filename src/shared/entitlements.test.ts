import { describe, expect, it } from 'vitest';
import {
  buildTemplateCatalog,
  getAvailableTemplates,
  getLockedTemplates,
  isTemplateAvailable,
  resolveMembershipPlan,
} from './entitlements';
import { ADMIN_PROMPT_TEMPLATES } from './templates';

describe('职场行政模板权益', () => {
  it('免费用户只能使用六个试用模板', () => {
    expect(getAvailableTemplates(ADMIN_PROMPT_TEMPLATES, 'free')).toHaveLength(6);
  });

  it('Pro 用户可以使用全部三十个行政模板', () => {
    expect(getAvailableTemplates(ADMIN_PROMPT_TEMPLATES, 'pro')).toHaveLength(30);
  });

  it('免费用户会看到高级模板被锁定', () => {
    expect(getLockedTemplates(ADMIN_PROMPT_TEMPLATES, 'free')).toHaveLength(24);
  });

  it('免费用户不能使用高级模板，Pro 用户可以使用', () => {
    const proTemplate = ADMIN_PROMPT_TEMPLATES.find((template) => template.access === 'pro');

    expect(proTemplate).toBeDefined();
    expect(isTemplateAvailable(proTemplate!, 'free')).toBe(false);
    expect(isTemplateAvailable(proTemplate!, 'pro')).toBe(true);
  });

  it('仅接受 Pro 状态，缺失或未知状态均按免费用户处理', () => {
    expect(resolveMembershipPlan('pro')).toBe('pro');
    expect(resolveMembershipPlan('free')).toBe('free');
    expect(resolveMembershipPlan(undefined)).toBe('free');
    expect(resolveMembershipPlan('invalid')).toBe('free');
  });

  it('为免费用户同时返回可用模板和锁定模板', () => {
    const builtin = [{ id: 'builtin', name: '基础', prompt: '基础提示', builtin: true }];
    const custom = [{ id: 'custom', name: '自定义', prompt: '自定义提示' }];
    const catalog = buildTemplateCatalog(builtin, ADMIN_PROMPT_TEMPLATES, custom, 'free');

    expect(catalog.plan).toBe('free');
    expect(catalog.templates).toHaveLength(8);
    expect(catalog.lockedTemplates).toHaveLength(24);
    expect(catalog.lockedTemplates.every((template) => template.prompt === '')).toBe(true);
  });

  it('Pro 目录不包含锁定模板', () => {
    const catalog = buildTemplateCatalog([], ADMIN_PROMPT_TEMPLATES, [], 'pro');

    expect(catalog.templates).toHaveLength(30);
    expect(catalog.lockedTemplates).toEqual([]);
  });

  it('扩展包不包含 Pro 模板的付费提示词正文', () => {
    const proTemplates = ADMIN_PROMPT_TEMPLATES.filter((template) => template.access === 'pro');

    expect(proTemplates).toHaveLength(24);
    expect(proTemplates.every((template) => template.prompt === '')).toBe(true);
  });
});
