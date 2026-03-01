export type Project = {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
  description?: string;
};

const STORAGE_KEY = "golb-recent-projects";

export function getRecentProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

export function addRecentProject(project: Omit<Project, "id" | "lastOpened">): Project[] {
  const projects = getRecentProjects();
  const existing = projects.findIndex((p) => p.path === project.path);

  const entry: Project = {
    id: crypto.randomUUID(),
    lastOpened: new Date().toISOString(),
    ...project,
  };

  if (existing !== -1) {
    projects[existing] = { ...projects[existing], lastOpened: entry.lastOpened };
  } else {
    projects.unshift(entry);
  }

  const sorted = projects.sort(
    (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

export function removeRecentProject(path: string): Project[] {
  const projects = getRecentProjects().filter((p) => p.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  return projects;
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
