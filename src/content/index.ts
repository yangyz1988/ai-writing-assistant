/**
 * AI Writing Assistant - Content Script
 * 
 * 功能：
 * - Shadow DOM 样式隔离
 * - 文本选择和浮动菜单
 * - 预览确认窗口（原文 vs 改写对比）
 * - 快捷键支持（Ctrl+Shift+W 唤起，数字键选择，Esc关闭）
 * - Toast 提示（loading、success、error）
 * - 自定义写作模式支持
 * - 暗色模式支持
 */

import { WritingMode, CustomWritingMode, BatchSegment, BatchProcessResult, HistoryRecord, PromptTemplate } from '../shared/types';
import { WRITING_MODES, QUICK_PROMPTS, CUSTOM_PROMPT_SYSTEM } from '../shared/constants';
import { mapWithConcurrency } from '../shared/async-pool';
import { captureSelectionContext, getSelectionRect, replaceSelectionContext, SelectionContext } from '../shared/selection-replacement';
import styles from './content.css?inline';

// ==================== 类型定义 ====================

type ToastType = 'loading' | 'success' | 'error' | 'info';

interface DiffStats {
  additions: number;
  deletions: number;
  similarity: number;
}

// ==================== 主类 ====================

class AIWritingAssistant {
  // Shadow DOM 相关
  private shadowContainer: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  
  // UI 状态
  private floatingMenu: HTMLDivElement | null = null;
  private previewOverlay: HTMLDivElement | null = null;
  private toastElement: HTMLDivElement | null = null;
  private batchProgressOverlay: HTMLDivElement | null = null;
  
  // 选择状态
  private currentSelection: SelectionContext | null = null;
  private isMenuOpen: boolean = false;
  
  // 预览状态
  private pendingResult: string | null = null;
  private pendingMode: WritingMode | null = null;
  private pendingOriginalText: string | null = null;
  private boundEscHandler: ((e: KeyboardEvent) => void) | null = null;
  
  // 写作模式
  private customModes: CustomWritingMode[] = [];
  private allModes: WritingMode[] = [];
  
  // 主题
  private currentTheme: 'light' | 'dark' = 'light';
  private themeMediaQuery: MediaQueryList | null = null;
  
  // 批量处理
  private batchSegments: BatchSegment[] = [];
  private batchResults: BatchProcessResult[] = [];
  private isBatchProcessing: boolean = false;
  private batchCancelled: boolean = false;
  
  // 自定义提示词
  private customPromptOverlay: HTMLDivElement | null = null;

  constructor() {
    this.init();
  }

  // ==================== 初始化 ====================

  private async init(): Promise<void> {
    // 初始化主题
    this.initTheme();
    
    // 初始化 Shadow DOM
    this.initShadowDOM();
    
    // 加载自定义模式
    await this.loadCustomModes();
    
    // 绑定事件
    this.bindEvents();
  }

  private initTheme(): void {
    this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // 从 storage 读取用户主题偏好
    chrome.storage.sync.get(['theme'], (result) => {
      const userTheme = result.theme as string | undefined;
      if (userTheme && userTheme !== 'system') {
        this.currentTheme = userTheme as 'light' | 'dark';
      } else {
        this.currentTheme = this.themeMediaQuery!.matches ? 'dark' : 'light';
      }
      this.applyTheme();
    });

    // 监听 storage 变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.theme) {
        const newTheme = changes.theme.newValue as string;
        if (newTheme && newTheme !== 'system') {
          this.currentTheme = newTheme as 'light' | 'dark';
        } else {
          this.currentTheme = this.themeMediaQuery?.matches ? 'dark' : 'light';
        }
        this.applyTheme();
      }
    });

    // 监听系统主题变化
    this.themeMediaQuery.addEventListener('change', (e) => {
      chrome.storage.sync.get(['theme'], (result) => {
        const userTheme = result.theme as string | undefined;
        if (!userTheme || userTheme === 'system') {
          this.currentTheme = e.matches ? 'dark' : 'light';
          this.applyTheme();
        }
      });
    });
  }

  private applyTheme(): void {
    if (this.shadowRoot) {
      const host = this.shadowRoot.host as HTMLElement;
      if (this.currentTheme === 'dark') {
        host.setAttribute('data-theme', 'dark');
      } else {
        host.removeAttribute('data-theme');
      }
    }
  }

  private initShadowDOM(): void {
    this.shadowContainer = document.createElement('div');
    this.shadowContainer.id = 'ai-writing-assistant-root';
    this.shadowContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0;';
    document.body.appendChild(this.shadowContainer);
    
    this.shadowRoot = this.shadowContainer.attachShadow({ mode: 'closed' });
    
    // 采用 CSSStyleSheet 构造样式表
    try {
      const styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(styles);
      this.shadowRoot.adoptedStyleSheets = [styleSheet];
    } catch {
      // 回退方案
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      this.shadowRoot.appendChild(styleEl);
    }
    
    this.applyTheme();
  }

  private async loadCustomModes(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['customModes']);
      this.customModes = result.customModes || [];
      this.updateAllModes();
    } catch {
      this.customModes = [];
      this.updateAllModes();
    }

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.customModes) {
        this.customModes = changes.customModes.newValue || [];
        this.updateAllModes();
      }
    });
  }

  private updateAllModes(): void {
    const customModesAsWriting: WritingMode[] = this.customModes.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      description: m.description,
      systemPrompt: m.systemPrompt,
      isCustom: true,
    }));
    this.allModes = [...WRITING_MODES, ...customModesAsWriting];
  }

  private bindEvents(): void {
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // 监听来自 background 的快捷键命令
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRIGGER_MENU') {
        this.triggerMenuByShortcut();
      }
    });
  }

  // ==================== 事件处理 ====================

  private handleKeyDown(event: KeyboardEvent): void {
    // Esc 关闭菜单/预览
    if (event.key === 'Escape') {
      if (this.previewOverlay) {
        this.hidePreviewModal();
      } else if (this.isMenuOpen) {
        this.hideMenu();
      }
      return;
    }

    // 数字键 1-9 快速选择模式
    if (this.isMenuOpen && /^[1-9]$/.test(event.key)) {
      const modeIndex = parseInt(event.key) - 1;
      const mode = this.allModes[modeIndex];
      if (mode) {
        event.preventDefault();
        this.processWithMode(mode);
      }
      return;
    }

    // Ctrl+Shift+W (Windows) / Cmd+Shift+W (Mac) 唤起菜单
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? event.metaKey : event.ctrlKey;
    if (modifierKey && event.shiftKey && event.key.toUpperCase() === 'W') {
      event.preventDefault();
      this.triggerMenuByShortcut();
    }
  }

  private triggerMenuByShortcut(): void {
    const context = captureSelectionContext(document.activeElement);
    if (!context) {
      this.showToast('请先选择文本', 'error');
      return;
    }
    if (context.text.length < 3) {
      this.showToast('选择的文本太短', 'error');
      return;
    }

    this.currentSelection = context;
    this.showMenu(getSelectionRect(context));
  }

  private handleMouseUp(event: MouseEvent): void {
    setTimeout(() => this.handleSelection(event), 10);
  }

  private handleSelection(event: MouseEvent): void {
    // 点击在 Shadow DOM 内部时不处理
    if (this.shadowRoot && event.target && this.shadowRoot.contains(event.target as Node)) {
      return;
    }

    const context = captureSelectionContext(event.target);
    if (!context || context.text.length < 3) {
      this.hideMenu();
      return;
    }

    this.currentSelection = context;
    this.showMenu(getSelectionRect(context));
  }

  private handleMouseDown(event: MouseEvent): void {
    if (this.floatingMenu && this.shadowRoot && !this.shadowRoot.contains(event.target as Node)) {
      setTimeout(() => this.hideMenu(), 200);
    }
  }

  // ==================== 菜单 ====================

  private showMenu(rangeRect: DOMRect): void {
    this.hideMenu();
    if (!this.shadowRoot) return;

    // 检测批量片段
    this.batchSegments = this.currentSelection ? this.detectBatchSegments(this.currentSelection.text) : [];
    const hasBatchSegments = this.batchSegments.length > 1;

    const isDark = this.currentTheme === 'dark';
    const menu = this.createMenuElement(isDark, hasBatchSegments);

    this.shadowRoot.appendChild(menu);
    this.positionMenu(menu, rangeRect);

    requestAnimationFrame(() => {
      menu.style.opacity = '1';
      menu.style.transform = 'translateY(0)';
    });

    this.floatingMenu = menu;
    this.isMenuOpen = true;
  }

  private createMenuElement(_isDark: boolean, hasBatchSegments: boolean): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'ai-writing-menu';
    
    const totalModes = Math.min(this.allModes.length, 9);
    
    // 只设置 JS 控制的定位和过渡动画
    menu.style.position = 'absolute';
    menu.style.zIndex = '999999';
    
    // 标题
    const title = document.createElement('div');
    title.className = 'ai-writing-menu-title';
    title.innerHTML = `AI 写作助手 <span>按 1-${totalModes} 快速选择</span>`;
    menu.appendChild(title);

    // 模式按钮容器
    const modesContainer = document.createElement('div');
    modesContainer.className = 'ai-writing-menu-modes';
    
    this.allModes.slice(0, 9).forEach((mode, index) => {
      const button = this.createModeButton(mode, index);
      modesContainer.appendChild(button);
    });
    
    menu.appendChild(modesContainer);

    // 批量处理提示
    if (hasBatchSegments) {
      const batchSection = this.createBatchSection();
      menu.appendChild(batchSection);
    }

    // 自定义提示词按钮
    const customPromptSection = this.createCustomPromptSection();
    menu.appendChild(customPromptSection);

    // 超过 9 个模式的提示
    if (this.allModes.length > 9) {
      const moreHint = document.createElement('div');
      moreHint.className = 'ai-writing-menu-more-hint';
      moreHint.textContent = `还有 ${this.allModes.length - 9} 个模式未显示`;
      menu.appendChild(moreHint);
    }

    return menu;
  }

  private createModeButton(mode: WritingMode, index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'ai-writing-mode-btn' + (mode.isCustom ? ' is-custom' : '');
    button.setAttribute('data-index', String(index));
    button.innerHTML = `
      <span class="mode-icon">${mode.icon}</span>
      <span class="mode-name">${mode.name}</span>
      ${mode.isCustom ? '<span class="custom-badge">自定义</span>' : ''}
      <span class="mode-key">[${index + 1}]</span>
    `;
    button.title = mode.description;
    button.addEventListener('click', () => this.processWithMode(mode));
    
    return button;
  }

  private createBatchSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'ai-writing-menu-batch-section';
    
    // 批量提示
    const batchHint = document.createElement('div');
    batchHint.className = 'ai-writing-menu-batch-hint';
    batchHint.innerHTML = `<span>📦</span><span>检测到 ${this.batchSegments.length} 个文本片段，可批量处理</span>`;
    section.appendChild(batchHint);

    // 批量处理按钮
    const batchButton = document.createElement('button');
    batchButton.className = 'ai-writing-menu-batch-button';
    batchButton.innerHTML = `<span>📦</span><span>批量处理 (${this.batchSegments.length} 个片段)</span>`;
    batchButton.addEventListener('click', () => this.showBatchModeSelection());
    section.appendChild(batchButton);
    
    return section;
  }

  private createCustomPromptSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'ai-writing-menu-custom-prompt';
    
    // 自定义提示词按钮
    const customButton = document.createElement('button');
    customButton.className = 'ai-writing-menu-custom-prompt-button';
    customButton.innerHTML = `<span>✏️</span><span>自定义提示词</span>`;
    customButton.addEventListener('click', () => this.showCustomPromptModal());
    
    section.appendChild(customButton);
    
    return section;
  }

  private positionMenu(menu: HTMLDivElement, rangeRect: DOMRect): void {
    let top = rangeRect.bottom + window.scrollY + 10;
    let left = rangeRect.left + window.scrollX;
    
    if (left + menu.offsetWidth > window.innerWidth - 20) {
      left = window.innerWidth - menu.offsetWidth - 20;
    }
    if (left < 20) left = 20;
    if (top + menu.offsetHeight > window.innerHeight + window.scrollY - 20) {
      top = rangeRect.top + window.scrollY - menu.offsetHeight - 10;
    }
    
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }

  private hideMenu(): void {
    if (this.floatingMenu) {
      this.floatingMenu.remove();
      this.floatingMenu = null;
    }
    this.isMenuOpen = false;
  }

  // ==================== 文本处理 ====================

  private async processWithMode(mode: WritingMode): Promise<void> {
    if (!this.currentSelection) return;

    // 批量处理检查
    if (this.batchSegments.length > 1) {
      this.showBatchModeSelection();
      return;
    }

    this.hideMenu();
    this.showToast('正在处理...', 'loading');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PROCESS_TEXT',
        payload: {
          text: this.currentSelection.text,
          mode: mode.id,
        },
      });

      this.hideToast();
      
      if (response.success && response.result) {
        this.saveHistoryRecord({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          originalText: this.currentSelection.text,
          resultText: response.result,
          modeId: mode.id,
          modeName: mode.name,
          modeIcon: mode.icon,
          timestamp: Date.now(),
          isCustom: false,
        });
        this.showPreviewModal(this.currentSelection.text, response.result, mode);
      } else {
        this.showToast(response.error || '处理失败', 'error');
      }
    } catch (error) {
      this.hideToast();
      this.showToast(error instanceof Error ? error.message : '网络错误', 'error');
    }
  }

  // ==================== 预览窗口 ====================

  private showPreviewModal(originalText: string, resultText: string, mode: WritingMode): void {
    this.hidePreviewModal();
    if (!this.shadowRoot) return;

    const isDark = this.currentTheme === 'dark';
    
    // 创建遮罩
    const overlay = document.createElement('div');
    overlay.className = 'ai-preview-overlay';

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'ai-preview-modal';
    modal.dataset.theme = isDark ? 'dark' : 'light';

    // 头部
    const header = this.createPreviewHeader(mode, isDark);
    modal.appendChild(header);

    // 内容区（原文 vs 结果）
    const content = document.createElement('div');
    content.className = 'ai-preview-content';
    content.appendChild(this.createTextPanel('原文', originalText, isDark ? '#2d2d2d' : '#fafafa', isDark ? '#999' : '#666', isDark));
    content.appendChild(this.createTextPanel('改写结果', resultText, isDark ? '#1e2a3a' : '#f0f7ff', isDark ? '#6ba3e0' : '#1890ff', isDark));
    modal.appendChild(content);

    // 统计信息
    const stats = this.calculateDiff(originalText, resultText);
    const diffPanel = document.createElement('div');
    diffPanel.className = 'ai-preview-stats';
    diffPanel.innerHTML = `
      <div class="stats-inner">
        <span>📊 变化统计:</span>
        <span class="stat-add">+${stats.additions} 字增加</span>
        <span class="stat-del">-${stats.deletions} 字删除</span>
        <span class="stat-sim">≈${stats.similarity}% 相似度</span>
      </div>
    `;
    modal.appendChild(diffPanel);

    // 底部操作栏
    const footer = this.createPreviewFooter(isDark);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);

    // 保存状态
    this.pendingResult = resultText;
    this.pendingMode = mode;
    this.pendingOriginalText = originalText;

    // 绑定事件
    const closeBtn = header.querySelector('.ai-preview-close') as HTMLButtonElement;
    const cancelBtn = footer.querySelector('.ai-preview-cancel') as HTMLButtonElement;
    const confirmBtn = footer.querySelector('.ai-preview-confirm') as HTMLButtonElement;

    closeBtn.onclick = () => this.hidePreviewModal();
    cancelBtn.onclick = () => this.hidePreviewModal();
    confirmBtn.onclick = () => this.confirmReplacement();

    overlay.onclick = (e) => {
      if (e.target === overlay) this.hidePreviewModal();
    };

    // Esc 键监听
    this.boundEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hidePreviewModal();
    };
    document.addEventListener('keydown', this.boundEscHandler);

    // 显示动画
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });

    this.previewOverlay = overlay;
  }

  private createPreviewHeader(mode: WritingMode, _isDark: boolean): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'ai-preview-header';
    
    const modeBadge = mode.isCustom ? ' (自定义)' : '';
    header.innerHTML = `
      <div class="header-left">
        <span class="header-icon">${mode.icon}</span>
        <div>
          <div class="header-title">AI 写作预览</div>
          <div class="header-subtitle">${mode.name}${modeBadge} · 确认后替换</div>
        </div>
      </div>
      <button class="ai-preview-close">×</button>
    `;
    
    return header;
  }

  private createPreviewFooter(_isDark: boolean): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'ai-preview-footer';
    
    footer.innerHTML = `
      <div class="esc-hint">
        按 <kbd>Esc</kbd> 取消
      </div>
      <div class="footer-actions">
        <button class="ai-preview-cancel">取消</button>
        <button class="ai-preview-confirm">确认替换</button>
      </div>
    `;
    
    return footer;
  }

  private createTextPanel(title: string, text: string, bgColor: string, accentColor: string, _isDark: boolean): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'ai-preview-panel';
    // 动态背景色需要 JS 设置（原/结果面板颜色不同）
    panel.style.background = bgColor;

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title';
    titleEl.style.color = accentColor;
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    const textEl = document.createElement('div');
    textEl.className = 'panel-text';
    textEl.textContent = text;
    panel.appendChild(textEl);

    const wordCount = document.createElement('div');
    wordCount.className = 'panel-word-count';
    wordCount.textContent = `${text.length} 字符`;
    panel.appendChild(wordCount);

    return panel;
  }

  private calculateDiff(original: string, result: string): DiffStats {
    const originalLen = original.length;
    const resultLen = result.length;
    
    let commonChars = 0;
    const originalChars = original.split('');
    const resultChars = result.split('');
    const used = new Set<number>();

    for (const char of resultChars) {
      const idx = originalChars.findIndex((c, i) => c === char && !used.has(i));
      if (idx !== -1) {
        commonChars++;
        used.add(idx);
      }
    }

    const additions = Math.max(0, resultLen - commonChars);
    const deletions = Math.max(0, originalLen - commonChars);
    const similarity = Math.round((commonChars / Math.max(originalLen, resultLen, 1)) * 100);

    return { additions, deletions, similarity };
  }

  private hidePreviewModal(): void {
    if (this.previewOverlay) {
      const modal = this.previewOverlay.querySelector('.ai-preview-modal') as HTMLElement;
      if (modal) {
        modal.style.transform = 'scale(0.9) translateY(20px)';
      }
      this.previewOverlay.style.opacity = '0';
      
      setTimeout(() => {
        if (this.previewOverlay) {
          this.previewOverlay.remove();
          this.previewOverlay = null;
        }
      }, 300);
    }

    if (this.boundEscHandler) {
      document.removeEventListener('keydown', this.boundEscHandler);
      this.boundEscHandler = null;
    }

    this.pendingResult = null;
    this.pendingMode = null;
    this.pendingOriginalText = null;
  }

  private confirmReplacement(): void {
    if (this.pendingResult) {
      this.replaceSelection(this.pendingResult);
      this.showToast('已替换', 'success');
    }
    this.hidePreviewModal();
  }

  private replaceSelection(result: string): void {
    if (!this.currentSelection) return;
    replaceSelectionContext(this.currentSelection, result);
  }

  // ==================== Toast 提示 ====================

  private showToast(message: string, type: ToastType): void {
    if (!this.shadowRoot) return;

    this.hideToast();

    const toast = document.createElement('div');
    toast.className = 'ai-writing-toast';
    // 根据类型添加额外类名
    const typeClass = type === 'loading' ? 'toast-loading' : type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : 'toast-info';
    toast.classList.add(typeClass);
    
    const icon = this.getToastIcon(type);
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
    this.shadowRoot.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    if (type !== 'loading') {
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    this.toastElement = toast;
  }

  private getToastIcon(type: ToastType): string {
    switch (type) {
      case 'loading': return '⏳';
      case 'success': return '✓';
      case 'error': return '✗';
      case 'info': return 'ℹ';
    }
  }

  private hideToast(): void {
    if (this.toastElement) {
      this.toastElement.style.opacity = '0';
      setTimeout(() => {
        if (this.toastElement) {
          this.toastElement.remove();
          this.toastElement = null;
        }
      }, 300);
    }
  }

  // ==================== 批量处理 ====================

  private detectBatchSegments(text: string): BatchSegment[] {
    const separators = [
      /\n\s*\n\s*\n+/,     // 三个或更多换行
      /\n\s*---+\s*\n/,    // --- 分隔符
      /\n\s*\*\*\*+\s*\n/, // *** 分隔符
      /\n\s*===+\s*\n/,    // === 分隔符
      /\n\s*···+\s*\n/,    // ··· 分隔符
    ];
    
    let segments: string[] = [text];
    
    for (const separator of separators) {
      const newSegments: string[] = [];
      for (const seg of segments) {
        const parts = seg.split(separator).map(s => s.trim()).filter(s => s.length >= 3);
        newSegments.push(...parts);
      }
      if (newSegments.length > segments.length) {
        segments = newSegments;
      }
    }
    
    // 检查双换行分隔
    if (segments.length === 1 && text.includes('\n\n')) {
      segments = text.split(/\n\n+/).map(s => s.trim()).filter(s => s.length >= 10);
    }
    
    segments = segments.filter(s => s.trim().length >= 3);
    
    if (segments.length <= 1) return [];
    
    return segments.map((text, index) => ({
      id: `segment-${Date.now()}-${index}`,
      text: text.trim(),
      index,
    }));
  }

  private showBatchModeSelection(): void {
    this.hideMenu();
    if (!this.shadowRoot || this.batchSegments.length === 0) return;

    const isDark = this.currentTheme === 'dark';
    
    // 遮罩
    const overlay = document.createElement('div');
    overlay.className = 'ai-batch-modal-overlay';

    // 模态框
    const modal = document.createElement('div');
    modal.className = 'ai-batch-modal';
    modal.dataset.theme = isDark ? 'dark' : 'light';

    // 头部
    const header = document.createElement('div');
    header.className = 'ai-batch-modal-header';
    header.innerHTML = `
      <div class="header-left">
        <span class="header-icon">📦</span>
        <div>
          <div class="header-title">批量处理</div>
          <div class="header-subtitle">共 ${this.batchSegments.length} 个片段，选择处理模式</div>
        </div>
      </div>
      <button class="ai-batch-close">×</button>
    `;
    modal.appendChild(header);

    // 模式选择
    const modesGrid = document.createElement('div');
    modesGrid.className = 'ai-batch-modes-grid';
    
    this.allModes.slice(0, 9).forEach((mode, idx) => {
      const button = document.createElement('button');
      button.className = 'ai-writing-mode-btn' + (mode.isCustom ? ' is-custom' : '');
      button.setAttribute('data-index', String(idx));
      button.innerHTML = `<span class="mode-icon">${mode.icon}</span><span class="mode-name">${mode.name}</span>${mode.isCustom ? '<span class="custom-badge">自定义</span>' : ''}`;
      button.title = mode.description;
      
      button.addEventListener('click', () => {
        this.startBatchProcessing(mode);
        overlay.remove();
      });
      
      modesGrid.appendChild(button);
    });
    
    modal.appendChild(modesGrid);

    // 底部
    const footer = document.createElement('div');
    footer.className = 'ai-batch-modal-footer';
    footer.innerHTML = `
      <button class="ai-batch-cancel">取消</button>
    `;
    modal.appendChild(footer);

    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);

    // 绑定事件
    const closeBtn = header.querySelector('.ai-batch-close') as HTMLButtonElement;
    const cancelBtn = footer.querySelector('.ai-batch-cancel') as HTMLButtonElement;
    
    closeBtn.onclick = () => overlay.remove();
    cancelBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });
  }

  // ==================== 自定义提示词 ====================

  private async showCustomPromptModal(): Promise<void> {
    this.hideMenu();
    if (!this.shadowRoot) return;

    const isDark = this.currentTheme === 'dark';
    
    // 遮罩
    const overlay = document.createElement('div');
    overlay.className = 'ai-prompt-overlay';

    // 模态框
    const modal = document.createElement('div');
    modal.className = 'ai-prompt-modal';
    modal.dataset.theme = isDark ? 'dark' : 'light';

    // 头部
    const header = document.createElement('div');
    header.className = 'ai-prompt-header';
    header.innerHTML = `
      <div class="header-left">
        <span class="header-icon">✏️</span>
        <div>
          <div class="header-title">自定义提示词</div>
          <div class="header-subtitle">输入具体的指令来处理文本</div>
        </div>
      </div>
      <button class="ai-prompt-close">×</button>
    `;
    modal.appendChild(header);

    // 快捷提示词选择
    const quickPromptsSection = document.createElement('div');
    quickPromptsSection.className = 'ai-prompt-quick-section';
    
    const quickPromptsTitle = document.createElement('div');
    quickPromptsTitle.className = 'ai-prompt-quick-title';
    quickPromptsTitle.textContent = '快捷提示词：';
    quickPromptsSection.appendChild(quickPromptsTitle);

    const quickPromptsGrid = document.createElement('div');
    quickPromptsGrid.className = 'ai-prompt-quick-grid';
    
    QUICK_PROMPTS.forEach((qp) => {
      const btn = document.createElement('button');
      btn.className = 'ai-prompt-quick-btn';
      btn.textContent = qp.name;
      btn.title = qp.prompt;
      btn.addEventListener('click', () => {
        const textarea = modal.querySelector('.ai-prompt-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = qp.prompt;
          textarea.focus();
        }
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = isDark ? '#3d3d3d' : '#f5f5f5';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = isDark ? '#2d2d2d' : '#fff';
      });
      quickPromptsGrid.appendChild(btn);
    });
    
    quickPromptsSection.appendChild(quickPromptsGrid);
    modal.appendChild(quickPromptsSection);

    // 输入区域
    const inputSection = document.createElement('div');
    inputSection.className = 'ai-prompt-input-section';
    
    const inputLabel = document.createElement('div');
    inputLabel.className = 'ai-prompt-label';
    inputLabel.textContent = '输入你的指令：';
    inputSection.appendChild(inputLabel);

    const textarea = document.createElement('textarea');
    textarea.className = 'ai-prompt-textarea';
    textarea.placeholder = '例如：请把这段文字改写成更口语化的版本...（输入 / 唤起提示词模板）';
    inputSection.appendChild(textarea);

    // ===== 斜杠命令：输入 / 唤起提示词模板 =====
    let slashTemplates: PromptTemplate[] = [];
    try {
      const tResp = await chrome.runtime.sendMessage({ type: 'GET_PROMPT_TEMPLATES' });
      if (tResp && tResp.success && tResp.templates) {
        slashTemplates = tResp.templates as PromptTemplate[];
      }
    } catch {
      /* 忽略加载失败 */
    }

    const slashDropdown = document.createElement('div');
    slashDropdown.className = 'ai-slash-dropdown';
    inputSection.style.position = 'relative';
    inputSection.appendChild(slashDropdown);

    let slashIndex = 0;
    let slashVisible = false;

    const matchSlash = (query: string): PromptTemplate[] => {
      const q = query.toLowerCase();
      if (!q) return slashTemplates.slice(0, 8);
      return slashTemplates.filter((t) =>
        t.name.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q)
      ).slice(0, 8);
    };

    const renderSlash = (query: string): void => {
      const matched = matchSlash(query);
      slashDropdown.innerHTML = '';
      if (matched.length === 0) {
        slashDropdown.style.display = 'none';
        slashVisible = false;
        return;
      }
      matched.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'ai-slash-item' + (i === slashIndex ? ' active' : '');
        item.innerHTML = `
          <div class="item-name">${this.escapeHtml(t.name)}</div>
          <div class="item-desc">${this.escapeHtml(t.prompt)}</div>
        `;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          applySlash(t);
        });
        slashDropdown.appendChild(item);
      });
      slashDropdown.style.display = 'block';
      slashVisible = true;
    };

    const applySlash = (t: PromptTemplate): void => {
      textarea.value = t.prompt;
      slashDropdown.style.display = 'none';
      slashVisible = false;
      textarea.focus();
    };

    textarea.addEventListener('input', () => {
      const val = textarea.value;
      if (val.startsWith('/')) {
        slashIndex = 0;
        renderSlash(val.slice(1));
      } else {
        slashDropdown.style.display = 'none';
        slashVisible = false;
      }
    });

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!slashVisible) return;
      const matched = matchSlash(textarea.value.slice(1));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashIndex = matched.length ? (slashIndex + 1) % matched.length : 0;
        renderSlash(textarea.value.slice(1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashIndex = matched.length ? (slashIndex - 1 + matched.length) % matched.length : 0;
        renderSlash(textarea.value.slice(1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (matched[slashIndex]) applySlash(matched[slashIndex]);
      } else if (e.key === 'Escape') {
        slashDropdown.style.display = 'none';
        slashVisible = false;
      }
    });

    // 选中的文本预览
    if (this.currentSelection?.text) {
      const previewLabel = document.createElement('div');
      previewLabel.className = 'ai-prompt-preview-label';
      previewLabel.textContent = '选中的文本：';
      inputSection.appendChild(previewLabel);

      const previewText = document.createElement('div');
      previewText.className = 'ai-prompt-preview-text';
      previewText.textContent = this.currentSelection.text.substring(0, 200) + 
        (this.currentSelection.text.length > 200 ? '...' : '');
      inputSection.appendChild(previewText);
    }

    modal.appendChild(inputSection);

    // 底部
    const footer = document.createElement('div');
    footer.className = 'ai-prompt-footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ai-prompt-cancel';
    cancelBtn.textContent = '取消';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'ai-prompt-confirm';
    confirmBtn.textContent = '开始处理';
    
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);

    // 绑定事件
    const closeBtn = header.querySelector('.ai-prompt-close') as HTMLButtonElement;
    
    closeBtn.onclick = () => this.hideCustomPromptModal();
    cancelBtn.onclick = () => this.hideCustomPromptModal();
    confirmBtn.onclick = () => this.processWithCustomPrompt(textarea.value);
    overlay.onclick = (e) => {
      if (e.target === overlay) this.hideCustomPromptModal();
    };

    // 自动聚焦
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
      textarea.focus();
    });

    this.customPromptOverlay = overlay;
  }

  private hideCustomPromptModal(): void {
    if (this.customPromptOverlay) {
      const modal = this.customPromptOverlay.querySelector('.ai-prompt-modal') as HTMLElement;
      if (modal) {
        modal.style.transform = 'scale(0.9) translateY(20px)';
      }
      this.customPromptOverlay.style.opacity = '0';
      
      setTimeout(() => {
        if (this.customPromptOverlay) {
          this.customPromptOverlay.remove();
          this.customPromptOverlay = null;
        }
      }, 300);
    }
  }

  private async processWithCustomPrompt(customPrompt: string): Promise<void> {
    if (!this.currentSelection || !customPrompt.trim()) {
      this.showToast('请输入提示词', 'error');
      return;
    }

    this.hideCustomPromptModal();
    this.showToast('正在处理...', 'loading');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PROCESS_TEXT_WITH_PROMPT',
        payload: {
          text: this.currentSelection.text,
          customPrompt: customPrompt.trim(),
        },
      });

      this.hideToast();
      
      if (response.success && response.result) {
        // 创建一个临时的"自定义提示词"模式用于预览
        const customMode: WritingMode = {
          id: 'custom-prompt',
          name: '自定义',
          icon: '✏️',
          description: customPrompt.substring(0, 30) + (customPrompt.length > 30 ? '...' : ''),
          systemPrompt: CUSTOM_PROMPT_SYSTEM,
          isCustom: true,
        };
        this.saveHistoryRecord({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          originalText: this.currentSelection.text,
          resultText: response.result,
          modeId: 'custom-prompt',
          modeName: '自定义提示词',
          modeIcon: '✏️',
          timestamp: Date.now(),
          customPrompt: customPrompt.trim(),
          isCustom: true,
        });
        this.showPreviewModal(this.currentSelection.text, response.result, customMode);
      } else {
        this.showToast(response.error || '处理失败', 'error');
      }
    } catch (error) {
      this.hideToast();
      this.showToast(error instanceof Error ? error.message : '网络错误', 'error');
    }
  }

  // 保存历史记录（fire-and-forget）
  private saveHistoryRecord(record: HistoryRecord): void {
    chrome.runtime.sendMessage({ type: 'SAVE_HISTORY', payload: { record } }).catch(() => {
      /* 忽略保存失败 */
    });
  }

  // HTML 转义，防止模板内容注入
  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  private async startBatchProcessing(mode: WritingMode): Promise<void> {
    if (this.batchSegments.length === 0) return;

    this.isBatchProcessing = true;
    this.batchCancelled = false;
    this.batchResults = [];

    this.showBatchProgressOverlay(mode);

    // 限制并发，避免一次性请求过多触发供应商限流。
    let completed = 0;

    this.batchResults = await mapWithConcurrency(this.batchSegments, 3, async (segment): Promise<BatchProcessResult> => {
      if (this.batchCancelled) {
        return {
          segmentId: segment.id,
          originalText: segment.text,
          resultText: '',
          success: false,
          error: '已取消',
        };
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'PROCESS_TEXT',
          payload: {
            text: segment.text,
            mode: mode.id,
          },
        });

        const result: BatchProcessResult = response.success && response.result
          ? {
              segmentId: segment.id,
              originalText: segment.text,
              resultText: response.result,
              success: true,
            }
          : {
              segmentId: segment.id,
              originalText: segment.text,
              resultText: '',
              success: false,
              error: response.error || '处理失败',
            };

        completed++;
        this.updateBatchProgress(completed, segment.id);
        return result;
      } catch (error) {
        completed++;
        this.updateBatchProgress(completed, segment.id);
        return {
          segmentId: segment.id,
          originalText: segment.text,
          resultText: '',
          success: false,
          error: error instanceof Error ? error.message : '网络错误',
        };
      }
    });

    this.isBatchProcessing = false;

    if (!this.batchCancelled) {
      this.showBatchResultsModal(mode);
    }
  }

  private showBatchProgressOverlay(mode: WritingMode): void {
    if (!this.shadowRoot) return;

    this.hideBatchProgressOverlay();

    const isDark = this.currentTheme === 'dark';
    
    const overlay = document.createElement('div');
    overlay.className = 'ai-batch-progress-overlay';

    const modal = document.createElement('div');
    modal.className = 'ai-batch-progress-modal';
    modal.dataset.theme = isDark ? 'dark' : 'light';

    modal.innerHTML = `
      <div class="batch-icon">${mode.icon}</div>
      <div class="batch-title">正在批量处理...</div>
      <div class="batch-desc">使用「${mode.name}」模式处理 ${this.batchSegments.length} 个片段</div>
      
      <div class="ai-progress-bar-container">
        <div class="ai-batch-progress-bar" style="width: 0%;"></div>
      </div>
      
      <div class="ai-batch-progress-text">
        已处理 0 / ${this.batchSegments.length}
      </div>
      
      <div class="ai-batch-current-text">
        正在处理第 1 个片段...
      </div>
      
      <button class="ai-batch-cancel-btn">取消批量处理</button>
    `;

    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);

    const cancelBtn = modal.querySelector('.ai-batch-cancel-btn') as HTMLButtonElement;
    cancelBtn.onclick = () => {
      this.batchCancelled = true;
      this.hideBatchProgressOverlay();
      this.showToast('已取消批量处理', 'error');
    };

    this.batchProgressOverlay = overlay;
  }

  private updateBatchProgress(processed: number, currentSegmentId: string): void {
    if (!this.batchProgressOverlay) return;

    const total = this.batchSegments.length;
    const progressBar = this.batchProgressOverlay.querySelector('.ai-batch-progress-bar') as HTMLElement;
    const progressText = this.batchProgressOverlay.querySelector('.ai-batch-progress-text') as HTMLElement;
    const currentText = this.batchProgressOverlay.querySelector('.ai-batch-current-text') as HTMLElement;

    if (progressBar) {
      const percentage = ((processed / total) * 100).toFixed(0);
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      progressText.textContent = `已处理 ${processed} / ${total}`;
    }

    if (currentText) {
      const currentSegment = this.batchSegments.find(s => s.id === currentSegmentId);
      if (currentSegment) {
        currentText.textContent = `正在处理: ${currentSegment.text.substring(0, 50)}${currentSegment.text.length > 50 ? '...' : ''}`;
      }
    }
  }

  private hideBatchProgressOverlay(): void {
    if (this.batchProgressOverlay) {
      this.batchProgressOverlay.remove();
      this.batchProgressOverlay = null;
    }
  }

  private showBatchResultsModal(mode: WritingMode): void {
    this.hideBatchProgressOverlay();
    if (!this.shadowRoot) return;

    const isDark = this.currentTheme === 'dark';
    const successCount = this.batchResults.filter(r => r.success).length;
    const failCount = this.batchResults.filter(r => !r.success).length;

    const overlay = document.createElement('div');
    overlay.className = 'ai-batch-results-overlay';

    const modal = document.createElement('div');
    modal.className = 'ai-batch-results-modal';
    modal.dataset.theme = isDark ? 'dark' : 'light';

    // 头部
    const header = document.createElement('div');
    header.className = 'ai-batch-results-header';
    header.innerHTML = `
      <div class="header-left">
        <span class="header-icon">${mode.icon}</span>
        <div>
          <div class="header-title">批量处理完成</div>
          <div class="header-subtitle">成功 ${successCount} 个 ${failCount > 0 ? `| 失败 ${failCount} 个` : ''}</div>
        </div>
      </div>
      <button class="ai-batch-results-close">×</button>
    `;
    modal.appendChild(header);

    // 结果列表
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'ai-batch-results-container';

    this.batchResults.forEach((result, index) => {
      const card = this.createResultCard(result, index, isDark);
      resultsContainer.appendChild(card);
    });

    modal.appendChild(resultsContainer);

    // 底部
    const footer = document.createElement('div');
    footer.className = 'ai-batch-results-footer';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-batch-results-close-btn';
    closeBtn.textContent = '关闭';
    closeBtn.onclick = () => overlay.remove();
    footer.appendChild(closeBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);

    const closeBtnHeader = header.querySelector('.ai-batch-results-close') as HTMLButtonElement;
    closeBtnHeader.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });
  }

  private createResultCard(result: BatchProcessResult, index: number, isDark: boolean): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'ai-batch-result-card' + (result.success ? '' : ' fail');

    // 卡片头部
    const cardHeader = document.createElement('div');
    cardHeader.className = 'ai-result-card-header';
    cardHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-icon">${result.success ? '✓' : '✗'}</span>
        <span class="card-title">片段 ${index + 1}</span>
        <span class="card-status-text ${result.success ? '' : 'card-status'}">
          ${result.success ? '处理成功' : result.error || '处理失败'}
        </span>
      </div>
    `;
    card.appendChild(cardHeader);

    if (result.success) {
      // 内容区
      const cardContent = document.createElement('div');
      cardContent.className = 'ai-result-card-content';
      cardContent.appendChild(this.createTextPanel('原文', result.originalText, isDark ? '#333' : '#f0f0f0', isDark ? '#999' : '#666', isDark));
      cardContent.appendChild(this.createTextPanel('改写结果', result.resultText, isDark ? '#1e2a3a' : '#f0f7ff', isDark ? '#6ba3e0' : '#1890ff', isDark));
      card.appendChild(cardContent);

      // 操作按钮
      const cardFooter = document.createElement('div');
      cardFooter.className = 'ai-result-card-footer';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-result-copy-btn';
      copyBtn.textContent = '复制结果';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(result.resultText);
        this.showToast('已复制到剪贴板', 'success');
      };

      cardFooter.appendChild(copyBtn);
      card.appendChild(cardFooter);
    }

    return card;
  }
}

// ==================== 启动 ====================

new AIWritingAssistant();
