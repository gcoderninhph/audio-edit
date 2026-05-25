import { createPortal } from 'react-dom';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';

function normalizePercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export default function ProcessingLockModal({
  ariaLabel,
  code,
  hint = '',
  locatorTitle,
  message = '',
  progressFill = '',
  progressPercent = 0,
  spinnerColor = '',
  title,
  zIndex = 180,
}) {
  if (typeof document === 'undefined') {
    return null;
  }

  const percent = normalizePercent(progressPercent);
  const fillStyle = progressFill
    ? { background: progressFill, width: `${percent}%` }
    : { width: `${percent}%` };
  const spinnerStyle = spinnerColor ? { borderTopColor: spinnerColor } : undefined;

  return createPortal(
    <div className="export-modal-layer processing-lock-modal dev-locator-host" style={{ zIndex }} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <DeveloperLocator code={code} title={locatorTitle} />
      <div className="processing-lock-dialog">
        <div className="detecting-spinner" style={spinnerStyle} />
        <div className="processing-lock-title">{title}</div>
        {message ? <div className="processing-lock-progress-text">{message}</div> : null}
        <div className="processing-lock-progress-bar">
          <div className="processing-lock-progress-fill" style={fillStyle} />
        </div>
        <div className="processing-lock-progress-text">{percent}%</div>
        {hint ? <div className="processing-lock-progress-text">{hint}</div> : null}
      </div>
    </div>,
    document.body,
  );
}