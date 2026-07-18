import { PromptTemplate } from './types';

export type MembershipPlan = 'free' | 'pro';

export interface PromptTemplateCatalog {
  plan: MembershipPlan;
  templates: PromptTemplate[];
  lockedTemplates: PromptTemplate[];
}

export function resolveMembershipPlan(value: unknown): MembershipPlan {
  return value === 'pro' ? 'pro' : 'free';
}

export function isTemplateAvailable(template: PromptTemplate, plan: MembershipPlan): boolean {
  return template.access !== 'pro' || plan === 'pro';
}

export function getAvailableTemplates(
  templates: readonly PromptTemplate[],
  plan: MembershipPlan,
): PromptTemplate[] {
  return templates.filter((template) => isTemplateAvailable(template, plan));
}

export function getLockedTemplates(
  templates: readonly PromptTemplate[],
  plan: MembershipPlan,
): PromptTemplate[] {
  return templates.filter((template) => !isTemplateAvailable(template, plan));
}

export function buildTemplateCatalog(
  builtinTemplates: readonly PromptTemplate[],
  adminTemplates: readonly PromptTemplate[],
  userTemplates: readonly PromptTemplate[],
  plan: MembershipPlan,
): PromptTemplateCatalog {
  const lockedTemplates = getLockedTemplates(adminTemplates, plan).map((template) => ({
    ...template,
    prompt: '',
  }));

  return {
    plan,
    templates: [
      ...builtinTemplates,
      ...getAvailableTemplates(adminTemplates, plan),
      ...userTemplates,
    ],
    lockedTemplates,
  };
}
