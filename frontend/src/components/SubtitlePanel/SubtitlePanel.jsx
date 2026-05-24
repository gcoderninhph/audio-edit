import { useState, useEffect, useRef, useMemo } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import SubtitleCardList from './SubtitleCardList';
import SubtitleProgressPanel from './SubtitleProgressPanel';
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  getVoiceoverLanguageCode,
  isVoiceoverSubtitleLanguageSupported,
} from '../../utils/subtitleTracks';
import { fetchVoiceoverClientConfig } from '../../utils/voiceoverUtils';
import { useI18n } from '../../i18n/useI18n';
import './SubtitlePanel.css';

export default function SubtitlePanel({
  subtitles,
  currentTime,
  onDeleteSubtitle,
  onUpdateSubtitle,
  onSeekToTime,
  activeSubtitleLanguage,
  onActiveSubtitleLanguageChange,
  subtitleLanguageOptions,
  // Transcription
  onStartTranscription,
  isTranscribing,
  transcribeProgress,
  // Translation
  onStartTranslation,
  isTranslating,
  translateProgress,
  onStartVoiceover,
  isGeneratingVoiceover,
  voiceoverProgress,
  lastVoiceoverAudioName,
  isAuthenticated = false,
  authCredits = 0,
  onRequireAuth,
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [enabledVoiceoverLanguageCodes, setEnabledVoiceoverLanguageCodes] = useState(null);
  const listContainerRef = useRef(null);
  const activeItemRef = useRef(null);

  const hasVisibleSubs = subtitles && subtitles.length > 0;
  const selectedLanguageOption = subtitleLanguageOptions?.find((option) => option.id === activeSubtitleLanguage)
    || subtitleLanguageOptions?.find((option) => option.id === DEFAULT_SUBTITLE_LANGUAGE_KEY)
    || { id: DEFAULT_SUBTITLE_LANGUAGE_KEY, label: t('panel.subtitleList.original'), hasSubtitles: false, translatable: false };
  const hasOriginalSubtitles = Boolean(subtitleLanguageOptions?.find((option) => option.id === DEFAULT_SUBTITLE_LANGUAGE_KEY)?.hasSubtitles);
  const isOriginalLanguageSelected = selectedLanguageOption.id === DEFAULT_SUBTITLE_LANGUAGE_KEY;
  const canTranslateSelectedLanguage = hasOriginalSubtitles && selectedLanguageOption.translatable;
  const voiceoverLanguageCode = getVoiceoverLanguageCode(activeSubtitleLanguage);
  const isVoiceoverSupportedLanguage = isVoiceoverSubtitleLanguageSupported(activeSubtitleLanguage);
  const isVoiceoverEnabledByConfig = enabledVoiceoverLanguageCodes === null
    ? true
    : Boolean(voiceoverLanguageCode) && enabledVoiceoverLanguageCodes.includes(voiceoverLanguageCode);
  const canGenerateVoiceover = isVoiceoverSupportedLanguage && isVoiceoverEnabledByConfig && hasVisibleSubs;
  const authRequiredLabel = t('panel.subtitleList.authRequired');
  const creditBalance = Math.max(0, Number(authCredits) || 0);
  const transcriptionCreditCost = 20;
  const translationCreditCost = 100;
  const voiceoverCreditCost = 200;
  const missingSelectedTranslation = !hasVisibleSubs && hasOriginalSubtitles && !isOriginalLanguageSelected;

  // Find the currently active subtitle index based on currentTime
  const activeSubIndex = useMemo(() => {
    if (!hasVisibleSubs) return -1;
    for (let i = subtitles.length - 1; i >= 0; i--) {
      if (currentTime >= subtitles[i].start) {
        if (currentTime <= subtitles[i].end) return i;
        return i;
      }
    }
    return 0;
  }, [subtitles, currentTime, hasVisibleSubs]);

  // Auto-scroll logic: only scroll inside subtitle list container.
  useEffect(() => {
    if (editingId) return;
    const listContainer = listContainerRef.current;
    const activeItem = activeItemRef.current;
    if (!listContainer || !activeItem) return;

    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    const viewportTop = listContainer.scrollTop;
    const viewportBottom = viewportTop + listContainer.clientHeight;
    const padding = 20;

    if (itemTop < viewportTop + padding) {
      listContainer.scrollTo({
        top: Math.max(itemTop - padding, 0),
        behavior: 'smooth',
      });
      return;
    }

    if (itemBottom > viewportBottom - padding) {
      listContainer.scrollTo({
        top: itemBottom - listContainer.clientHeight + padding,
        behavior: 'smooth',
      });
    }
  }, [activeSubIndex, editingId]);

  useEffect(() => {
    let isDisposed = false;

    const loadVoiceoverConfig = async () => {
      try {
        const payload = await fetchVoiceoverClientConfig();
        if (isDisposed) return;
        const nextCodes = Array.isArray(payload?.config?.enabledLanguageCodes)
          ? payload.config.enabledLanguageCodes.map((code) => String(code || '').trim()).filter(Boolean)
          : null;
        setEnabledVoiceoverLanguageCodes(nextCodes);
      } catch {
        if (!isDisposed) {
          setEnabledVoiceoverLanguageCodes(null);
        }
      }
    };

    void loadVoiceoverConfig();

    return () => {
      isDisposed = true;
    };
  }, []);

  const handleEditClick = (sub) => {
    setEditingId(sub.id);
    setEditingText(sub.text);
  };

  const handleSave = (id) => {
    if (editingText.trim() !== '') {
      onUpdateSubtitle(id, editingText);
    }
    setEditingId(null);
  };

  const handleDeleteSubtitle = (id) => {
    if (editingId === id) {
      setEditingId(null);
      setEditingText('');
    }
    onDeleteSubtitle?.(id);
  };

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleStartTranscription = () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    onStartTranscription?.();
  };

  const handleStartTranslation = () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    onStartTranslation?.(activeSubtitleLanguage);
  };

  const handleStartVoiceover = () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    onStartVoiceover?.(activeSubtitleLanguage);
  };

  // ── Transcribing / Translating progress screens ──
  if (isTranscribing) {
    return (
      <SubtitleProgressPanel
        code="panel.subtitle.transcribing"
        title="Subtitle Progress Panel"
        color="#10b981"
        phase={transcribeProgress?.phase || t('panel.subtitleList.transcribePhase')}
        percent={transcribeProgress?.percent}
        hint={t('panel.subtitleList.transcribeHint')}
      />
    );
  }

  if (isTranslating) {
    return (
      <SubtitleProgressPanel
        code="panel.subtitle.translating"
        title="Translation Progress Panel"
        color="#3b82f6"
        phase={translateProgress?.phase || t('panel.subtitleList.translatePhase')}
        percent={translateProgress?.percent}
        hint={t('panel.subtitleList.translateHint')}
      />
    );
  }

  if (isGeneratingVoiceover) {
    return (
      <SubtitleProgressPanel
        code="panel.subtitle.voiceover"
        title="Voiceover Progress Panel"
        color="#f59e0b"
        phase={voiceoverProgress?.phase || t('panel.subtitleList.voiceoverPhase')}
        percent={voiceoverProgress?.percent}
        hint={t('panel.subtitleList.voiceoverHint')}
      />
    );
  }

  // ── Tools section (create / translate) ──
  const showToolsAlways = !hasVisibleSubs;

  const toolsSection = (
    <div className={`subtitle-tools ${showToolsAlways || toolsExpanded ? 'expanded' : ''}`}>
      {/* Header toggle (only when subs exist) */}
      {hasVisibleSubs && (
        <button
          className="subtitle-tools-toggle"
          onClick={() => setToolsExpanded(!toolsExpanded)}
        >
          <span>{t('panel.subtitleList.tools')}</span>
          <span className={`toggle-arrow ${toolsExpanded ? 'open' : ''}`}>▼</span>
        </button>
      )}

      {/* Tools content */}
      {(showToolsAlways || toolsExpanded) && (
        <div className="subtitle-tools-content">
          {isAuthenticated && (
            <div className="subtitle-tool-note">
              {t('panel.subtitleList.currentBalance', { credits: creditBalance })}
            </div>
          )}

          <button
            className="btn btn-primary btn-sm subtitle-tool-btn"
            onClick={handleStartTranscription}
          >
            {!isAuthenticated
              ? authRequiredLabel
              : hasOriginalSubtitles
                ? t('panel.subtitleList.recreateSubtitles', { credits: transcriptionCreditCost })
                : t('panel.subtitleList.generateSubtitles', { credits: transcriptionCreditCost })}
          </button>

          {hasOriginalSubtitles && (
            <>
              <div className="subtitle-language-row">
                <label className="subtitle-tools-label" htmlFor="subtitle-language-select">{t('panel.subtitleList.displayLanguage')}</label>
                <div className="subtitle-input-button-group">
                  <select
                    id="subtitle-language-select"
                    value={activeSubtitleLanguage}
                    onChange={(event) => onActiveSubtitleLanguageChange?.(event.target.value)}
                    className="subtitle-lang-select subtitle-input-button-group-input"
                  >
                    {subtitleLanguageOptions?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}{option.translatable && !option.hasSubtitles ? ` ${t('panel.subtitleList.notTranslatedSuffix')}` : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    className="btn btn-primary btn-sm subtitle-input-button-group-action"
                    style={{ background: '#3b82f6' }}
                    disabled={!canTranslateSelectedLanguage}
                    onClick={handleStartTranslation}
                  >
                    {!isAuthenticated
                      ? authRequiredLabel
                      : selectedLanguageOption.hasSubtitles
                        ? t('panel.subtitleList.retranslate', { credits: translationCreditCost })
                        : t('panel.subtitleList.translate', { credits: translationCreditCost })}
                  </button>
                </div>
              </div>

              <div className="subtitle-tool-note">
                {t('panel.subtitleList.translationHint')}
              </div>

              {missingSelectedTranslation && (
                <div className="subtitle-tool-note subtitle-tool-warning">
                  {t('panel.subtitleList.languageNotTranslated', { language: selectedLanguageOption.label })}
                </div>
              )}

              {!missingSelectedTranslation && (
                <>
                  <button
                    className="btn btn-primary btn-sm subtitle-tool-btn subtitle-voiceover-btn"
                    style={{ background: '#f59e0b' }}
                    onClick={handleStartVoiceover}
                    disabled={!canGenerateVoiceover}
                  >
                    {!isAuthenticated
                      ? authRequiredLabel
                      : !isVoiceoverSupportedLanguage
                        ? t('panel.subtitleList.unsupportedVoiceoverLanguage')
                        : !isVoiceoverEnabledByConfig
                          ? t('panel.subtitleList.voiceoverDisabledByConfig')
                          : canGenerateVoiceover
                            ? t('panel.subtitleList.generateVoiceover', { credits: voiceoverCreditCost })
                            : t('panel.subtitleList.translateLanguageFirst')}
                  </button>

                  {!isOriginalLanguageSelected && isVoiceoverSupportedLanguage && !isVoiceoverEnabledByConfig && (
                    <div className="subtitle-tool-note subtitle-tool-warning">
                      {t('panel.subtitleList.voiceoverDisabledForLanguage', { language: selectedLanguageOption.label })}
                    </div>
                  )}

                  {!selectedLanguageOption.hasSubtitles && selectedLanguageOption.translatable && (
                    <div className="subtitle-tool-note subtitle-tool-warning">
                      {t('panel.subtitleList.languageSubtitlesUnavailable', { language: selectedLanguageOption.label })}
                    </div>
                  )}

                  {!isOriginalLanguageSelected && selectedLanguageOption.hasSubtitles && isVoiceoverSupportedLanguage && isVoiceoverEnabledByConfig && (
                    <div className="subtitle-tool-note">
                      {t('panel.subtitleList.voiceoverUsesDisplayLanguage', { language: selectedLanguageOption.label })}
                    </div>
                  )}

                  {isOriginalLanguageSelected && hasOriginalSubtitles && (
                    <div className="subtitle-tool-note subtitle-tool-warning">
                      {t('panel.subtitleList.voiceoverNeedsTranslatedLanguage')}
                    </div>
                  )}

                  {lastVoiceoverAudioName && (
                    <div className="subtitle-tool-note">
                      {t('panel.subtitleList.latestInternalAudio', { name: lastVoiceoverAudioName })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  // ── No subtitles or selected translation yet ──
  if (!hasVisibleSubs) {
    return (
      <div className="subtitle-panel-container dev-locator-host">
        <DeveloperLocator code={missingSelectedTranslation ? 'panel.subtitle.language-empty' : 'panel.subtitle.empty'} title="Subtitle Empty Panel" />
        {hasOriginalSubtitles && (
          <div className="subtitle-panel-header">
            <span className="subtitle-panel-title">{t('panel.subtitleList.subtitlesHeader', { language: selectedLanguageOption.label, count: 0 })}</span>
          </div>
        )}
        {toolsSection}
        <div className="subtitle-panel-empty-inner">
          <div className="empty-icon">📝</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {missingSelectedTranslation
              ? t('panel.subtitleList.noSubtitlesForLanguage', { language: selectedLanguageOption.label })
              : t('panel.subtitleList.noSubtitles')}
          </div>
          <div className="subtitle-empty-hint">
            {missingSelectedTranslation
              ? t('panel.subtitleList.translateToCreateLanguage')
              : t('panel.subtitleList.noSubtitlesHint')}
          </div>
        </div>
      </div>
    );
  }

  // ── Has subtitles ──
  return (
    <div className="subtitle-panel-container dev-locator-host">
      <DeveloperLocator code="panel.subtitle.list" title="Subtitle Panel" />
      <div className="subtitle-panel-header">
        <span className="subtitle-panel-title">{t('panel.subtitleList.subtitlesHeader', { language: selectedLanguageOption.label, count: subtitles.length })}</span>
      </div>

      {/* Collapsible tools */}
      {toolsSection}

      <div className="subtitle-panel-list" ref={listContainerRef}>
        <SubtitleCardList
          activeItemRef={activeItemRef}
          activeSubIndex={activeSubIndex}
          editingId={editingId}
          editingText={editingText}
          onDeleteSubtitle={handleDeleteSubtitle}
          onEditClick={handleEditClick}
          onEditingTextChange={setEditingText}
          onKeyDown={handleKeyDown}
          onSave={handleSave}
          onSeekToTime={onSeekToTime}
          subtitles={subtitles}
        />
      </div>
    </div>
  );
}
