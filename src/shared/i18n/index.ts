import { Language, LocaleMessages } from './types';
import zhMessages from './locales/zh.json';
import enMessages from './locales/en.json';

const messages: Record<Language, LocaleMessages> = {
  zh: zhMessages as LocaleMessages,
  en: enMessages as LocaleMessages,
};

// Default language based on browser language
function getDefaultLanguage(): Language {
  const browserLang = navigator.language || 'zh';
  if (browserLang && browserLang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

// Current language state
let currentLanguage: Language = getDefaultLanguage();
const listeners: Set<(lang: Language) => void> = new Set();

// Initialize language from storage
export async function initLanguage(): Promise<Language> {
  try {
    // Check if chrome API is available (extension context)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.sync.get(['language']);
      if (result.language) {
        currentLanguage = result.language;
      } else {
        // Save default language
        await chrome.storage.sync.set({ language: currentLanguage });
      }
    }
  } catch {
    // Use default if storage fails
  }
  return currentLanguage;
}

// Get current language
export function getLanguage(): Language {
  return currentLanguage;
}

// Set language and notify listeners
export async function setLanguage(lang: Language): Promise<void> {
  currentLanguage = lang;
  await chrome.storage.sync.set({ language: lang });
  notifyListeners();
}

// Subscribe to language changes
export const subscribeLanguageChange = (callback: (lang: Language) => void): (() => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Notify all listeners
function notifyListeners(): void {
  listeners.forEach(callback => callback(currentLanguage));
}

// Get messages for current language
export function getMessages(): LocaleMessages {
  return messages[currentLanguage];
}

// Get messages for specific language
export function getMessagesForLang(lang: Language): LocaleMessages {
  return messages[lang];
}

// Format message with placeholders
export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

// Export for convenience
export { messages };