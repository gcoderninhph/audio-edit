import { useCallback, useMemo, useState } from 'react';
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, translations } from './i18nConfig';
import { I18nContext } from './i18nContext';

function resolveLocale(nextLocale) {
  return SUPPORTED_LOCALES.includes(nextLocale) ? nextLocale : 'en';
}

function getStoredLocale() {
  try {
    return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return 'en';
  }
}

function readTranslationValue(locale, key) {
  const segments = String(key || '').split('.').filter(Boolean);
  let value = translations[locale];
  for (const segment of segments) {
    value = value?.[segment];
    if (value === undefined) {
      return undefined;
    }
  }
  return value;
}

function interpolate(template, params) {
  return Object.entries(params || {}).reduce(
    (message, [paramKey, paramValue]) => message.replaceAll(`{${paramKey}}`, String(paramValue)),
    template,
  );
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(getStoredLocale);

  const setLocale = useCallback((nextLocale) => {
    const resolvedLocale = resolveLocale(nextLocale);
    setLocaleState(resolvedLocale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, resolvedLocale);
    } catch {
      // Ignore persistence failures in restricted runtimes.
    }
  }, []);

  const value = useMemo(() => ({
    availableLocales: SUPPORTED_LOCALES,
    locale,
    setLocale,
    t: (key, params = {}) => {
      const activeValue = readTranslationValue(locale, key);
      const fallbackValue = readTranslationValue('en', key);
      const resolvedValue = typeof activeValue === 'string'
        ? activeValue
        : typeof fallbackValue === 'string'
          ? fallbackValue
          : key;
      return interpolate(resolvedValue, params);
    },
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
