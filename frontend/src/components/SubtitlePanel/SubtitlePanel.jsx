import { useState, useEffect, useRef, useMemo } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { DEFAULT_SUBTITLE_LANGUAGE_KEY, isVoiceoverSubtitleLanguageSupported } from '../../utils/subtitleTracks';
import './SubtitlePanel.css';

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function SubtitlePanel({
  subtitles,
  currentTime,
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
  onRequireAuth,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  const hasVisibleSubs = subtitles && subtitles.length > 0;
  const selectedLanguageOption = subtitleLanguageOptions?.find((option) => option.id === activeSubtitleLanguage)
    || subtitleLanguageOptions?.find((option) => option.id === DEFAULT_SUBTITLE_LANGUAGE_KEY)
    || { id: DEFAULT_SUBTITLE_LANGUAGE_KEY, label: 'Original', hasSubtitles: false, translatable: false };
  const hasOriginalSubtitles = Boolean(subtitleLanguageOptions?.find((option) => option.id === DEFAULT_SUBTITLE_LANGUAGE_KEY)?.hasSubtitles);
  const isOriginalLanguageSelected = selectedLanguageOption.id === DEFAULT_SUBTITLE_LANGUAGE_KEY;
  const canTranslateSelectedLanguage = hasOriginalSubtitles && selectedLanguageOption.translatable;
  const isVoiceoverSupportedLanguage = isVoiceoverSubtitleLanguageSupported(activeSubtitleLanguage);
  const canGenerateVoiceover = isVoiceoverSupportedLanguage && hasVisibleSubs;
  const authRequiredLabel = 'Login required';
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

  // Auto-scroll logic
  useEffect(() => {
    if (activeItemRef.current && !editingId) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeSubIndex, editingId]);

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
    onStartVoiceover?.();
  };

  // ── Transcribing / Translating progress screens ──
  if (isTranscribing) {
    return (
      <div className="subtitle-panel-container dev-locator-host">
        <DeveloperLocator code="panel.subtitle.transcribing" title="Subtitle Progress Panel" />
        <div className="subtitle-panel-progress">
          <div className="detecting-spinner" style={{ borderTopColor: '#10b981' }} />
          <div className="subtitle-progress-text">{transcribeProgress?.phase || 'Generating subtitles...'}</div>
          {transcribeProgress?.percent !== undefined && (
            <div className="progress-bar" style={{ width: '80%' }}>
              <div className="progress-bar-fill" style={{ width: `${transcribeProgress.percent}%`, background: '#10b981' }} />
            </div>
          )}
          <div className="subtitle-progress-hint">This may take a few minutes</div>
        </div>
      </div>
    );
  }

  if (isTranslating) {
    return (
      <div className="subtitle-panel-container dev-locator-host">
        <DeveloperLocator code="panel.subtitle.translating" title="Translation Progress Panel" />
        <div className="subtitle-panel-progress">
          <div className="detecting-spinner" style={{ borderTopColor: '#3b82f6' }} />
          <div className="subtitle-progress-text">{translateProgress?.phase || 'Translating subtitles...'}</div>
          {translateProgress?.percent !== undefined && (
            <div className="progress-bar" style={{ width: '80%' }}>
              <div className="progress-bar-fill" style={{ width: `${translateProgress.percent}%`, background: '#3b82f6' }} />
            </div>
          )}
          <div className="subtitle-progress-hint">The model is processing...</div>
        </div>
      </div>
    );
  }

  if (isGeneratingVoiceover) {
    return (
      <div className="subtitle-panel-container dev-locator-host">
        <DeveloperLocator code="panel.subtitle.voiceover" title="Voiceover Progress Panel" />
        <div className="subtitle-panel-progress">
          <div className="detecting-spinner" style={{ borderTopColor: '#f59e0b' }} />
          <div className="subtitle-progress-text">{voiceoverProgress?.phase || 'Generating voiceover...'}</div>
          {voiceoverProgress?.percent !== undefined && (
            <div className="progress-bar" style={{ width: '80%' }}>
              <div className="progress-bar-fill" style={{ width: `${voiceoverProgress.percent}%`, background: '#f59e0b' }} />
            </div>
          )}
          <div className="subtitle-progress-hint">Polling the service every 0.5 seconds</div>
        </div>
      </div>
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
          <span>🛠️ Subtitle tools</span>
          <span className={`toggle-arrow ${toolsExpanded ? 'open' : ''}`}>▼</span>
        </button>
      )}

      {/* Tools content */}
      {(showToolsAlways || toolsExpanded) && (
        <div className="subtitle-tools-content">
          <button
            className="btn btn-primary btn-sm subtitle-tool-btn"
            onClick={handleStartTranscription}
          >
            {!isAuthenticated ? authRequiredLabel : hasOriginalSubtitles ? '🔄 Recreate subtitles (original)' : '📝 Generate subtitles automatically'}
          </button>

          {hasOriginalSubtitles && (
            <>
              <div className="subtitle-language-row">
                <label className="subtitle-tools-label" htmlFor="subtitle-language-select">Display language</label>
                <div className="subtitle-input-button-group">
                  <select
                    id="subtitle-language-select"
                    value={activeSubtitleLanguage}
                    onChange={(event) => onActiveSubtitleLanguageChange?.(event.target.value)}
                    className="subtitle-lang-select subtitle-input-button-group-input"
                  >
                    {subtitleLanguageOptions?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}{option.translatable && !option.hasSubtitles ? ' (not translated)' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    className="btn btn-primary btn-sm subtitle-input-button-group-action"
                    style={{ background: '#3b82f6' }}
                    disabled={!canTranslateSelectedLanguage}
                    onClick={handleStartTranslation}
                  >
                    {!isAuthenticated ? authRequiredLabel : selectedLanguageOption.hasSubtitles ? '🌐 Retranslate' : '🌐 Translate'}
                  </button>
                </div>
              </div>

              <div className="subtitle-tool-note">
                Translation always starts from the original subtitle track, so the generated subtitles from the video are never overwritten.
              </div>

              {missingSelectedTranslation && (
                <div className="subtitle-tool-note subtitle-tool-warning">
                  {selectedLanguageOption.label} has not been translated yet. Press Translate to create that language from the original subtitles.
                </div>
              )}

              <button
                className="btn btn-primary btn-sm subtitle-tool-btn subtitle-voiceover-btn"
                style={{ background: '#f59e0b' }}
                onClick={handleStartVoiceover}
                disabled={!canGenerateVoiceover}
              >
                {!isAuthenticated ? authRequiredLabel : isVoiceoverSupportedLanguage ? '🔊 Generate voiceover' : '🔒 Voiceover only for Vietnamese'}
              </button>

              {!isVoiceoverSupportedLanguage && (
                <div className="subtitle-tool-note subtitle-tool-warning">
                  Voiceover is temporarily available only for Vietnamese subtitles. Switch Display language to Vietnamese to generate and show narration.
                </div>
              )}

              {lastVoiceoverAudioName && (
                <div className="subtitle-tool-note">
                  Latest internal audio: <strong>{lastVoiceoverAudioName}</strong> • stored in the project and attached to the timeline from 00:00
                </div>
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
            <span className="subtitle-panel-title">Subtitles ({selectedLanguageOption.label} · 0 lines)</span>
          </div>
        )}
        {toolsSection}
        <div className="subtitle-panel-empty-inner">
          <div className="empty-icon">📝</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {missingSelectedTranslation ? `No ${selectedLanguageOption.label} subtitles saved yet` : 'No subtitles yet'}
          </div>
          <div className="subtitle-empty-hint">
            {missingSelectedTranslation
              ? 'Choose Translate to create this language from the original subtitle track.'
              : 'Generate subtitles automatically from the audio with AI.'}
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
        <span className="subtitle-panel-title">Subtitles ({selectedLanguageOption.label} · {subtitles.length} lines)</span>
      </div>

      {/* Collapsible tools */}
      {toolsSection}

      <div className="subtitle-panel-list" ref={listRef}>
        {subtitles.map((sub, index) => {
          const isActive = index === activeSubIndex;
          const isEditing = editingId === sub.id;

          return (
            <div
              key={sub.id}
              ref={isActive ? activeItemRef : null}
              className={`subtitle-card dev-locator-host ${isActive ? 'active' : ''}`}
            >
              <DeveloperLocator code={`subtitle.card.${sub.id}`} title="Subtitle Card" />
              <div
                className="subtitle-card-time"
                onClick={() => onSeekToTime?.(sub.start)}
              >
                {formatTime(sub.start)}
              </div>

              <div className="subtitle-card-content">
                {isEditing ? (
                  <div className="subtitle-edit-mode">
                    <textarea
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, sub.id)}
                      onBlur={() => handleSave(sub.id)}
                      className="subtitle-textarea"
                      rows={2}
                    />
                    <div className="subtitle-edit-hint">Press Enter to save, Esc to cancel</div>
                  </div>
                ) : (
                  <div
                    className="subtitle-text"
                    onClick={() => handleEditClick(sub)}
                  >
                    {sub.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
