// Zugriff auf die REST-Schnittstelle des Servers.
import type { Access, Conflict, Library, MasterEntry, MasterKind, Project, Resolution, Template } from '@steckplan/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, url: string, body?: unknown, raw = false): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = raw ? (body as string) : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? `Fehler ${res.status}`;
    throw new ApiError(res.status, message, (data ?? {}) as Record<string, unknown>);
  }
  return data as T;
}

export interface SessionInfo {
  name: string;
  access: Access;
  via: 'desktop' | 'browser' | 'desktopKey';
}

export interface ProjectSummary {
  id: string;
  name: string;
  venue: string;
  date: string;
  updatedAt: string;
  path?: string;
  readOnlyReason?: string;
}

export interface TrashEntry {
  trashId: string;
  projectId: string;
  name: string;
  deletedAt: string;
}

export interface VersionInfo {
  id: string;
  at: string;
  by: string[];
  note?: string;
}

export const api = {
  async session(): Promise<{ session: SessionInfo | null; loginAvailable: boolean }> {
    try {
      return { session: await request<SessionInfo>('GET', '/api/auth/session'), loginAvailable: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const res = await fetch('/api/auth/session');
        const data = (await res.json().catch(() => ({}))) as { loginAvailable?: boolean };
        return { session: null, loginAvailable: data.loginAvailable ?? false };
      }
      throw error;
    }
  },
  login: (name: string, password: string) => request<SessionInfo>('POST', '/api/auth/login', { name, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  listProjects: () => request<{ projects: ProjectSummary[]; canManage: boolean }>('GET', '/api/projects'),
  getProject: (id: string) => request<ProjectSummary>('GET', `/api/projects/${encodeURIComponent(id)}`),
  createProject: (name: string) => request<{ id: string }>('POST', '/api/projects', { name }),
  uploadProject: (fileText: string) => request<{ id: string }>('POST', '/api/projects/upload', fileText, true),
  deleteProject: (id: string) => request<{ ok: true }>('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  downloadUrl: (id: string) => `/api/projects/${encodeURIComponent(id)}/download`,

  listTrash: () => request<{ entries: TrashEntry[] }>('GET', '/api/trash'),
  restoreTrash: (trashId: string) => request<{ id: string }>('POST', `/api/trash/${encodeURIComponent(trashId)}/restore`),

  listVersions: (id: string) => request<{ versions: VersionInfo[] }>('GET', `/api/projects/${encodeURIComponent(id)}/versions`),
  getVersion: (id: string, versionId: string) =>
    request<Project>('GET', `/api/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
  restoreVersion: (id: string, versionId: string) =>
    request<{ ok: true }>('POST', `/api/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`),

  getConflicts: (id: string) => request<{ pending: boolean; conflicts: Conflict[] }>('GET', `/api/projects/${encodeURIComponent(id)}/conflicts`),
  resolveConflicts: (id: string, resolutions: Record<string, Resolution>) =>
    request<{ ok: true }>('POST', `/api/projects/${encodeURIComponent(id)}/conflicts`, { resolutions }),

  // ---------- Bibliothek ----------
  library: () => request<Library>('GET', '/api/library'),
  createTemplate: (template: Partial<Template>) => request<Template>('POST', '/api/library/templates', { template }),
  updateTemplate: (template: Template, options: { force?: boolean } = {}) =>
    request<Template>('PUT', `/api/library/templates/${encodeURIComponent(template.id)}`, {
      template,
      baseVersion: template.version,
      force: options.force,
    }),
  deleteTemplate: (id: string) => request<{ ok: true }>('DELETE', `/api/library/templates/${encodeURIComponent(id)}`),
  createMaster: (kind: MasterKind, entry: Partial<MasterEntry>) => request<MasterEntry>('POST', `/api/library/master/${kind}`, entry),
  updateMaster: (kind: MasterKind, id: string, patch: Partial<MasterEntry>) =>
    request<MasterEntry>('PUT', `/api/library/master/${kind}/${encodeURIComponent(id)}`, patch),
  deleteMaster: (kind: MasterKind, id: string) => request<{ ok: true }>('DELETE', `/api/library/master/${kind}/${encodeURIComponent(id)}`),
  exportLibraryUrl: '/api/library/export',
  importLibrary: (data: unknown, resolutions?: Record<string, Resolution>) =>
    request<
      | { status: 'conflicts'; conflicts: Conflict[]; additions: number }
      | { status: 'imported'; summary: { added: number; replaced: number; copied: number; kept: number } }
    >('POST', '/api/library/import', { data, resolutions }),

  eventsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/events`;
  },

  syncUrl(id: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(id)}/sync`;
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
