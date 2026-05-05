import { useState, useEffect, useCallback } from 'react';
import './ExportPanel.css';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const PHASE_LABELS = {
  loading: '⏳ Đang tải engine xử lý video...',
  preparing: '📦 Đang chuẩn bị file...',
  cutting: '✂️ Đang cắt cảnh...',
  merging: '🔗 Đang ghép video...',
  reading: '📖 Đang đọc kết quả...',
  done: '✅ Hoàn thành!',
};

export default function ExportPanel({
  scenes,
  keptScenes,
  keptDuration,
  deletedSceneIds,
  isExporting,
  exportProgress,
  exportUrl,
  exportSize,
  videoName,
  onExport,
  onSaveSession,
  onLoadHistoryList,
  onLoadSession,
  onDeleteSession,
  historyList,
}) {
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const hasScenes = scenes && scenes.length > 0;
  const hasDeletedScenes = deletedSceneIds && deletedSceneIds.size > 0;
  const canExport = hasScenes && keptScenes.length > 0;

  const handleExport = () => {
    if (canExport) onExport();
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaveStatus('saving');
    const result = await onSaveSession(saveName.trim());
    if (result) {
      setSaveStatus('saved');
      setShowSave(false);
      setSaveName('');
      setTimeout(() => setSaveStatus(''), 2000);
    } else {
      setSaveStatus('error');
    }
  };

  const handleToggleHistory = useCallback(async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) {
      await onLoadHistoryList();
    }
  }, [showHistory, onLoadHistoryList]);

  const handleDownload = () => {
    if (!exportUrl) return;
    const a = document.createElement('a');
    a.href = exportUrl;
    const baseName = videoName ? videoName.replace(/\.[^.]+$/, '') : 'output';
    a.download = `${baseName}_edited.mp4`;
    a.click();
  };

  if (!hasScenes) return null;

  return (
    <div className="export-panel" id="export-panel">
      <div className="export-panel-header">
        <div>
          <div className="export-panel-title">Export Video</div>
          {hasScenes && (
            <div className="export-panel-info">
              {keptScenes.length}/{scenes.length} cảnh • {formatTime(keptDuration)}
              {hasDeletedScenes && ` • ${deletedSceneIds.size} cảnh bị xóa`}
            </div>
          )}
        </div>
        <div className="export-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSave(!showSave)}
            title="Lưu lịch sử"
          >
            💾 Lưu session
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleToggleHistory}
            title="Xem lịch sử"
          >
            📋 Lịch sử
          </button>
          <button
            className="btn btn-primary export-btn"
            onClick={handleExport}
            disabled={!canExport || isExporting}
            id="export-btn"
          >
            {isExporting ? '⏳ Đang xử lý...' : '🎬 Export Video'}
          </button>
        </div>
      </div>

      {/* Save dialog */}
      {showSave && (
        <div className="save-dialog">
          <input
            type="text"
            className="save-input"
            placeholder="Tên session (VD: Edit lần 1)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!saveName.trim()}>
            {saveStatus === 'saving' ? '...' : 'Lưu'}
          </button>
        </div>
      )}
      {saveStatus === 'saved' && (
        <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '6px' }}>
          ✅ Đã lưu thành công!
        </div>
      )}

      {/* Export Progress */}
      {isExporting && (
        <div className="export-progress">
          <div className="export-progress-phase">
            {PHASE_LABELS[exportProgress.phase] || exportProgress.phase}
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${exportProgress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Export Result */}
      {exportUrl && !isExporting && (
        <div className="export-result">
          <div className="export-result-info">
            <div className="export-result-icon">✅</div>
            <div>
              <div className="export-result-text">Video đã sẵn sàng!</div>
              <div className="export-result-size">{formatFileSize(exportSize)}</div>
            </div>
          </div>
          <button className="download-btn" onClick={handleDownload} id="download-btn">
            📥 Tải xuống
          </button>
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="history-section">
          <div className="history-title">
            <span>📋 Lịch sử chỉnh sửa</span>
            <button className="btn btn-ghost btn-sm" onClick={onLoadHistoryList}>🔄</button>
          </div>
          {historyList && historyList.length > 0 ? (
            <div className="history-list">
              {historyList.map((item) => (
                <div key={item.id} className="history-item">
                  <div onClick={() => onLoadSession(item.id)} style={{ flex: 1 }}>
                    <div className="history-item-name">{item.name}</div>
                    <div className="history-item-date">
                      {item.video_name} • {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : ''}
                    </div>
                  </div>
                  <div className="history-item-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onLoadSession(item.id)}
                      title="Tải session"
                    >
                      📂
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => onDeleteSession(item.id)}
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
              Chưa có lịch sử
            </div>
          )}
        </div>
      )}
    </div>
  );
}
