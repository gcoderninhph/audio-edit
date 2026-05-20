export const SERIES_NONE_VALUE = '__none__';
export const SERIES_NEW_VALUE = '__new__';

export function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getProjectCreatedTime(project) {
  return Date.parse(project?.created_at || project?.updated_at || 0) || 0;
}

export function getProjectTitle(project) {
  return String(project?.video_original_name || '').trim() || 'Untitled video';
}

export function normalizeSeriesName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function buildSeriesId(name) {
  const normalizedName = normalizeSeriesName(name).toLowerCase();
  const slug = normalizedName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `series-${slug}` : '';
}

export function normalizeEpisodeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : 0;
}

export function getProjectSeries(project) {
  const seriesName = normalizeSeriesName(project?.series_name);
  const seriesId = String(project?.series_id || '').trim() || buildSeriesId(seriesName);
  if (!seriesId || !seriesName) {
    return null;
  }
  return { id: seriesId, name: seriesName };
}

export function sortProjectsByCreated(projects, sortOrder = 'newest') {
  const nextProjects = [...projects];
  nextProjects.sort((left, right) => {
    const delta = getProjectCreatedTime(right) - getProjectCreatedTime(left);
    return sortOrder === 'oldest' ? -delta : delta;
  });
  return nextProjects;
}

export function sortEpisodes(projects) {
  return [...projects].sort((left, right) => {
    const leftEpisode = normalizeEpisodeNumber(left.episode_number) || Number.MAX_SAFE_INTEGER;
    const rightEpisode = normalizeEpisodeNumber(right.episode_number) || Number.MAX_SAFE_INTEGER;
    return leftEpisode - rightEpisode || getProjectCreatedTime(left) - getProjectCreatedTime(right);
  });
}

export function buildSeriesGroups(projects) {
  const groupsById = new Map();
  for (const project of projects) {
    const series = getProjectSeries(project);
    if (!series) continue;
    if (!groupsById.has(series.id)) {
      groupsById.set(series.id, { id: series.id, name: series.name, projects: [] });
    }
    groupsById.get(series.id).projects.push(project);
  }
  return Array.from(groupsById.values())
    .map((group) => ({ ...group, projects: sortEpisodes(group.projects) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getStandaloneProjects(projects) {
  return projects.filter((project) => !getProjectSeries(project));
}

export function getNextEpisodeNumber(seriesGroups, seriesId, excludeProjectId = '') {
  const series = seriesGroups.find((group) => group.id === seriesId);
  if (!series) return 1;
  const episodeNumbers = series.projects
    .filter((project) => project.id !== excludeProjectId)
    .map((project) => normalizeEpisodeNumber(project.episode_number))
    .filter(Boolean);
  return episodeNumbers.length ? Math.max(...episodeNumbers) + 1 : 1;
}

export function applyProjectInfo(project, updates) {
  return {
    ...project,
    episode_number: normalizeEpisodeNumber(updates.episodeNumber),
    series_id: updates.seriesId || '',
    series_name: updates.seriesName || '',
    updated_at: new Date().toISOString(),
    video_original_name: updates.title || getProjectTitle(project),
  };
}