import { Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';

export default function HeaderLanguageSwitcher({ locatorCode }) {
  const { availableLocales, locale, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const currentLanguageLabel = t(`meta.languages.${locale}`);
  const options = useMemo(
    () => availableLocales.map((optionLocale) => ({
      code: optionLocale,
      label: t(`meta.languages.${optionLocale}`),
    })),
    [availableLocales, t],
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (wrapperRef.current?.contains(event.target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="header-language-switcher dev-locator-host" ref={wrapperRef}>
      <DeveloperLocator code={`${locatorCode || 'header.dashboard'}.language`} title="Header Language Switcher" />
      <button
        type="button"
        className={`header-language-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={t('header.language.title')}
      >
        <span className="header-language-trigger-icon" aria-hidden="true">
          <Globe size={16} />
        </span>
        <span className="header-language-trigger-text">
          <span className="header-language-trigger-label">{t('header.language.current')}</span>
          <span className="header-language-trigger-value">{currentLanguageLabel}</span>
        </span>
      </button>
      {isOpen && (
        <div className="header-language-menu" role="menu" aria-label={t('header.language.title')}>
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              className={`header-language-option${option.code === locale ? ' is-active' : ''}`}
              role="menuitemradio"
              aria-checked={option.code === locale}
              onClick={() => {
                setLocale(option.code);
                setIsOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.code === locale && <span className="header-language-option-check">•</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
