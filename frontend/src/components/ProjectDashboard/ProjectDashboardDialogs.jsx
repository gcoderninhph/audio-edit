import { useMemo, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import {
  buildSeriesId,
  getNextEpisodeNumber,
  getProjectTitle,
  normalizeEpisodeNumber,
  normalizeSeriesName,
  SERIES_NEW_VALUE,
  SERIES_NONE_VALUE,
} from './projectDashboardModel';

export function ProjectInfoDialog({ onClose, onSave, project, seriesGroups }) {
  const { t } = useI18n();
  const currentSeriesId = project?.series_id || SERIES_NONE_VALUE;
  const [episodeNumber, setEpisodeNumber] = useState(String(normalizeEpisodeNumber(project?.episode_number) || 1));
  const [newSeriesName, setNewSeriesName] = useState('');
  const [selectedSeriesId, setSelectedSeriesId] = useState(currentSeriesId);
  const [title, setTitle] = useState(getProjectTitle(project));
  const selectedSeries = seriesGroups.find((group) => group.id === selectedSeriesId);
  const isSeriesSelected = selectedSeriesId !== SERIES_NONE_VALUE;
  const isNewSeries = selectedSeriesId === SERIES_NEW_VALUE;
  const defaultTitle = getProjectTitle(project) || t('dashboard.untitledVideo');

  const resolvedEpisodeNumber = useMemo(() => {
    const normalizedEpisode = normalizeEpisodeNumber(episodeNumber);
    if (normalizedEpisode) return normalizedEpisode;
    if (selectedSeriesId === currentSeriesId) return normalizeEpisodeNumber(project?.episode_number) || 1;
    return getNextEpisodeNumber(seriesGroups, selectedSeriesId, project?.id);
  }, [currentSeriesId, episodeNumber, project?.episode_number, project?.id, selectedSeriesId, seriesGroups]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const cleanTitle = title.trim() || defaultTitle;
    if (selectedSeriesId === SERIES_NONE_VALUE) {
      onSave({ episodeNumber: 0, seriesId: '', seriesName: '', title: cleanTitle });
      return;
    }
    const seriesName = isNewSeries ? normalizeSeriesName(newSeriesName) : selectedSeries?.name || '';
    const seriesId = isNewSeries ? buildSeriesId(seriesName) : selectedSeries?.id || '';
    if (!seriesId || !seriesName) return;
    onSave({ episodeNumber: resolvedEpisodeNumber, seriesId, seriesName, title: cleanTitle });
  };

  const handleSeriesChange = (value) => {
    setSelectedSeriesId(value);
    if (value !== SERIES_NONE_VALUE && value !== currentSeriesId) {
      const nextEpisodeNumber = value === SERIES_NEW_VALUE ? 1 : getNextEpisodeNumber(seriesGroups, value, project?.id);
      setEpisodeNumber(String(nextEpisodeNumber));
    }
  };

  return (
    <div className="dashboard-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dashboard-dialog dev-locator-host" onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <DeveloperLocator code="dashboard.project.edit-dialog" title="Project Info Dialog" />
        <div className="dashboard-dialog-heading">
          <p>{t('dashboard.videoInfo')}</p>
          <h2>{t('dashboard.editVideo')}</h2>
        </div>
        <label className="dashboard-field">
          <span>{t('dashboard.videoName')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label className="dashboard-field">
          <span>{t('dashboard.seriesField')}</span>
          <select value={selectedSeriesId} onChange={(event) => handleSeriesChange(event.target.value)}>
            <option value={SERIES_NONE_VALUE}>{t('dashboard.none')}</option>
            {seriesGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            <option value={SERIES_NEW_VALUE}>{t('dashboard.newSeries')}</option>
          </select>
        </label>
        {isNewSeries && (
          <label className="dashboard-field">
            <span>{t('dashboard.seriesName')}</span>
            <input value={newSeriesName} onChange={(event) => setNewSeriesName(event.target.value)} />
          </label>
        )}
        {isSeriesSelected && (
          <label className="dashboard-field">
            <span>{t('dashboard.episodeField')}</span>
            <input type="number" min="1" step="1" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} />
          </label>
        )}
        <div className="dashboard-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('dashboard.cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('dashboard.save')}</button>
        </div>
      </form>
    </div>
  );
}

export function CreateSeriesDialog({ onClose, onCreate, standaloneProjects }) {
  const { t } = useI18n();
  const [seriesName, setSeriesName] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set(standaloneProjects.map((project) => project.id)));
  const canCreate = normalizeSeriesName(seriesName) && selectedIds.size > 0;

  const toggleProject = (projectId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onCreate({ projectIds: Array.from(selectedIds), seriesName: normalizeSeriesName(seriesName) });
  };

  return (
    <div className="dashboard-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dashboard-dialog dev-locator-host" onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <DeveloperLocator code="dashboard.series.create-dialog" title="Create Series Dialog" />
        <div className="dashboard-dialog-heading">
          <p>{t('dashboard.series')}</p>
          <h2>{t('dashboard.createSeriesTitle')}</h2>
        </div>
        <label className="dashboard-field">
          <span>{t('dashboard.seriesName')}</span>
          <input value={seriesName} onChange={(event) => setSeriesName(event.target.value)} autoFocus />
        </label>
        <div className="dashboard-video-checklist">
          {standaloneProjects.map((project) => (
            <label key={project.id} className="dashboard-video-check">
              <input type="checkbox" checked={selectedIds.has(project.id)} onChange={() => toggleProject(project.id)} />
              <span>{getProjectTitle(project)}</span>
            </label>
          ))}
        </div>
        <div className="dashboard-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('dashboard.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={!canCreate}>{t('dashboard.create')}</button>
        </div>
      </form>
    </div>
  );
}