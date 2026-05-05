import { useState, useEffect, useRef, useMemo } from 'react';
import './SubtitlePanel.css';

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function SubtitlePanel({ subtitles, currentTime, onUpdateSubtitle, onSeekToTime }) {
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  // Find the currently active subtitle index based on currentTime
  const activeSubIndex = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return -1;
    // Find the last subtitle that starts before or exactly at currentTime
    for (let i = subtitles.length - 1; i >= 0; i--) {
      if (currentTime >= subtitles[i].start) {
        // If it's way past the end time, maybe it's just a gap, but we still highlight the closest one?
        // Let's only strictly highlight if we are within the range, else return the closest past one.
        if (currentTime <= subtitles[i].end) return i;
        // If there's a gap between subtitles, we can choose to highlight the last spoken one or none.
        return i; // Let's highlight the last spoken one for better tracking
      }
    }
    return 0; // If before first subtitle, highlight the first
  }, [subtitles, currentTime]);

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

  if (!subtitles || subtitles.length === 0) {
    return (
      <div className="subtitle-panel-empty">
        <div className="empty-icon">📝</div>
        <div>Chưa có phụ đề</div>
        <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '4px' }}>
          Hãy dùng chức năng "Tạo phụ đề tự động" bên tab Cảnh Video.
        </div>
      </div>
    );
  }

  return (
    <div className="subtitle-panel-container">
      <div className="subtitle-panel-header">
        <span className="subtitle-panel-title">Phụ đề ({subtitles.length} câu)</span>
      </div>
      
      <div className="subtitle-panel-list" ref={listRef}>
        {subtitles.map((sub, index) => {
          const isActive = index === activeSubIndex;
          const isEditing = editingId === sub.id;

          return (
            <div
              key={sub.id}
              ref={isActive ? activeItemRef : null}
              className={`subtitle-card ${isActive ? 'active' : ''}`}
            >
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
                    <div className="subtitle-edit-hint">Enter để lưu, Esc để hủy</div>
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
