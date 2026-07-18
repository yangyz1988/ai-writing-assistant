import { ApiConfig, WritingMode, PromptTemplate } from './types';
import { PROVIDER_DEFAULTS } from './provider-config';

// System prompts for different languages
const SYSTEM_PROMPTS_ZH: Record<string, string> = {
  official: '你是公文写作专家。请用正式、专业的公文风格重写选中的文本，保持清晰和准确，使用适当的官方语言。',
  copywriting: '你是创意文案专家。请将选中的文本转化为吸引人的营销文案，注重情感共鸣和说服力。',
  technical: '你是技术文档专家。请将选中的文本重写为清晰、准确的技术文档，使用恰当的专业术语。',
  academic: '你是学术写作专家。请将选中的文本转化为学术风格，使用正式的学术语言，保持客观和严谨。',
  casual: '请将选中的文本改写为轻松、友好的风格，使其更加亲切和易于理解。',
  polish: '请优化和润色选中的文本，提高其清晰度、流畅度和表达效果，同时保持原有的意思和风格。',
};

const SYSTEM_PROMPTS_EN: Record<string, string> = {
  official: 'You are a professional document writing expert. Please rewrite the selected text in a formal, official document style, maintaining clarity and accuracy with appropriate formal language.',
  copywriting: 'You are a creative copywriting expert. Please transform the selected text into engaging marketing copy, focusing on emotional resonance and persuasive power.',
  technical: 'You are a technical documentation expert. Please rewrite the selected text into clear, accurate technical documentation using appropriate professional terminology.',
  academic: 'You are an academic writing expert. Please transform the selected text into academic style, using formal academic language while maintaining objectivity and rigor.',
  casual: 'Please rewrite the selected text in a casual, friendly style, making it more approachable and easy to understand.',
  polish: 'Please optimize and refine the selected text, improving its clarity, fluency, and expression while maintaining the original meaning and style.',
};

export function getSystemPrompt(modeId: string, language: 'zh' | 'en'): string {
  const prompts = language === 'zh' ? SYSTEM_PROMPTS_ZH : SYSTEM_PROMPTS_EN;
  return prompts[modeId] || SYSTEM_PROMPTS_ZH[modeId] || '';
}

export const WRITING_MODES: WritingMode[] = [
  {
    id: 'official',
    name: '公文',
    icon: '📋',
    description: '正式公文风格',
    systemPrompt: SYSTEM_PROMPTS_ZH.official,
  },
  {
    id: 'copywriting',
    name: '文案',
    icon: '✍️',
    description: '营销文案风格',
    systemPrompt: SYSTEM_PROMPTS_ZH.copywriting,
  },
  {
    id: 'technical',
    name: '技术文档',
    icon: '📘',
    description: '技术文档风格',
    systemPrompt: SYSTEM_PROMPTS_ZH.technical,
  },
  {
    id: 'academic',
    name: '学术',
    icon: '🎓',
    description: '学术论文风格',
    systemPrompt: SYSTEM_PROMPTS_ZH.academic,
  },
  {
    id: 'casual',
    name: '轻松',
    icon: '💬',
    description: '轻松友好风格',
    systemPrompt: SYSTEM_PROMPTS_ZH.casual,
  },
  {
    id: 'polish',
    name: '润色',
    icon: '✨',
    description: '优化润色',
    systemPrompt: SYSTEM_PROMPTS_ZH.polish,
  },
];

// 可选图标列表供用户选择
export const AVAILABLE_ICONS = [
  '📝', '✏️', '📖', '📚', '💡', '🎯', '🎨', '🎭', '🎪', '🎢',
  '🌟', '⭐', '💫', '🔥', '💪', '🚀', '✨', '💫', '🎭', '🎨',
  '📢', '📣', '💬', '💭', '🗨️', '📬', '📧', '📨', '📩',
  '💼', '📊', '📈', '📉', '💹', '💰', '💵', '💴', '💶', '💷',
  '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🔗', '⛓️', '🧰',
  '🎓', '🎒', '📜', '📝', '📓', '📒', '📕', '📗', '📘', '📙',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
];

export const DEFAULT_API_CONFIG: ApiConfig = {
  provider: 'deepseek',
  model: PROVIDER_DEFAULTS.deepseek.model,
};

export const DEFAULT_MODE = 'official';

// 自定义提示词模式的默认 system prompt
export const CUSTOM_PROMPT_SYSTEM = '你是一个专业的文本处理助手。请根据用户的具体指令处理选中的文本，准确理解用户的需求并给出高质量的结果。';

// 快捷提示词模板（供用户快速选择）
export const QUICK_PROMPTS = [
  { id: 'translate-en', name: '翻译成英文', prompt: '请将以下文本翻译成英文，保持原文的风格和语气。' },
  { id: 'translate-zh', name: '翻译成中文', prompt: '请将以下文本翻译成简体中文，保持原文的风格和语气。' },
  { id: 'summarize', name: '总结要点', prompt: '请总结以下文本的核心要点，用简洁的语言概括主要内容。' },
  { id: 'expand', name: '扩写内容', prompt: '请扩写以下文本，增加更多细节和内容，保持原有的风格和主题。' },
  { id: 'simplify', name: '简化表达', prompt: '请简化以下文本的表达，使用更简洁的语言，保留核心信息。' },
  { id: 'formal', name: '正式化', prompt: '请将以下文本改写为更正式的表达，适合商务或官方场合使用。' },
  { id: 'casual', name: '口语化', prompt: '请将以下文本改写为更口语化、轻松的表达方式。' },
  { id: 'fix-grammar', name: '修正语法', prompt: '请检查并修正以下文本中的语法错误和表达问题。' },
];

// 由快捷提示词派生的默认提示词模板（供 Popup 管理与斜杠命令使用，只读）
export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = QUICK_PROMPTS.map((q) => ({
  id: q.id,
  name: q.name,
  prompt: q.prompt,
  icon: '⚡',
  builtin: true,
}));

export const API_ENDPOINTS = {
  openai: PROVIDER_DEFAULTS.openai.endpoint,
  anthropic: PROVIDER_DEFAULTS.anthropic.endpoint,
  deepseek: PROVIDER_DEFAULTS.deepseek.endpoint,
  qwen: PROVIDER_DEFAULTS.qwen.endpoint,
  glm: PROVIDER_DEFAULTS.glm.endpoint,
} as const;

// 国内模型推荐配置
export const DOMESTIC_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '性价比最高，1元/百万tokens',
    defaultModel: PROVIDER_DEFAULTS.deepseek.model,
    baseUrl: PROVIDER_DEFAULTS.deepseek.endpoint,
  },
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云，中文能力强',
    defaultModel: PROVIDER_DEFAULTS.qwen.model,
    baseUrl: PROVIDER_DEFAULTS.qwen.endpoint,
  },
  {
    id: 'glm',
    name: '智谱GLM',
    description: '智谱AI，免费额度',
    defaultModel: PROVIDER_DEFAULTS.glm.model,
    baseUrl: PROVIDER_DEFAULTS.glm.endpoint,
  },
];

// 生成唯一ID
export function generateModeId(): string {
  return 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// Token 价格配置 (美元/千tokens)
export const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  // DeepSeek: 1元/百万tokens ≈ $0.00014/1K tokens (汇率约7)
  deepseek: { input: 0.00014, output: 0.00028 },
  // 通义千问: 约 0.008元/千tokens
  'qwen-turbo': { input: 0.0011, output: 0.0028 },
  'qwen-plus': { input: 0.0028, output: 0.0084 },
  'qwen-max': { input: 0.014, output: 0.028 },
  // 智谱GLM
  'glm-4': { input: 0.014, output: 0.014 },
  'glm-3-turbo': { input: 0.0014, output: 0.0014 },
  // OpenAI
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // Anthropic
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
};

// 获取价格
export function getTokenPrice(provider: string, model: string): { input: number; output: number } {
  // 先尝试精确匹配 model
  if (TOKEN_PRICES[model]) {
    return TOKEN_PRICES[model];
  }
  // 再尝试匹配 provider
  if (TOKEN_PRICES[provider]) {
    return TOKEN_PRICES[provider];
  }
  // 默认返回一个通用价格
  return { input: 0.001, output: 0.002 };
}
