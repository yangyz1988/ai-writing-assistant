import { ApiConfig, WritingMode, ExtensionMessage, WritingResponse, TokenUsage, TokenRecord, TokenStats, CustomWritingMode, CustomPromptRequest, HistoryRecord, PromptTemplate } from '../shared/types';
import { WRITING_MODES, API_ENDPOINTS, getTokenPrice, getSystemPrompt, CUSTOM_PROMPT_SYSTEM, DEFAULT_PROMPT_TEMPLATES } from '../shared/constants';
import { buildTemplateCatalog, MembershipPlan, PromptTemplateCatalog } from '../shared/entitlements';
import { getLanguage } from '../shared/i18n';
import { ADMIN_PROMPT_TEMPLATES } from '../shared/templates';

class BackgroundService {
  private apiConfig: ApiConfig | null = null;
  private apiKey: string | null = null;
  private selectedMode: string | null = null;
  private customModes: CustomWritingMode[] = [];
  private language: 'zh' | 'en' = 'zh';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadConfig();
    this.setupContextMenu();
    this.setupCommands();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // 监听存储变化，更新自定义模式
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.customModes) {
        this.customModes = changes.customModes.newValue || [];
        this.setupContextMenu(); // 重新构建右键菜单
      }
    });
  }

  private setupCommands(): void {
    // 监听快捷键命令
    chrome.commands.onCommand.addListener(async (command) => {
      if (command === 'trigger-menu') {
        // 获取当前活动标签页并发送消息到 content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_MENU' });
        }
      }
    });
  }

  private async loadConfig(): Promise<void> {
    const syncResult = await chrome.storage.sync.get(['apiConfig', 'selectedMode', 'customModes', 'language']);
    this.apiConfig = syncResult.apiConfig || null;
    this.selectedMode = syncResult.selectedMode || null;
    this.customModes = syncResult.customModes || [];
    this.language = syncResult.language || getLanguage();
    // API Key 存储在 local（不同步到其他设备）
    const localResult = await chrome.storage.local.get(['apiKey']);
    this.apiKey = localResult.apiKey || null;
  }

  // 获取所有写作模式（内置 + 自定义）
  private getAllModes(): WritingMode[] {
    const customModesAsWriting: WritingMode[] = this.customModes.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      description: m.description,
      systemPrompt: m.systemPrompt,
      isCustom: true,
    }));
    return [...WRITING_MODES, ...customModesAsWriting];
  }

  private setupContextMenu(): void {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'ai-writing-root',
        title: 'AI Writing Assistant',
        contexts: ['selection'],
      });

      // 添加内置模式
      WRITING_MODES.forEach((mode) => {
        chrome.contextMenus.create({
          id: 'mode-' + mode.id,
          parentId: 'ai-writing-root',
          title: mode.icon + ' ' + mode.name,
          contexts: ['selection'],
        });
      });

      // 添加分隔符和自定义模式
      if (this.customModes.length > 0) {
        chrome.contextMenus.create({
          id: 'separator',
          parentId: 'ai-writing-root',
          type: 'separator',
          contexts: ['selection'],
        });

        this.customModes.forEach((mode) => {
          chrome.contextMenus.create({
            id: 'mode-' + mode.id,
            parentId: 'ai-writing-root',
            title: mode.icon + ' ' + mode.name,
            contexts: ['selection'],
          });
        });
      }
    });

    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId.toString().startsWith('mode-')) {
        const modeId = info.menuItemId.toString().replace('mode-', '');
        await this.processSelection(info.selectionText || '', modeId, tab?.id);
      }
    });
  }

  private async handleMessage(
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: WritingResponse | { success: boolean; result?: string; modes?: CustomWritingMode[]; history?: HistoryRecord[]; templates?: PromptTemplate[]; lockedTemplates?: PromptTemplate[]; plan?: MembershipPlan; error?: string }) => void
  ): Promise<boolean> {
    switch (message.type) {
      case 'PROCESS_TEXT': {
        const payload = message.payload as { text: string; mode: string };
        const response = await this.processText(payload.text, payload.mode);
        sendResponse(response);
        return true;
      }

      case 'PROCESS_TEXT_WITH_PROMPT': {
        const payload = message.payload as CustomPromptRequest;
        const response = await this.processTextWithPrompt(payload.text, payload.customPrompt);
        sendResponse(response);
        return true;
      }

      case 'PROCESS_BATCH_TEXT': {
        const payload = message.payload as { segments: Array<{ id: string; text: string; index: number }>; mode: string };
        const response = await this.processBatchText(payload.segments, payload.mode);
        sendResponse(response);
        return true;
      }

      case 'CONFIG_UPDATED': {
        await this.loadConfig();
        sendResponse({ success: true });
        return true;
      }

      case 'GET_CUSTOM_MODES': {
        sendResponse({ success: true, modes: this.customModes });
        return true;
      }

      case 'SAVE_CUSTOM_MODES': {
        const payload = message.payload as { modes: CustomWritingMode[] };
        this.customModes = payload.modes;
        await chrome.storage.sync.set({ customModes: payload.modes });
        this.setupContextMenu(); // 重新构建右键菜单
        sendResponse({ success: true });
        return true;
      }

      case 'GET_TOKEN_STATS': {
        const stats = await this.getTokenStats();
        sendResponse({ success: true, result: JSON.stringify(stats) } as WritingResponse);
        return true;
      }

      case 'RESET_TOKEN_STATS': {
        await this.resetTokenStats();
        sendResponse({ success: true });
        return true;
      }

      case 'SAVE_HISTORY': {
        const payload = message.payload as { record: HistoryRecord };
        await this.saveHistory(payload.record);
        sendResponse({ success: true });
        return true;
      }

      case 'GET_HISTORY': {
        const history = await this.getHistory();
        sendResponse({ success: true, history });
        return true;
      }

      case 'DELETE_HISTORY': {
        const payload = message.payload as { id: string };
        await this.deleteHistory(payload.id);
        sendResponse({ success: true });
        return true;
      }

      case 'CLEAR_HISTORY': {
        await this.clearHistory();
        sendResponse({ success: true });
        return true;
      }

      case 'GET_PROMPT_TEMPLATES': {
        const catalog = await this.getPromptTemplates();
        sendResponse({ success: true, ...catalog });
        return true;
      }

      case 'SAVE_PROMPT_TEMPLATES': {
        const payload = message.payload as { templates: PromptTemplate[] };
        await this.savePromptTemplates(payload.templates);
        sendResponse({ success: true });
        return true;
      }

      case 'DELETE_PROMPT_TEMPLATE': {
        const payload = message.payload as { id: string };
        await this.deletePromptTemplate(payload.id);
        sendResponse({ success: true });
        return true;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;
    }
  }

  private async processBatchText(
    segments: Array<{ id: string; text: string; index: number }>,
    modeId: string
  ): Promise<{ success: boolean; results?: Array<{ segmentId: string; originalText: string; resultText: string; success: boolean; error?: string }>; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const allModes = this.getAllModes();
    const mode = allModes.find((m) => m.id === modeId);
    if (!mode) {
      return { success: false, error: 'Invalid writing mode' };
    }

    const results: Array<{ segmentId: string; originalText: string; resultText: string; success: boolean; error?: string }> = [];

    for (const segment of segments) {
      try {
        const result = await this.callAI(segment.text, mode);
        results.push({
          segmentId: segment.id,
          originalText: segment.text,
          resultText: result,
          success: true,
        });
      } catch (error) {
        results.push({
          segmentId: segment.id,
          originalText: segment.text,
          resultText: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { success: true, results };
  }

  private async processText(text: string, modeId: string): Promise<WritingResponse> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const allModes = this.getAllModes();
    const mode = allModes.find((m) => m.id === modeId);
    if (!mode) {
      return { success: false, error: 'Invalid writing mode' };
    }

    try {
      const result = await this.callAI(text, mode);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async processTextWithPrompt(text: string, customPrompt: string): Promise<WritingResponse> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    // 构造一个临时的自定义模式，system prompt 固定为通用助手人设
    const tempMode: WritingMode = {
      id: 'custom-prompt',
      name: '自定义提示词',
      icon: '✨',
      description: '根据用户输入的提示词灵活处理文本',
      systemPrompt: CUSTOM_PROMPT_SYSTEM,
      isCustom: true,
    };

    try {
      const result = await this.callAI(text, tempMode, customPrompt);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============ 历史记录存储 ============
  private async saveHistory(record: HistoryRecord): Promise<void> {
    const result = await chrome.storage.local.get(['history']);
    const history: HistoryRecord[] = result.history || [];
    const newHistory = [record, ...history].slice(0, 100);
    await chrome.storage.local.set({ history: newHistory });
  }

  private async getHistory(): Promise<HistoryRecord[]> {
    const result = await chrome.storage.local.get(['history']);
    return result.history || [];
  }

  private async deleteHistory(id: string): Promise<void> {
    const result = await chrome.storage.local.get(['history']);
    const history: HistoryRecord[] = result.history || [];
    await chrome.storage.local.set({ history: history.filter((r) => r.id !== id) });
  }

  private async clearHistory(): Promise<void> {
    await chrome.storage.local.set({ history: [] });
  }

  // ============ 提示词模板存储 ============
  private async getPromptTemplates(): Promise<PromptTemplateCatalog> {
    const result = await chrome.storage.sync.get(['promptTemplates']);
    const userTemplates: PromptTemplate[] = result.promptTemplates || [];
    // Paid entitlement must come from the membership API. Until that service is
    // connected, never trust a browser-writable storage value to unlock Pro.
    const plan: MembershipPlan = 'free';

    return buildTemplateCatalog(DEFAULT_PROMPT_TEMPLATES, ADMIN_PROMPT_TEMPLATES, userTemplates, plan);
  }

  private async savePromptTemplates(templates: PromptTemplate[]): Promise<void> {
    await chrome.storage.sync.set({ promptTemplates: templates });
  }

  private async deletePromptTemplate(id: string): Promise<void> {
    const result = await chrome.storage.sync.get(['promptTemplates']);
    const userTemplates: PromptTemplate[] = result.promptTemplates || [];
    await chrome.storage.sync.set({ promptTemplates: userTemplates.filter((t) => t.id !== id) });
  }

  private async callAI(text: string, mode: WritingMode, userInstruction?: string): Promise<string> {
    if (!this.apiConfig || !this.apiKey) {
      throw new Error('API not configured');
    }

    // DeepSeek, Qwen, GLM 都兼容 OpenAI 格式
    if (this.apiConfig.provider === 'openai' || 
        this.apiConfig.provider === 'deepseek' ||
        this.apiConfig.provider === 'qwen' ||
        this.apiConfig.provider === 'glm') {
      return this.callOpenAICompatible(text, mode, userInstruction);
    } else if (this.apiConfig.provider === 'anthropic') {
      return this.callAnthropic(text, mode, userInstruction);
    } else {
      throw new Error('Unsupported provider: ' + this.apiConfig.provider);
    }
  }

  private extractOpenAIUsage(data: Record<string, unknown>): TokenUsage | null {
    const usage = data.usage as Record<string, number> | undefined;
    // DeepSeek 和 OpenAI 格式
    if (usage?.total_tokens) {
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens,
      };
    }
    // 通义千问格式
    if (usage?.input_tokens !== undefined) {
      return {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      };
    }
    return null;
  }

  private calculateCost(usage: TokenUsage, provider: string, model: string): number {
    const price = getTokenPrice(provider, model);
    return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1000;
  }

  private async saveTokenRecord(usage: TokenUsage, mode: string): Promise<void> {
    if (!this.apiConfig) return;

    const cost = this.calculateCost(usage, this.apiConfig.provider, this.apiConfig.model);
    
    const record: TokenRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      provider: this.apiConfig.provider,
      model: this.apiConfig.model,
      mode: mode,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCost: cost,
    };

    // 从 storage.local 获取现有统计数据
    const result = await chrome.storage.local.get(['tokenStats']);
    const existingStats: TokenStats = result.tokenStats || {
      totalTokens: 0,
      totalCost: 0,
      todayTokens: 0,
      todayCost: 0,
      monthTokens: 0,
      monthCost: 0,
      records: [],
    };

    // 更新统计数据
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // 过滤今天的记录
    const todayRecords = existingStats.records.filter(r => r.timestamp >= today);
    const monthRecords = existingStats.records.filter(r => r.timestamp >= monthStart);

    // 添加新记录
    const newRecords = [record, ...existingStats.records].slice(0, 1000); // 保留最近1000条记录

    // 重新计算统计
    const stats: TokenStats = {
      totalTokens: existingStats.totalTokens + usage.totalTokens,
      totalCost: existingStats.totalCost + cost,
      todayTokens: todayRecords.reduce((sum, r) => sum + r.totalTokens, 0) + usage.totalTokens,
      todayCost: todayRecords.reduce((sum, r) => sum + r.estimatedCost, 0) + cost,
      monthTokens: monthRecords.reduce((sum, r) => sum + r.totalTokens, 0) + usage.totalTokens,
      monthCost: monthRecords.reduce((sum, r) => sum + r.estimatedCost, 0) + cost,
      records: newRecords,
    };

    await chrome.storage.local.set({ tokenStats: stats });
  }

  async getTokenStats(): Promise<TokenStats> {
    const result = await chrome.storage.local.get(['tokenStats']);
    
    if (!result.tokenStats) {
      return {
        totalTokens: 0,
        totalCost: 0,
        todayTokens: 0,
        todayCost: 0,
        monthTokens: 0,
        monthCost: 0,
        records: [],
      };
    }

    // 重新计算今日和本月统计
    const stats: TokenStats = result.tokenStats;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayRecords = stats.records.filter(r => r.timestamp >= today);
    const monthRecords = stats.records.filter(r => r.timestamp >= monthStart);

    return {
      ...stats,
      todayTokens: todayRecords.reduce((sum, r) => sum + r.totalTokens, 0),
      todayCost: todayRecords.reduce((sum, r) => sum + r.estimatedCost, 0),
      monthTokens: monthRecords.reduce((sum, r) => sum + r.totalTokens, 0),
      monthCost: monthRecords.reduce((sum, r) => sum + r.estimatedCost, 0),
    };
  }

  async resetTokenStats(): Promise<void> {
    await chrome.storage.local.set({
      tokenStats: {
        totalTokens: 0,
        totalCost: 0,
        todayTokens: 0,
        todayCost: 0,
        monthTokens: 0,
        monthCost: 0,
        records: [],
      },
    });
  }

  private async callOpenAICompatible(text: string, mode: WritingMode, userInstruction?: string): Promise<string> {
    // 根据 provider 设置不同的 base URL
    let baseUrl: string;
    let model: string;
    
    if (this.apiConfig?.provider === 'deepseek') {
      baseUrl = API_ENDPOINTS.deepseek;
      model = this.apiConfig?.model || 'deepseek-chat';
    } else if (this.apiConfig?.provider === 'qwen') {
      baseUrl = API_ENDPOINTS.qwen;
      model = this.apiConfig?.model || 'qwen-turbo';
    } else if (this.apiConfig?.provider === 'glm') {
      baseUrl = API_ENDPOINTS.glm;
      model = this.apiConfig?.model || 'glm-4';
    } else if (this.apiConfig?.baseUrl) {
      baseUrl = this.apiConfig.baseUrl;
      model = this.apiConfig?.model || 'gpt-4';
    } else {
      baseUrl = API_ENDPOINTS.openai;
      model = this.apiConfig?.model || 'gpt-4';
    }

    // Get localized system prompt for built-in modes
    const systemPrompt = mode.isCustom 
      ? mode.systemPrompt 
      : getSystemPrompt(mode.id, this.language);

    // Localized user prompt（自定义提示词时，将指令与待处理文本一并传入）
    const userPrompt = userInstruction
      ? '用户指令：\n' + userInstruction + '\n\n待处理文本：\n' + text
      : (this.language === 'zh' 
        ? '请重写以下文本:\n\n' + text
        : 'Please rewrite the following text:\n\n' + text);

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || error.message || 'API request failed');
    }

    const data = await response.json();
    
    // 提取 token 使用情况并保存
    const usage = this.extractOpenAIUsage(data);
    if (usage) {
      await this.saveTokenRecord(usage, mode.id);
    }
    
    // 不同 API 的响应格式略有不同
    if (this.apiConfig?.provider === 'qwen') {
      return data.output?.text || data.choices?.[0]?.message?.content || '';
    }
    
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropic(text: string, mode: WritingMode, userInstruction?: string): Promise<string> {
    // Get localized system prompt for built-in modes
    const systemPrompt = mode.isCustom 
      ? mode.systemPrompt 
      : getSystemPrompt(mode.id, this.language);

    // Localized user prompt（自定义提示词时，将指令与待处理文本一并传入）
    const userPrompt = userInstruction
      ? '用户指令：\n' + userInstruction + '\n\n待处理文本：\n' + text
      : (this.language === 'zh' 
        ? '请重写以下文本:\n\n' + text
        : 'Please rewrite the following text:\n\n' + text);

    const response = await fetch(API_ENDPOINTS.anthropic, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.apiConfig?.model || 'claude-3-opus-20240229',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    
    // Anthropic 格式的 token 使用情况
    if (data.usage) {
      const usage: TokenUsage = {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      };
      await this.saveTokenRecord(usage, mode.id);
    }
    
    return data.content?.[0]?.text || '';
  }

  private async processSelection(text: string, modeId: string, tabId?: number): Promise<void> {
    if (!tabId) return;

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_LOADING',
    });

    const response = await this.processText(text, modeId);

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_RESULT',
      payload: response,
    });
  }
}

new BackgroundService();
