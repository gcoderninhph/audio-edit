import { Trash2 } from 'lucide-react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function SubtitleCardList({
  activeItemRef,
  activeSubIndex,
  editingId,
  editingText,
  onDeleteSubtitle,
  onEditClick,
  onEditingTextChange,
  onKeyDown,
  onSave,
  onSeekToTime,
  subtitles,
}) {
  const { t } = useI18n();

  return subtitles.map((sub, index) => {
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
                onChange={(event) => onEditingTextChange(event.target.value)}
                onKeyDown={(event) => onKeyDown(event, sub.id)}
                onBlur={() => onSave(sub.id)}
                className="subtitle-textarea"
                rows={2}
              />
              <div className="subtitle-edit-hint">{t('panel.subtitleList.editHint')}</div>
            </div>
          ) : (
            <div
              className="subtitle-text"
              onClick={() => onEditClick(sub)}
            >
              {sub.text}
            </div>
          )}
        </div>

        <div className="subtitle-card-actions">
          <button
            type="button"
            className="subtitle-card-delete-button"
            aria-label={t('panel.subtitleList.deleteSubtitleAria', { time: formatTime(sub.start) })}
            title={t('panel.subtitleList.deleteSubtitleTitle')}
            onClick={() => onDeleteSubtitle?.(sub.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  });
}
