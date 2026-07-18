import { ApiConfig } from './types';

export type ApiProvider = ApiConfig['provider'];

export interface ProviderDefault {
  model: string;
  endpoint: string;
}

export const PROVIDER_DEFAULTS: Record<ApiProvider, ProviderDefault> = {
  deepseek: {
    model: 'deepseek-v4-flash',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  },
  qwen: {
    model: 'qwen3.6-flash',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
  glm: {
    model: 'glm-4.7-flash',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  },
  openai: {
    model: 'gpt-5-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  anthropic: {
    model: 'claude-haiku-4-5-20251001',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
};

const LEGACY_MODELS = new Set([
  'deepseek-chat',
  'deepseek-reasoner',
  'qwen-turbo',
  'glm-4',
  'claude-3-opus-20240229',
  'gpt-4',
  'gpt-3.5-turbo',
]);

export function isLegacyModel(model: string): boolean {
  return LEGACY_MODELS.has(model.trim().toLowerCase());
}
