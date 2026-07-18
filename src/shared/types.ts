export interface ApiConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'glm';
  model: string;
  baseUrl?: string;
}

export interface WritingMode {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  isCustom?: boolean; // 标记是否为自定义模式
}

export interface CustomWritingMode extends WritingMode {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface WritingRequest {
  text: string;
  mode: WritingMode['id'];
  instruction?: string;
}

export interface WritingResponse {
  success: boolean;
  result?: string;
  error?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenRecord {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  mode: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // 估算费用（美元）
}

export interface TokenStats {
  totalTokens: number;
  totalCost: number;
  todayTokens: number;
  todayCost: number;
  monthTokens: number;
  monthCost: number;
  records: TokenRecord[];
}

export interface SelectionContext {
  text: string;
  selection: {
    start: number;
    end: number;
  };
  element: {
    tagName: string;
    isEditable: boolean;
  };
}

// 历史记录
export interface HistoryRecord {
  id: string;
  originalText: string;
  resultText: string;
  modeId: string;
  modeName: string;
  modeIcon: string;
  timestamp: number;
  tokenUsage?: TokenUsage;
  customPrompt?: string; // 自定义提示词内容（自定义模式时存在）
  isCustom?: boolean;    // 是否通过自定义提示词处理
}

// 提示词模板（Popup 管理，支持斜杠命令）
export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  icon?: string;
  access?: 'free' | 'pro';
  builtin?: boolean;  // 内置默认模板（只读）
  createdAt?: number;
  updatedAt?: number;
}

// 主题类型
export type Theme = 'light' | 'dark' | 'system';

export type MessageType = 
| 'GET_SELECTION'
| 'PROCESS_TEXT'
| 'PROCESS_TEXT_WITH_PROMPT'
| 'CONFIG_UPDATED'
| 'SHOW_RESULT'
| 'TRIGGER_MENU'
| 'GET_CUSTOM_MODES'
| 'SAVE_CUSTOM_MODES'
| 'SAVE_HISTORY'
| 'GET_HISTORY'
| 'DELETE_HISTORY'
| 'CLEAR_HISTORY'
| 'GET_TOKEN_STATS'
| 'RESET_TOKEN_STATS'
| 'PROCESS_BATCH_TEXT'
| 'GET_PROMPT_TEMPLATES'
| 'SAVE_PROMPT_TEMPLATES'
| 'DELETE_PROMPT_TEMPLATE';

// 自定义提示词请求
export interface CustomPromptRequest {
  text: string;
  customPrompt: string;
  mode?: string; // 可选的基础模式
}

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// 批量处理相关类型
export interface BatchSegment {
  id: string;
  text: string;
  index: number;
}

export interface BatchProcessResult {
  segmentId: string;
  originalText: string;
  resultText: string;
  success: boolean;
  error?: string;
}

export interface BatchProcessProgress {
  total: number;
  processed: number;
  currentSegmentId: string;
  results: BatchProcessResult[];
  isCancelled: boolean;
}

export interface BatchProcessRequest {
  segments: BatchSegment[];
  mode: string;
}

export interface BatchProcessResponse {
  success: boolean;
  results?: BatchProcessResult[];
  error?: string;
}
