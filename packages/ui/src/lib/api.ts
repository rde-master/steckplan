// Zugriff auf die REST-Schnittstelle des Servers.
import type { Access, ChangeLogEntry, HealthInfo, Conflict, Library, MasterEntry, MasterKind, Project, Resolution, Template } from '@steckplan/core';

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

export interface OscSettings {
  enabled: boolean;
  port: number;
}
export interface OscStatus {
  listening: boolean;
  port?: number;
  error?: string;
  last?: { address: string; at: string };
}

export interface LabelQrSettings {
  enabled: boolean;
  baseUrl: string;
  hint: string;
}

export interface ShareLinkInfo {
  key: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

export interface MediaFileInfo {
  id: string;
  sizeBytes: number;
  sha256: string;
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

export interface DesktopKeyInfo {
  id: string;
  label: string;
  access: 'edit' | 'read' | 'direction';
  createdAt: string;
  createdBy?: string;
  lastUsedAt?: string;
  revoked?: boolean;
  revokedAt?: string;
}

export const api = {
  async session(): Promise<{ session: SessionInfo | null; loginAvailable: boolean; keyRejected?: 'invalid' | 'rateLimited' }> {
    try {
      return { session: await request<SessionInfo>('GET', '/api/auth/session'), loginAvailable: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const res = await fetch('/api/auth/session');
        const data = (await res.json().catch(() => ({}))) as { loginAvailable?: boolean; keyRejected?: 'invalid' | 'rateLimited' };
        return { session: null, loginAvailable: data.loginAvailable ?? false, ...(data.keyRejected ? { keyRejected: data.keyRejected } : {}) };
      }
      throw error;
    }
  },
  health: () => request<HealthInfo>('GET', '/api/health'),
  listDesktopKeys: () => request<{ keys: DesktopKeyInfo[] }>('GET', '/api/settings/desktop-keys'),
  createDesktopKey: (label: string, access: 'edit' | 'read' | 'direction') => request<{ key: string; info: DesktopKeyInfo }>('POST', '/api/settings/desktop-keys', { label, access }),
  revokeDesktopKey: (id: string) => request<DesktopKeyInfo>('DELETE', `/api/settings/desktop-keys/${encodeURIComponent(id)}`),
  removeDesktopKey: (id: string) => request<{ ok: true }>('DELETE', `/api/settings/desktop-keys/${encodeURIComponent(id)}/entry`),
  login: (name: string, password: string) => request<SessionInfo>('POST', '/api/auth/login', { name, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  listProjects: () => request<{ projects: ProjectSummary[]; canManage: boolean }>('GET', '/api/projects'),
  getProject: (id: string) => request<ProjectSummary>('GET', `/api/projects/${encodeURIComponent(id)}`),
  createProject: (name: string) => request<{ id: string }>('POST', '/api/projects', { name }),
  uploadProject: (fileText: string) => request<{ id: string }>('POST', '/api/projects/upload', fileText, true),
  deleteProject: (id: string) => request<{ ok: true }>('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  getLabelQr: () => request<LabelQrSettings>('GET', '/api/settings/label-qr'),
  getOsc: () => request<{ settings: OscSettings; status: OscStatus }>('GET', '/api/settings/osc'),
  setOsc: (patch: Partial<OscSettings>) => request<{ settings: OscSettings; status: OscStatus }>('PUT', '/api/settings/osc', patch),
  setLabelQr: (patch: Partial<LabelQrSettings>) => request<LabelQrSettings>('PUT', '/api/settings/label-qr', patch),
  listShareLinks: () => request<{ links: ShareLinkInfo[] }>('GET', '/api/settings/label-qr/links'),
  changeShareLink: (key: string, action: 'renew' | 'revoke') => request<{ ok: true }>('PUT', '/api/settings/label-qr/links', { key, action }),
  getShare: (projectId: string) => request<{ token: string; createdAt: string }>('GET', `/api/projects/${encodeURIComponent(projectId)}/share`),
  ensureShare: (projectId: string, renew = false) => request<{ token: string; createdAt: string }>('POST', `/api/projects/${encodeURIComponent(projectId)}/share`, { renew }),
  downloadUrl: (id: string, withMedia = false) => `/api/projects/${encodeURIComponent(id)}/download${withMedia ? '?medien=1' : ''}`,
  mediaUrl: (projectId: string, mediaId: string) => `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}`,
  startMediaUpload: (projectId: string, size: number, mediaId?: string) =>
    request<{ uploadId: string; mediaId: string; size: number; received: number; complete?: MediaFileInfo }>('POST', `/api/projects/${encodeURIComponent(projectId)}/media/uploads`, { size, ...(mediaId ? { mediaId } : {}) }),
  mediaUploadStatus: (projectId: string, uploadId: string) =>
    request<{ uploadId: string; mediaId: string; size: number; received: number }>('GET', `/api/projects/${encodeURIComponent(projectId)}/media/uploads/${encodeURIComponent(uploadId)}`),
  completeMediaUpload: (projectId: string, uploadId: string) => request<MediaFileInfo>('POST', `/api/projects/${encodeURIComponent(projectId)}/media/uploads/${encodeURIComponent(uploadId)}/complete`),
  cancelMediaUpload: (projectId: string, uploadId: string) => request<{ ok: true }>('DELETE', `/api/projects/${encodeURIComponent(projectId)}/media/uploads/${encodeURIComponent(uploadId)}`),

  listTrash: () => request<{ entries: TrashEntry[] }>('GET', '/api/trash'),
  restoreTrash: (trashId: string) => request<{ id: string }>('POST', `/api/trash/${encodeURIComponent(trashId)}/restore`),

  listVersions: (id: string) => request<{ versions: VersionInfo[] }>('GET', `/api/projects/${encodeURIComponent(id)}/versions`),
  getVersion: (id: string, versionId: string) =>
    request<Project>('GET', `/api/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
  restoreVersion: (id: string, versionId: string) =>
    request<{ ok: true }>('POST', `/api/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`),

  check: (id: string, body: { kind: 'device' | 'cable'; id: string; direction: 'out' | 'in'; status: 'ok' | 'missing' | 'damaged' | null; note?: string }) =>
    request<{ ok: true }>('POST', `/api/projects/${encodeURIComponent(id)}/check`, body),
  resetChecks: (id: string, direction: 'out' | 'in' | 'both') =>
    request<{ removed: number }>('POST', `/api/projects/${encodeURIComponent(id)}/checks/reset`, { direction }),
  getChangeLog: (id: string) => request<{ entries: ChangeLogEntry[] }>('GET', `/api/projects/${encodeURIComponent(id)}/changelog`),
  getSecrets: (id: string) => request<{ wifiPasswords: { wifiId: string; password: string }[] }>('GET', `/api/projects/${encodeURIComponent(id)}/secrets`),
  setWifiPassword: (id: string, wifiId: string, password: string | null) =>
    request<{ ok: true }>('PUT', `/api/projects/${encodeURIComponent(id)}/secrets/wifi/${encodeURIComponent(wifiId)}`, { password }),
  wifiQrUrl: (id: string, wifiId: string, version: string) =>
    `/api/projects/${encodeURIComponent(id)}/wifi/${encodeURIComponent(wifiId)}/qr.svg?v=${encodeURIComponent(version)}`,
  copyProject: (id: string, name?: string) => request<{ id: string }>('POST', `/api/projects/${encodeURIComponent(id)}/copy`, { name }),
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
