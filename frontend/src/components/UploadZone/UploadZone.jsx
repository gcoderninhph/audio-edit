import { useState, useRef, useCallback } from 'react';
import './UploadZone.css';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export default function UploadZone({ onFileSelect, selectedFile }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (file && file.type.startsWith('video/')) {
      onFileSelect(file);
    } else {
      alert('Vui lòng chọn file video hợp lệ');
    }
  }, [onFileSelect]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        id="upload-zone"
      >
        <div className="upload-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h3 className="upload-title">Kéo & thả video vào đây</h3>
        <p className="upload-subtitle">hoặc click để chọn file từ máy tính</p>
        <div className="upload-formats">
          <span>MP4</span>
          <span>WebM</span>
          <span>MOV</span>
          <span>AVI</span>
          <span>MKV</span>
        </div>

        {selectedFile && (
          <div className="file-info" onClick={(e) => e.stopPropagation()}>
            <div className="file-info-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="file-info-details">
              <div className="file-info-name">{selectedFile.name}</div>
              <div className="file-info-size">{formatFileSize(selectedFile.size)}</div>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="upload-input"
          onChange={handleInputChange}
          id="video-file-input"
        />
      </div>
    </div>
  );
}
