const STORAGE_KEY = 'recentProjects';
const MAX_TRACKED = 20;

type RecentProjectsMap = Record<string, number>;

const readMap = (): RecentProjectsMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/** Records a visit to the given project as the most recent, trimming the tracked list to MAX_TRACKED entries. */
export const recordProjectVisit = (projectId: string) => {
  try {
    const map = readMap();
    map[projectId] = Date.now();
    const trimmedEntries = Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_TRACKED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmedEntries)));
  } catch {
    // localStorage unavailable (private mode, etc.) — recent list just stays empty
  }
};

/** Returns project IDs ordered most-recently-visited first. */
export const getRecentProjectIds = (): string[] =>
  Object.entries(readMap())
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
