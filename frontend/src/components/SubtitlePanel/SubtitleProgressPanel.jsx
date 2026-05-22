import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';

export default function SubtitleProgressPanel({
  code,
  title,
  color,
  phase,
  percent,
  hint,
}) {
  return (
    <div className="subtitle-panel-container dev-locator-host">
      <DeveloperLocator code={code} title={title} />
      <div className="subtitle-panel-progress">
        <div className="detecting-spinner" style={{ borderTopColor: color }} />
        <div className="subtitle-progress-text">{phase}</div>
        {percent !== undefined && (
          <div className="progress-bar" style={{ width: '80%' }}>
            <div className="progress-bar-fill" style={{ width: `${percent}%`, background: color }} />
          </div>
        )}
        <div className="subtitle-progress-hint">{hint}</div>
      </div>
    </div>
  );
}