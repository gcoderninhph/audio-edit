import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { deleteLocalProject, listLocalProjects, saveLocalProject } from '../../utils/projectStorage';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import { isPremiumActiveForUser } from '../../utils/authClient';
import { NewProjectCard, ProjectCard, SeriesCard } from './ProjectDashboardCards';
import { CreateSeriesDialog, ProjectInfoDialog } from './ProjectDashboardDialogs';
import SeriesDetailView from './SeriesDetailView';
import {
  applyProjectInfo,
  buildSeriesGroups,
  buildSeriesId,
  getProjectTitle,
  getStandaloneProjects,
  normalizeEpisodeNumber,
  sortProjectsByCreated,
} from './projectDashboardModel';
import './ProjectDashboard.css';

export default function ProjectDashboard({
  auth,
  onOpenProject,
  onNewProject,
  onSeriesContextChange,
  selectedEpisodeId: selectedEpisodeIdProp = '',
  selectedSeriesId: selectedSeriesIdProp = '',
}) {
  const { locale, t } = useI18n();
  const [projects, setProjects] = useState([]);
  const [isCreateSeriesOpen, setIsCreateSeriesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [menuProjectId, setMenuProjectId] = useState('');
  const [menuPosition, setMenuPosition] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(selectedEpisodeIdProp);
  const [selectedSeriesId, setSelectedSeriesId] = useState(selectedSeriesIdProp);
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    let isCancelled = false;

    const loadProjects = async () => {
      try {
        const data = await listLocalProjects();
        if (!isCancelled) setProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadProjects();
    return () => {
      isCancelled = true;
    };
  }, []);

  const seriesGroups = useMemo(() => buildSeriesGroups(projects), [projects]);
  const standaloneProjects = useMemo(
    () => sortProjectsByCreated(getStandaloneProjects(projects), sortOrder),
    [projects, sortOrder],
  );
  const selectedSeries = useMemo(
    () => seriesGroups.find((group) => group.id === selectedSeriesId) || null,
    [selectedSeriesId, seriesGroups],
  );
  const hideWatermark = isPremiumActiveForUser(auth?.user);

  const syncSeriesContext = useCallback((nextSeriesId, nextEpisodeId) => {
    const normalizedSeriesId = String(nextSeriesId || '');
    const normalizedEpisodeId = String(nextEpisodeId || '');
    setSelectedSeriesId(normalizedSeriesId);
    setSelectedEpisodeId(normalizedEpisodeId);
    onSeriesContextChange?.({
      selectedEpisodeId: normalizedEpisodeId,
      selectedSeriesId: normalizedSeriesId,
    });
  }, [onSeriesContextChange]);

  const handleNewProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (event) => {
      const file = event.target.files[0];
      if (file) onNewProject(file);
    };
    input.click();
  };

  const handleMenuToggle = (event, projectId) => {
    event.stopPropagation();
    if (menuProjectId === projectId) {
      setMenuProjectId('');
      setMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 152;
    const menuHeight = 92;
    const margin = 10;
    const topBelow = rect.bottom + 6;
    const top = topBelow + menuHeight > window.innerHeight - margin
      ? Math.max(margin, rect.top - menuHeight - 6)
      : topBelow;
    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      window.innerWidth - menuWidth - margin,
    );
    setMenuProjectId(projectId);
    setMenuPosition({ left, top });
  };

  const handleEditProject = (event, project) => {
    event.stopPropagation();
    setMenuProjectId('');
    setMenuPosition(null);
    setEditingProject(project);
  };

  const handleDeleteProject = async (event, project) => {
    event.stopPropagation();
    setMenuProjectId('');
    setMenuPosition(null);
    const projectTitle = getProjectTitle(project) || t('dashboard.untitledVideo');
    if (!confirm(t('dashboard.deleteProjectConfirm', { title: projectTitle }))) return;
    try {
      await deleteLocalProject(project.id);
      setProjects((currentProjects) => currentProjects.filter((item) => item.id !== project.id));
      if (selectedEpisodeId === project.id) setSelectedEpisodeId('');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const saveProjectInfo = useCallback(async (project, updates) => {
    const nextProject = applyProjectInfo(project, updates);
    await saveLocalProject({
      episodeNumber: nextProject.episode_number,
      sessionId: project.id,
      videoOriginalName: nextProject.video_original_name,
      videoSeriesId: nextProject.series_id,
      videoSeriesName: nextProject.series_name,
    });
    setProjects((currentProjects) => currentProjects.map((item) => (item.id === project.id ? nextProject : item)));
  }, []);

  const handleSaveProjectInfo = async (updates) => {
    if (!editingProject) return;
    try {
      await saveProjectInfo(editingProject, updates);
      setEditingProject(null);
    } catch (err) {
      console.error('Save project info failed:', err);
    }
  };

  const handleCreateSeries = async ({ projectIds, seriesName }) => {
    const seriesId = buildSeriesId(seriesName);
    const selectedProjects = standaloneProjects.filter((project) => projectIds.includes(project.id));
    if (!seriesId || selectedProjects.length === 0) return;
    try {
      await Promise.all(selectedProjects.map((project, index) => saveProjectInfo(project, {
        episodeNumber: index + 1,
        seriesId,
        seriesName,
        title: getProjectTitle(project),
      })));
      setIsCreateSeriesOpen(false);
      syncSeriesContext(seriesId, selectedProjects[0]?.id || '');
    } catch (err) {
      console.error('Create series failed:', err);
    }
  };

  const handleOpenSeries = (group) => {
    syncSeriesContext(group.id, group.projects[0]?.id || '');
  };

  const handleEpisodeNumberChange = async (project, value) => {
    try {
      await saveProjectInfo(project, {
        episodeNumber: normalizeEpisodeNumber(value) || 1,
        seriesId: project.series_id,
        seriesName: project.series_name,
        title: getProjectTitle(project),
      });
    } catch (err) {
      console.error('Episode update failed:', err);
    }
  };

  if (selectedSeries) {
    return (
      <>
        <SeriesDetailView
          hideWatermark={hideWatermark}
          menuPosition={menuPosition}
          menuProjectId={menuProjectId}
          onBack={() => syncSeriesContext('', '')}
          onDeleteProject={handleDeleteProject}
          onEditProject={handleEditProject}
          onEpisodeNumberChange={handleEpisodeNumberChange}
          onMenuToggle={handleMenuToggle}
          onOpenProject={(projectId) => onOpenProject(projectId, {
            selectedEpisodeId: projectId,
            selectedSeriesId,
          })}
          onSelectEpisode={(projectId) => syncSeriesContext(selectedSeriesId, projectId)}
          selectedEpisodeId={selectedEpisodeId}
          series={selectedSeries}
        />
        {editingProject && <ProjectInfoDialog onClose={() => setEditingProject(null)} onSave={handleSaveProjectInfo} project={editingProject} seriesGroups={seriesGroups} />}
      </>
    );
  }

  return (
    <div className="dashboard dev-locator-host">
      <DeveloperLocator code="dashboard.root" title="Project Dashboard" />
      <div className="dashboard-header dev-locator-host">
        <DeveloperLocator code="dashboard.header" title="Dashboard Header Section" />
        <div>
          <h1 className="dashboard-title gradient-text">{t('dashboard.title')}</h1>
          <p className="dashboard-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dashboard-actions">
          <div className="dashboard-sort dev-locator-host">
            <DeveloperLocator code="dashboard.sort" title="Dashboard Sort Control" />
            <label className="dashboard-sort-label" htmlFor="dashboard-sort-select">{t('dashboard.sort')}</label>
            <select id="dashboard-sort-select" className="dashboard-sort-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="newest">{t('dashboard.newestFirst')}</option>
              <option value="oldest">{t('dashboard.oldestFirst')}</option>
            </select>
          </div>
          <button className="btn btn-primary new-project-btn" onClick={handleNewProject}><span className="new-project-icon">+</span> {t('dashboard.newProject')}</button>
        </div>
      </div>

      {isLoading ? (
        <div className="dashboard-loading"><div className="detecting-spinner" /><div>{t('dashboard.loadingProjects')}</div></div>
      ) : projects.length === 0 ? (
        <div className="dashboard-empty"><h2>{t('dashboard.noProjects')}</h2><p>{t('dashboard.startUploading')}</p><button className="btn btn-primary" onClick={handleNewProject}>+ {t('dashboard.createFirstProject')}</button></div>
      ) : (
        <>
          <section className="dashboard-section dev-locator-host">
            <DeveloperLocator code="dashboard.series.list" title="Dashboard Series List" />
            <div className="dashboard-section-header">
              <div><h2>{t('dashboard.series')}</h2><span>{t('dashboard.groups', { count: seriesGroups.length })}</span></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsCreateSeriesOpen(true)} disabled={standaloneProjects.length === 0}><FolderPlus size={16} /> {t('dashboard.newSeries')}</button>
            </div>
            {seriesGroups.length > 0 ? (
              <div className="series-grid">{seriesGroups.map((group) => <SeriesCard key={group.id} group={group} onOpen={() => handleOpenSeries(group)} />)}</div>
            ) : <div className="dashboard-section-empty">{t('dashboard.noSeries')}</div>}
          </section>

          <section className="dashboard-section dev-locator-host">
            <DeveloperLocator code="dashboard.videos.list" title="Dashboard Standalone Videos List" />
            <div className="dashboard-section-header"><div><h2>{t('dashboard.standaloneVideos')}</h2><span>{t('dashboard.videos', { count: standaloneProjects.length })}</span></div></div>
            <div className="project-grid">
              <NewProjectCard onClick={handleNewProject} />
              {standaloneProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  isMenuOpen={menuProjectId === project.id}
                  locale={locale}
                  menuPosition={menuProjectId === project.id ? menuPosition : null}
                  onDelete={(event) => handleDeleteProject(event, project)}
                  onEdit={(event) => handleEditProject(event, project)}
                  onMenuToggle={(event) => handleMenuToggle(event, project.id)}
                  onOpen={() => onOpenProject(project.id, {
                    selectedEpisodeId: '',
                    selectedSeriesId: '',
                  })}
                  project={project}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {editingProject && <ProjectInfoDialog onClose={() => setEditingProject(null)} onSave={handleSaveProjectInfo} project={editingProject} seriesGroups={seriesGroups} />}
      {isCreateSeriesOpen && <CreateSeriesDialog onClose={() => setIsCreateSeriesOpen(false)} onCreate={handleCreateSeries} standaloneProjects={standaloneProjects} />}
    </div>
  );
}