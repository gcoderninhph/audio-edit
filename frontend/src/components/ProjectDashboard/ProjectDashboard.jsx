import { useState, useEffect } from 'react';
import { deleteLocalProject, listLocalProjects } from '../../utils/projectStorage';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './ProjectDashboard.css';

function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function ProjectDashboard({ onOpenProject, onNewProject }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadProjects = async () => {
      try {
        const data = await listLocalProjects();
        if (!isCancelled) {
          setProjects(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProjects();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Xóa project này?')) return;
    try {
      await deleteLocalProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleNewProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) onNewProject(file);
    };
    input.click();
  };

  return (
    <div className="dashboard dev-locator-host">
      <DeveloperLocator code="dashboard.root" title="Project Dashboard" />
      <div className="dashboard-header dev-locator-host">
        <DeveloperLocator code="dashboard.header" title="Dashboard Header Section" />
        <div>
          <h1 className="dashboard-title gradient-text">Dự án của tôi</h1>
          <p className="dashboard-subtitle">Chọn một project để tiếp tục hoặc tạo mới</p>
        </div>
        <button className="btn btn-primary new-project-btn" onClick={handleNewProject}>
          <span className="new-project-icon">+</span>
          Tạo project mới
        </button>
      </div>

      {isLoading ? (
        <div className="dashboard-loading">
          <div className="detecting-spinner" />
          <div style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Đang tải danh sách...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="dashboard-empty">
          <div className="empty-icon-large">🎬</div>
          <h2>Chưa có project nào</h2>
          <p>Bắt đầu bằng cách tải lên một video</p>
          <button className="btn btn-primary" onClick={handleNewProject} style={{ marginTop: '16px' }}>
            + Tạo project đầu tiên
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {/* New project card */}
          <div className="project-card project-card-new dev-locator-host" onClick={handleNewProject}>
            <DeveloperLocator code="dashboard.project.new" title="New Project Card" />
            <div className="project-card-new-icon">+</div>
            <div className="project-card-new-label">Tạo mới</div>
          </div>

          {/* Existing projects */}
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-card dev-locator-host"
              onClick={() => onOpenProject(project.id)}
            >
              <DeveloperLocator
                code={`dashboard.project.${project.id}`}
                title="Saved Project Card"
                style={{ right: '42px' }}
              />
              <div className="project-card-thumb">
                <div className="project-card-play">▶</div>
              </div>
              <div className="project-card-info">
                <div className="project-card-name" title={project.video_original_name}>
                  {project.video_original_name || 'Untitled'}
                </div>
                <div className="project-card-date">
                  {formatDate(project.updated_at)}
                </div>
              </div>
              <button
                className="project-card-delete"
                onClick={(e) => handleDelete(e, project.id)}
                title="Xóa project"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
