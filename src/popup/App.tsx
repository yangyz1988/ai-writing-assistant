import React, { useState, useEffect, useMemo } from 'react';
import { ApiConfig, CustomWritingMode, HistoryRecord, PromptTemplate } from '../shared/types';
import { DEFAULT_API_CONFIG, WRITING_MODES, DOMESTIC_PROVIDERS, AVAILABLE_ICONS, generateModeId, MEMBERSHIP_API_BASE_URL } from '../shared/constants';
import { getMessages, setLanguage, getLanguage, subscribeLanguageChange, initLanguage } from '../shared/i18n';
import { Language, LocaleMessages } from '../shared/i18n/types';
import { PromptTemplateCatalog as PromptTemplateCatalogData, resolveMembershipPlan } from '../shared/entitlements';
import { PromptTemplateCatalog } from './PromptTemplateCatalog';
import { buildConnectionTestRequest } from '../shared/connection-test';
import { PROVIDER_DEFAULTS } from '../shared/provider-config';
import { MembershipClient } from '../shared/membership-client';
import { AccountPanel } from './AccountPanel';
import { AchievementLedger } from './AchievementLedger';
import './styles.css';

type TabType = 'ledger' | 'config' | 'modes' | 'customModes' | 'history' | 'promptTemplates' | 'account';

const fetchPromptTemplateCatalog = async (): Promise<PromptTemplateCatalogData | null> => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_PROMPT_TEMPLATES' });
  if (!response?.success || !Array.isArray(response.templates)) return null;

  return {
    plan: resolveMembershipPlan(response.plan),
    templates: response.templates as PromptTemplate[],
    lockedTemplates: Array.isArray(response.lockedTemplates)
      ? response.lockedTemplates as PromptTemplate[]
      : [],
  };
};

const App: React.FC = () => {
  const membershipClient = useMemo(
    () => MEMBERSHIP_API_BASE_URL ? new MembershipClient({ baseUrl: MEMBERSHIP_API_BASE_URL }) : null,
    [],
  );
  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  const [apiConfig, setApiConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [selectedMode, setSelectedMode] = useState<string>('official');
  const [apiKey, setApiKey] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [showHelp, setShowHelp] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>('zh');
  const [messages, setMessages] = useState<LocaleMessages>(getMessages());
  
  // 自定义模式相关状态
  const [customModes, setCustomModes] = useState<CustomWritingMode[]>([]);
  const [editingMode, setEditingMode] = useState<CustomWritingMode | null>(null);
  const [showModeForm, setShowModeForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    icon: '📝',
    description: '',
    systemPrompt: '',
  });

  // 历史记录相关状态
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // 提示词模板相关状态
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [lockedPromptTemplates, setLockedPromptTemplates] = useState<PromptTemplate[]>([]);
  const [membershipPlan, setMembershipPlan] = useState<PromptTemplateCatalogData['plan']>('free');
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', prompt: '' });

  // Initialize language
  useEffect(() => {
    initLanguage().then(() => {
      setCurrentLang(getLanguage());
      setMessages(getMessages());
    });
  }, []);

  // Subscribe to language changes
  useEffect(() => {
    const unsubscribe = subscribeLanguageChange((lang) => {
      setCurrentLang(lang);
      setMessages(getMessages());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // 从 sync 读取常规配置
    chrome.storage.sync.get(['apiConfig', 'selectedMode', 'customModes', 'language'], (syncResult) => {
      if (syncResult.apiConfig) setApiConfig(syncResult.apiConfig);
      if (syncResult.selectedMode) setSelectedMode(syncResult.selectedMode);
      if (syncResult.customModes) setCustomModes(syncResult.customModes);
      if (syncResult.language) {
        setCurrentLang(syncResult.language);
        setMessages(getMessages());
      }
    });
    // API Key 从 local 读取（不同步到其他设备）
    chrome.storage.local.get(['apiKey'], (localResult) => {
      if (localResult.apiKey) setApiKey(localResult.apiKey);
    });
  }, []);

  // 加载历史记录
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' })
      .then((resp) => {
        if (resp && resp.success && resp.history) {
          setHistory(resp.history as HistoryRecord[]);
        }
      })
      .catch(() => { /* 忽略 */ });
  }, []);

  // 加载提示词模板
  useEffect(() => {
    fetchPromptTemplateCatalog()
      .then((catalog) => {
        if (catalog) {
          setPromptTemplates(catalog.templates);
          setLockedPromptTemplates(catalog.lockedTemplates);
          setMembershipPlan(catalog.plan);
        }
      })
      .catch(() => { /* 忽略 */ });
  }, []);

  const handleLanguageChange = async (lang: Language) => {
    await setLanguage(lang);
    setCurrentLang(lang);
    setMessages(getMessages());
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 常规配置存 sync，API Key 存 local
      await chrome.storage.sync.set({
        apiConfig,
        selectedMode,
        customModes,
        language: currentLang,
      });
      await chrome.storage.local.set({ apiKey });
      chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
      setTestResult(messages.config.configSaved);
      setTimeout(() => setTestResult(''), 3000);
    } catch (error) {
      console.error('Failed to save config:', error);
      setTestResult(messages.config.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey) {
      setTestResult(messages.config.apiKeyPlaceholder);
      return;
    }

    setIsTesting(true);
    setTestResult(messages.config.testing);

    try {
      const response = await chrome.runtime.sendMessage(buildConnectionTestRequest(apiConfig, apiKey));

      if (response.success) {
        setTestResult(messages.config.testSuccess);
      } else {
        setTestResult(messages.config.testFailed + ': ' + (response.error || ''));
      }
    } catch (error) {
      setTestResult(messages.config.networkError);
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(''), 5000);
    }
  };

  const handleProviderChange = (provider: string) => {
    const domesticProvider = DOMESTIC_PROVIDERS.find(p => p.id === provider);
    setApiConfig({
      ...apiConfig,
      provider: provider as ApiConfig['provider'],
      model: domesticProvider?.defaultModel || PROVIDER_DEFAULTS[provider as ApiConfig['provider']].model,
    });
    setTestResult('');
  };

  // 自定义模式相关函数
  const handleAddMode = () => {
    setEditingMode(null);
    setFormData({ name: '', icon: '📝', description: '', systemPrompt: '' });
    setShowModeForm(true);
  };

  const handleEditMode = (mode: CustomWritingMode) => {
    setEditingMode(mode);
    setFormData({
      name: mode.name,
      icon: mode.icon,
      description: mode.description,
      systemPrompt: mode.systemPrompt,
    });
    setShowModeForm(true);
  };

  const handleDeleteMode = async (modeId: string) => {
    if (!confirm(messages.customModes.deleteConfirm)) return;
    
    const newModes = customModes.filter(m => m.id !== modeId);
    setCustomModes(newModes);
    await chrome.storage.sync.set({ customModes: newModes });
  };

  const handleSaveMode = async () => {
    if (!formData.name.trim() || !formData.systemPrompt.trim()) {
      alert(messages.customModes.nameRequired);
      return;
    }

    const now = Date.now();
    let newModes: CustomWritingMode[];

    if (editingMode) {
      // 编辑现有模式
      newModes = customModes.map(m => 
        m.id === editingMode.id 
          ? { ...m, ...formData, updatedAt: now }
          : m
      );
    } else {
      // 添加新模式
      const newMode: CustomWritingMode = {
        id: generateModeId(),
        ...formData,
        createdAt: now,
        updatedAt: now,
      };
      newModes = [...customModes, newMode];
    }

    setCustomModes(newModes);
    await chrome.storage.sync.set({ customModes: newModes });
    setShowModeForm(false);
    setFormData({ name: '', icon: '📝', description: '', systemPrompt: '' });
  };

  // Get provider name with localization
  const getProviderName = (providerId: string): string => {
    const providerKeys = ['deepseek', 'qwen', 'glm', 'openai', 'anthropic'] as const;
    if (providerKeys.includes(providerId as typeof providerKeys[number])) {
      return (messages.providers as Record<string, { name: string; description?: string }>)[providerId]?.name || providerId;
    }
    return providerId;
  };

  // Get provider description with localization
  const getProviderDescription = (providerId: string): string => {
    const providerKeys = ['deepseek', 'qwen', 'glm'] as const;
    if (providerKeys.includes(providerId as typeof providerKeys[number])) {
      return (messages.providers as Record<string, { name: string; description?: string }>)[providerId]?.description || '';
    }
    return '';
  };

  // Get mode name with localization
  const getModeName = (modeId: string): string => {
    const modeKeys = ['official', 'copywriting', 'technical', 'academic', 'casual', 'polish'] as const;
    if (modeKeys.includes(modeId as typeof modeKeys[number])) {
      return (messages.modes as unknown as Record<string, { name: string; description?: string }>)[modeId]?.name || modeId;
    }
    return modeId;
  };

  // Get mode description with localization
  const getModeDescription = (modeId: string): string => {
    const modeKeys = ['official', 'copywriting', 'technical', 'academic', 'casual', 'polish'] as const;
    if (modeKeys.includes(modeId as typeof modeKeys[number])) {
      return (messages.modes as unknown as Record<string, { name: string; description?: string }>)[modeId]?.description || '';
    }
    return '';
  };

  // ============ 历史记录操作 ============
  const handleDeleteHistory = async (id: string): Promise<void> => {
    if (!confirm(messages.history.deleteConfirm)) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY', payload: { id } });
    setHistory(history.filter((h) => h.id !== id));
  };

  const handleClearHistory = async (): Promise<void> => {
    if (!confirm(messages.history.clearConfirm)) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    setHistory([]);
  };

  // ============ 提示词模板操作 ============
  const handleAddTemplate = (): void => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', prompt: '' });
    setShowTemplateForm(true);
  };

  const handleEditTemplate = (tpl: PromptTemplate): void => {
    setEditingTemplate(tpl);
    setTemplateForm({ name: tpl.name, prompt: tpl.prompt });
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (tplId: string): Promise<void> => {
    if (!confirm(messages.promptTemplates.deleteConfirm)) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_PROMPT_TEMPLATE', payload: { id: tplId } });
    const catalog = await fetchPromptTemplateCatalog();
    if (catalog) {
      setPromptTemplates(catalog.templates);
      setLockedPromptTemplates(catalog.lockedTemplates);
      setMembershipPlan(catalog.plan);
    }
  };

  const handleSaveTemplate = async (): Promise<void> => {
    if (!templateForm.name.trim() || !templateForm.prompt.trim()) {
      alert(messages.promptTemplates.nameRequired);
      return;
    }
    const now = Date.now();
    const userTemplates = promptTemplates.filter((t) => !t.builtin);
    let newUser: PromptTemplate[];
    if (editingTemplate) {
      newUser = userTemplates.map((t) =>
        t.id === editingTemplate.id
          ? { ...t, name: templateForm.name.trim(), prompt: templateForm.prompt.trim(), updatedAt: now }
          : t
      );
    } else {
      const newTpl: PromptTemplate = {
        id: 'tpl-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
        name: templateForm.name.trim(),
        prompt: templateForm.prompt.trim(),
        icon: '⚡',
        builtin: false,
        createdAt: now,
        updatedAt: now,
      };
      newUser = [...userTemplates, newTpl];
    }
    await chrome.runtime.sendMessage({ type: 'SAVE_PROMPT_TEMPLATES', payload: { templates: newUser } });
    const catalog = await fetchPromptTemplateCatalog();
    if (catalog) {
      setPromptTemplates(catalog.templates);
      setLockedPromptTemplates(catalog.lockedTemplates);
      setMembershipPlan(catalog.plan);
    }
    setShowTemplateForm(false);
    setTemplateForm({ name: '', prompt: '' });
  };

  const selectedProvider = DOMESTIC_PROVIDERS.find(p => p.id === apiConfig.provider);

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>{messages.app.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={currentLang}
            onChange={(e) => handleLanguageChange(e.target.value as Language)}
            className="language-select"
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              background: '#fff',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <option value="zh">{messages.language.zh}</option>
            <option value="en">{messages.language.en}</option>
          </select>
          <button className="help-btn" onClick={() => setShowHelp(!showHelp)}>?</button>
        </div>
      </header>

      {showHelp && (
        <div className="help-section">
          <h3>{messages.help.title}</h3>
          <ol>
            <li>{messages.help.step1}</li>
            <li>{messages.help.step2}</li>
            <li>{messages.help.step3}</li>
            <li>{messages.help.step4}</li>
            <li>{messages.help.step5}</li>
            <li>{messages.help.step6}</li>
            <li>{messages.help.step7}</li>
          </ol>
          <p className="tip">{messages.help.tip}</p>
          <button className="close-help-btn" onClick={() => setShowHelp(false)}>{messages.help.close}</button>
        </div>
      )}

      {/* 标签页导航 */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          {currentLang === 'zh' ? '成果账本' : 'Ledger'}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          {messages.tabs.config}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'modes' ? 'active' : ''}`}
          onClick={() => setActiveTab('modes')}
        >
          {messages.tabs.modes}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'customModes' ? 'active' : ''}`}
          onClick={() => setActiveTab('customModes')}
        >
          {messages.tabs.customModes}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {messages.tabs.history}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'promptTemplates' ? 'active' : ''}`}
          onClick={() => setActiveTab('promptTemplates')}
        >
          {messages.tabs.promptTemplates}
        </button>
        <button
          className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          {messages.tabs.account}
        </button>
      </div>

      {activeTab === 'ledger' && <AchievementLedger language={currentLang} />}

      {/* API 配置标签页 */}
      {activeTab === 'config' && (
        <section className="config-section">
          <h2>{messages.config.title}</h2>
          
          <div className="form-group">
            <label htmlFor="provider">{messages.config.provider}</label>
            <select
              id="provider"
              value={apiConfig.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              <optgroup label={messages.config.domesticProviders}>
                {DOMESTIC_PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>
                    {getProviderName(p.id)} - {getProviderDescription(p.id)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={messages.config.foreignProviders}>
                <option value="openai">{getProviderName('openai')}</option>
                <option value="anthropic">{getProviderName('anthropic')}</option>
              </optgroup>
            </select>
            {selectedProvider && (
              <small className="provider-info">
                {getProviderDescription(apiConfig.provider)}
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">{messages.config.apiKey}</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={messages.config.apiKeyPlaceholder}
            />
            <small className="help-text">
              {apiConfig.provider === 'deepseek' && `${messages.config.getKey}: platform.deepseek.com`}
              {apiConfig.provider === 'qwen' && `${messages.config.getKey}: dashscope.aliyun.com`}
              {apiConfig.provider === 'glm' && `${messages.config.getKey}: open.bigmodel.cn`}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="model">{messages.config.model}</label>
            <input
              id="model"
              type="text"
              value={apiConfig.model}
              onChange={(e) => setApiConfig({ ...apiConfig, model: e.target.value })}
              placeholder={messages.config.modelPlaceholder}
            />
            <small className="help-text">
              {apiConfig.provider === 'deepseek' && `${messages.config.recommended}: deepseek-chat`}
              {apiConfig.provider === 'qwen' && `${messages.config.recommended}: qwen-turbo, qwen-plus`}
              {apiConfig.provider === 'glm' && `${messages.config.recommended}: glm-4, glm-3-turbo`}
            </small>
          </div>

          <div className="test-area">
            <button 
              className="test-button" 
              onClick={handleTest}
              disabled={isTesting || !apiKey}
            >
              {isTesting ? messages.config.testing : messages.config.testConnection}
            </button>
            {testResult && <span className="test-result">{testResult}</span>}
          </div>
        </section>
      )}

      {/* 写作模式标签页 */}
      {activeTab === 'modes' && (
        <section className="modes-section">
          <h2>{messages.modes.builtIn}</h2>
          <div className="mode-list">
            {WRITING_MODES.map((mode) => (
              <button
                key={mode.id}
                className={'mode-button ' + (selectedMode === mode.id ? 'active' : '')}
                onClick={() => setSelectedMode(mode.id)}
                title={getModeDescription(mode.id)}
              >
                <span className="mode-icon">{mode.icon}</span>
                <span className="mode-name">{getModeName(mode.id)}</span>
              </button>
            ))}
          </div>
          
          {customModes.length > 0 && (
            <>
              <h2 style={{ marginTop: '16px' }}>{messages.modes.custom}</h2>
              <div className="mode-list">
                {customModes.map((mode) => (
                  <button
                    key={mode.id}
                    className={'mode-button custom ' + (selectedMode === mode.id ? 'active' : '')}
                    onClick={() => setSelectedMode(mode.id)}
                    title={mode.description}
                  >
                    <span className="mode-icon">{mode.icon}</span>
                    <span className="mode-name">{mode.name}</span>
                    <span className="custom-badge">{messages.modes.customBadge}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* 自定义模式标签页 */}
      {activeTab === 'customModes' && (
        <section className="custom-modes-section">
          <div className="section-header">
            <h2>{messages.customModes.title}</h2>
            <button className="add-mode-btn" onClick={handleAddMode}>
              {messages.customModes.addMode}
            </button>
          </div>

          {customModes.length === 0 && !showModeForm && (
            <div className="empty-state">
              <p>{messages.customModes.noModes}</p>
              <p className="hint">{messages.customModes.noModesHint}</p>
            </div>
          )}

          {customModes.length > 0 && !showModeForm && (
            <div className="custom-mode-list">
              {customModes.map((mode) => (
                <div key={mode.id} className="custom-mode-item">
                  <div className="mode-info">
                    <span className="mode-icon-large">{mode.icon}</span>
                    <div className="mode-details">
                      <div className="mode-name-large">{mode.name}</div>
                      <div className="mode-desc">{mode.description}</div>
                    </div>
                  </div>
                  <div className="mode-actions">
                    <button 
                      className="edit-btn"
                      onClick={() => handleEditMode(mode)}
                    >
                      {messages.customModes.edit}
                    </button>
                    <button 
                      className="delete-btn"
                      onClick={() => handleDeleteMode(mode.id)}
                    >
                      {messages.customModes.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showModeForm && (
            <div className="mode-form">
              <h3>{editingMode ? messages.customModes.editMode : messages.customModes.newMode}</h3>
              
              <div className="form-group">
                <label>{messages.customModes.name} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={messages.customModes.namePlaceholder}
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label>{messages.customModes.icon}</label>
                <div className="icon-picker">
                  {AVAILABLE_ICONS.slice(0, 30).map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`icon-option ${formData.icon === icon ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>{messages.customModes.description}</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={messages.customModes.descriptionPlaceholder}
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label>{messages.customModes.systemPrompt} *</label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  placeholder={messages.customModes.systemPromptPlaceholder}
                  rows={5}
                />
                <small className="help-text">
                  {messages.customModes.promptTip}
                </small>
              </div>

              <div className="form-actions">
                <button 
                  className="cancel-btn"
                  onClick={() => setShowModeForm(false)}
                >
                  {messages.customModes.cancel}
                </button>
                <button 
                  className="save-mode-btn"
                  onClick={handleSaveMode}
                >
                  {messages.customModes.save}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 历史记录标签页 */}
      {activeTab === 'history' && (
        <section className="history-section">
          <div className="section-header">
            <h2>{messages.history.title}</h2>
            {history.length > 0 && (
              <button className="clear-btn" onClick={handleClearHistory}>
                {messages.history.clearAll}
              </button>
            )}
          </div>

          {history.length === 0 && (
            <div className="empty-state">
              <p>{messages.history.empty}</p>
            </div>
          )}

          <div className="history-list">
            {history.map((h) => (
              <div key={h.id} className={'history-item' + (h.isCustom ? ' custom' : '')}>
                <div className="history-head">
                  <span className="history-mode">{h.modeIcon} {h.modeName}{h.isCustom && <span className="custom-badge">{messages.history.customBadge}</span>}</span>
                  <span className="history-time">{new Date(h.timestamp).toLocaleString()}</span>
                </div>
                {h.isCustom && h.customPrompt && (
                  <div className="history-prompt"><strong>{messages.history.promptLabel}:</strong> {h.customPrompt}</div>
                )}
                <div className="history-texts">
                  <div className="history-original"><span className="label">原文</span><p>{h.originalText}</p></div>
                  <div className="history-result"><span className="label">结果</span><p>{h.resultText}</p></div>
                </div>
                <div className="history-actions">
                  <button className="delete-btn" onClick={() => handleDeleteHistory(h.id)}>{messages.customModes.delete}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 提示词模板标签页 */}
      {activeTab === 'promptTemplates' && (
        <section className="prompt-templates-section">
          <div className="section-header">
            <h2>{messages.promptTemplates.title}</h2>
            <button className="add-mode-btn" onClick={handleAddTemplate}>{messages.promptTemplates.addTemplate}</button>
          </div>

          {!showTemplateForm && (
            <PromptTemplateCatalog
              plan={membershipPlan}
              templates={promptTemplates}
              lockedTemplates={lockedPromptTemplates}
              language={currentLang}
            />
          )}

          {!showTemplateForm && promptTemplates.length === 0 && (
            <div className="empty-state">
              <p>{messages.promptTemplates.noTemplates}</p>
              <p className="hint">{messages.promptTemplates.noTemplatesHint}</p>
            </div>
          )}

          {!showTemplateForm && promptTemplates.length > 0 && (
            <div className="template-list">
              {promptTemplates.map((t) => (
                <div key={t.id} className={'template-item' + (t.builtin ? ' builtin' : '')}>
                  <div className="template-info">
                    <span className="template-name">{(t.icon || '⚡') + ' ' + t.name}</span>
                    <span className="template-prompt">{t.prompt}</span>
                  </div>
                  <div className="template-actions">
                    {!t.builtin && (
                      <>
                        <button className="edit-btn" onClick={() => handleEditTemplate(t)}>{messages.promptTemplates.edit}</button>
                        <button className="delete-btn" onClick={() => handleDeleteTemplate(t.id)}>{messages.promptTemplates.delete}</button>
                      </>
                    )}
                    {t.builtin && <span className="builtin-badge">{messages.promptTemplates.builtin}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showTemplateForm && (
            <div className="mode-form">
              <h3>{editingTemplate ? messages.promptTemplates.editTemplate : messages.promptTemplates.newTemplate}</h3>
              <div className="form-group">
                <label>{messages.promptTemplates.name} *</label>
                <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder={messages.promptTemplates.namePlaceholder} maxLength={20} />
              </div>
              <div className="form-group">
                <label>{messages.promptTemplates.prompt} *</label>
                <textarea value={templateForm.prompt} onChange={(e) => setTemplateForm({ ...templateForm, prompt: e.target.value })} placeholder={messages.promptTemplates.promptPlaceholder} rows={4} />
              </div>
              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setShowTemplateForm(false)}>{messages.promptTemplates.cancel}</button>
                <button className="save-mode-btn" onClick={handleSaveTemplate}>{messages.promptTemplates.save}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'account' && (
        <AccountPanel
          client={membershipClient}
          language={currentLang}
          onPlanChange={setMembershipPlan}
        />
      )}

      {activeTab !== 'account' && activeTab !== 'ledger' && (
        <button
          className="save-button"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? messages.config.saving : messages.config.saveSettings}
        </button>
      )}

      <footer className="popup-footer">
        <p className="tips">{messages.app.tips}</p>
      </footer>
    </div>
  );
};

export default App;
