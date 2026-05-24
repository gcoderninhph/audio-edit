import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import useSeriesExport from '../../hooks/useSeriesExport';
import SeriesExportModal from './SeriesExportModal';
import SeriesVideoPlayer from './SeriesVideoPlayer';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import { ProjectActionMenu } from './ProjectDashboardCards';
import { getProjectTitle, normalizeEpisodeNumber } from './projectDashboardModel';

function EpisodeNumberEditor({ initialValue, onCancel, onSave }) {
  const [value, setValue] = useState(String(initialValue || 1));

  return (
    <input
      className="series-episode-input"
      type="number"
      min="1"
      step="1"
      value={value}
      autoFocus
      onBlur={() => onSave(value)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSave(value);
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

export default function SeriesDetailView({
  hideWatermark = false,
  menuProjectId,
  menuPosition,
  onBack,
  onDeleteProject,
  onEditProject,
  onEpisodeNumberChange,
  onMenuToggle,
  onOpenProject,
  onSelectEpisode,
  selectedEpisodeId,
  series,
}) {
  const { t } = useI18n();
  const [editingEpisodeId, setEditingEpisodeId] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const selectedProject = series.projects.find((project) => project.id === selectedEpisodeId) || series.projects[0];
  const seriesExport = useSeriesExport(series.name, { hideWatermark });

  const handleEpisodeSave = (project, value) => {
    setEditingEpisodeId('');
    onEpisodeNumberChange(project, value);
  };

  const handleOpenExportModal = () => {
    seriesExport.resetExport();
    setIsExportModalOpen(true);
  };

  const handleCloseExportModal = () => {
    if (!seriesExport.isExporting) setIsExportModalOpen(false);
  };

  return (
    <div className="dashboard series-detail-view dev-locator-host">
      <DeveloperLocator code={`dashboard.series.${series.id}.detail`} title="Series Detail View" />
      <div className="dashboard-header series-detail-header">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={16} /> {t('dashboard.back')}</button>
          <h1 className="dashboard-title gradient-text">{series.name}</h1>
          <p className="dashboard-subtitle">{t('dashboard.episodes', { count: series.projects.length })}</p>
        </div>
        <div className="series-detail-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenExportModal}
            disabled={series.projects.length === 0}
          >
            <Download size={15} /> {t('dashboard.exportSeries')}
          </button>
        </div>
      </div>

      <div className="series-watch-layout">
        <section className="series-player-panel dev-locator-host">
          <DeveloperLocator code={`dashboard.series.${series.id}.player`} title="Series Player Panel" />
          <div className="series-video-frame">
            <SeriesVideoPlayer key={selectedProject?.id} project={selectedProject} hideWatermark={hideWatermark} />
          </div>
          <div className="series-player-meta">
            <div>
              <span>{t('dashboard.episode', { number: normalizeEpisodeNumber(selectedProject?.episode_number) || '-' })}</span>
              <h2>{getProjectTitle(selectedProject) || t('dashboard.untitledVideo')}</h2>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={!selectedProject} onClick={() => onOpenProject(selectedProject.id)}><ExternalLink size={16} /> {t('dashboard.openProject')}</button>
          </div>
        </section>

        <aside className="series-episode-panel dev-locator-host">
          <DeveloperLocator code={`dashboard.series.${series.id}.episodes`} title="Series Episode List" />
          {isExportModalOpen && (
            <SeriesExportModal
              series={series}
              qualityProfileId={seriesExport.qualityProfileId}
              onQualityProfileChange={seriesExport.setQualityProfileId}
              frameRate={seriesExport.frameRate}
              onFrameRateChange={seriesExport.setFrameRate}
              outputFileName={seriesExport.outputFileName}
              onOutputFileNameChange={seriesExport.setOutputFileName}
              outputDirectory={seriesExport.outputDirectory}
              onChooseDirectory={seriesExport.chooseDirectory}
              isExporting={seriesExport.isExporting}
              exportProgress={seriesExport.exportProgress}
              exportResult={seriesExport.exportResult}
              onExport={() => seriesExport.startSeriesExport(series.projects)}
              onClose={handleCloseExportModal}
            />
          )}
          {series.projects.map((project) => {
            const episodeNumber = normalizeEpisodeNumber(project.episode_number) || 1;
            const isSelected = project.id === selectedProject?.id;
            return (
              <article key={project.id} className={`series-episode-row dev-locator-host${isSelected ? ' active' : ''}`} onClick={() => onSelectEpisode(project.id)}>
                <DeveloperLocator code={`dashboard.series.${series.id}.episode.${project.id}`} title="Series Episode Row" />
                <button type="button" className="series-episode-thumb" onClick={() => onSelectEpisode(project.id)}>
                  {project.preview_url ? <video src={project.preview_url} muted preload="metadata" /> : <span />}
                </button>
                <div className="series-episode-main">
                  {editingEpisodeId === project.id ? (
                    <EpisodeNumberEditor initialValue={episodeNumber} onCancel={() => setEditingEpisodeId('')} onSave={(value) => handleEpisodeSave(project, value)} />
                  ) : (
                    <button type="button" className="series-episode-label" onDoubleClick={() => setEditingEpisodeId(project.id)}>{t('dashboard.episode', { number: episodeNumber })}</button>
                  )}
                  <strong title={getProjectTitle(project) || t('dashboard.untitledVideo')}>{getProjectTitle(project) || t('dashboard.untitledVideo')}</strong>
                </div>
                <ProjectActionMenu
                  isOpen={menuProjectId === project.id}
                  menuPosition={menuProjectId === project.id ? menuPosition : null}
                  onDelete={(event) => onDeleteProject(event, project)}
                  onEdit={(event) => onEditProject(event, project)}
                  onToggle={(event) => onMenuToggle(event, project.id)}
                />
              </article>
            );
          })}
        </aside>
      </div>
    </div>
  );
}