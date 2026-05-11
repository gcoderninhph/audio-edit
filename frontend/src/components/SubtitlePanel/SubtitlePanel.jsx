import { useState, useEffect, useRef, useMemo } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
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
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  const hasSubs = subtitles && subtitles.length > 0;

  // Find the currently active subtitle index based on currentTime
  const activeSubIndex = useMemo(() => {
    if (!hasSubs) return -1;
    for (let i = subtitles.length - 1; i >= 0; i--) {
      if (currentTime >= subtitles[i].start) {
        if (currentTime <= subtitles[i].end) return i;
        return i;
      }
    }
    return 0;
  }, [subtitles, currentTime, hasSubs]);

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
  const showToolsAlways = !hasSubs; // Always show when no subs exist

  const toolsSection = (
    <div className={`subtitle-tools ${showToolsAlways || toolsExpanded ? 'expanded' : ''}`}>
      {/* Header toggle (only when subs exist) */}
      {hasSubs && (
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
            onClick={onStartTranscription}
          >
            {hasSubs ? '🔄 Recreate subtitles (original)' : '📝 Generate subtitles automatically'}
          </button>

          {hasSubs && (
            <>
              <div className="subtitle-translate-row">
                <select
                  value={targetLang}
                  onChange={e => setTargetLang(e.target.value)}
                  className="subtitle-lang-select"
                >
                  <option value="Vietnamese">Vietnamese</option>
                  <option value="English">English</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                  <option value="Chinese">Chinese</option>
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: '#3b82f6' }}
                  onClick={() => onStartTranslation(targetLang)}
                >
                  🌐 Translate
                </button>
              </div>

              <button
                className="btn btn-primary btn-sm subtitle-tool-btn subtitle-voiceover-btn"
                style={{ background: '#f59e0b' }}
                onClick={onStartVoiceover}
              >
                🔊 Generate voiceover
              </button>

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

  // ── No subtitles yet ──
  if (!hasSubs) {
    return (
      <div className="subtitle-panel-container dev-locator-host">
        <DeveloperLocator code="panel.subtitle.empty" title="Subtitle Empty Panel" />
        <div className="subtitle-panel-empty-inner">
          <div className="empty-icon">📝</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>No subtitles yet</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '16px' }}>
            Generate subtitles automatically from the audio with AI
          </div>
          {toolsSection}
        </div>
      </div>
    );
  }

  // ── Has subtitles ──
  return (
    <div className="subtitle-panel-container dev-locator-host">
      <DeveloperLocator code="panel.subtitle.list" title="Subtitle Panel" />
      <div className="subtitle-panel-header">
        <span className="subtitle-panel-title">Subtitles ({subtitles.length} lines)</span>
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
