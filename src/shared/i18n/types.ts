export type Language = 'zh' | 'en';

export interface LocaleMessages {
  app: {
    title: string;
    tips: string;
  };
  tabs: {
    config: string;
    modes: string;
    customModes: string;
    history: string;
    promptTemplates: string;
  };
  config: {
    title: string;
    provider: string;
    domesticProviders: string;
    foreignProviders: string;
    apiKey: string;
    apiKeyPlaceholder: string;
    model: string;
    modelPlaceholder: string;
    getKey: string;
    recommended: string;
    testConnection: string;
    testing: string;
    testSuccess: string;
    testFailed: string;
    networkError: string;
    configSaved: string;
    saveFailed: string;
    saveSettings: string;
    saving: string;
  };
  providers: {
    deepseek: { name: string; description: string };
    qwen: { name: string; description: string };
    glm: { name: string; description: string };
    openai: { name: string };
    anthropic: { name: string };
  };
  modes: {
    builtIn: string;
    custom: string;
    customBadge: string;
    official: { name: string; description: string };
    copywriting: { name: string; description: string };
    technical: { name: string; description: string };
    academic: { name: string; description: string };
    casual: { name: string; description: string };
    polish: { name: string; description: string };
  };
  customModes: {
    title: string;
    addMode: string;
    noModes: string;
    noModesHint: string;
    editMode: string;
    newMode: string;
    name: string;
    namePlaceholder: string;
    icon: string;
    description: string;
    descriptionPlaceholder: string;
    systemPrompt: string;
    systemPromptPlaceholder: string;
    promptTip: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    cancel: string;
    save: string;
    nameRequired: string;
  };
  help: {
    title: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    step5: string;
    step6: string;
    step7: string;
    tip: string;
    close: string;
  };
  language: {
    label: string;
    zh: string;
    en: string;
  };
  content: {
    menuTitle: string;
    quickSelect: string;
    moreModes: string;
    processing: string;
    previewTitle: string;
    confirmReplace: string;
    originalText: string;
    resultText: string;
    characters: string;
    diffStats: string;
    additions: string;
    deletions: string;
    similarity: string;
    cancelKey: string;
    confirmButton: string;
    replaced: string;
    selectTextFirst: string;
    textTooShort: string;
    processFailed: string;
  };
  history: {
    title: string;
    empty: string;
    clearAll: string;
    clearConfirm: string;
    deleteConfirm: string;
    customBadge: string;
    promptLabel: string;
    noPrompt: string;
  };
  promptTemplates: {
    title: string;
    addTemplate: string;
    noTemplates: string;
    noTemplatesHint: string;
    builtin: string;
    name: string;
    namePlaceholder: string;
    prompt: string;
    promptPlaceholder: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    cancel: string;
    save: string;
    newTemplate: string;
    editTemplate: string;
    nameRequired: string;
  };
}