import { useCallback, useState } from 'react';
import type { Project } from '@steckplan/core';
import { api, errorMessage, type VersionInfo } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatDate, formatDateTime } from '../lib/format';
import { texts } from '../texts';
import { Banner, Button, Modal, Spinner } from './ui';

export function VersionsDialog({ projectId, canRestore, onClose }: { projectId: string; canRestore: boolean; onClose: () => void }) {
  const list = useLoader(useCallback(() => api.listVersions(projectId), [projectId]));
  const versions = list.data?.versions ?? null;
  const [selected, setSelected] = useState<VersionInfo | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const selectedId = selected?.id;
  const previewLoader = useLoader(
    useCallback(
      async (): Promise<{ id: string; project: Project } | null> =>
        selectedId ? { id: selectedId, project: await api.getVersion(projectId, selectedId) } : null,
      [projectId, selectedId],
    ),
  );
  const preview = previewLoader.data && previewLoader.data.id === selectedId ? previewLoader.data.project : null;
  const error = actionError ?? list.error ?? previewLoader.error;

  function select(version: VersionInfo | null) {
    setSelected(version);
    setConfirming(false);
  }

  async function restore() {
    if (!selected) return;
    try {
      await api.restoreVersion(projectId, selected.id);
      setDone(true);
      select(null);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={texts.versions.title} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{texts.versions.hint}</p>
      {error && <Banner tone="error">{error}</Banner>}
      {done && <Banner tone="success">{texts.versions.restored}</Banner>}
      {versions === null && !error && <Spinner />}
      {versions?.length === 0 && <p className="py-4 text-sm text-slate-500">{texts.versions.empty}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {versions?.map((version) => (
          <li key={version.id}>
            <button
              type="button"
              onClick={() => select(selected?.id === version.id ? null : version)}
              className={`w-full px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${selected?.id === version.id ? 'bg-sky-50 dark:bg-sky-950' : ''}`}
            >
              <div className="font-medium">{formatDateTime(version.at)}</div>
              <div className="text-xs text-slate-500">
                {version.note ? `${version.note} · ` : ''}
                {version.by.length ? `${texts.versions.by} ${version.by.join(', ')}` : ''}
              </div>
            </button>
            {selected?.id === version.id && (
              <div className="space-y-2 bg-slate-50 px-3 py-3 text-sm dark:bg-slate-900">
                <div className="text-xs font-semibold uppercase text-slate-500">{texts.versions.preview}</div>
                {!preview ? (
                  <Spinner />
                ) : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {(['name', 'venue', 'date', 'planner', 'client', 'version'] as const).map((key) => (
                      <div key={key} className="contents">
                        <dt className="text-slate-500">{texts.project.fields[key]}</dt>
                        <dd>{key === 'date' ? formatDate(preview.meta[key]) : preview.meta[key] || '–'}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {canRestore ? (
                  confirming ? (
                    <div className="space-y-2">
                      <Banner tone="warn">{texts.versions.restoreConfirm}</Banner>
                      <div className="flex gap-2">
                        <Button onClick={() => setConfirming(false)}>{texts.common.cancel}</Button>
                        <Button variant="primary" onClick={() => void restore()}>
                          {texts.versions.restore}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="primary" onClick={() => setConfirming(true)} disabled={!preview}>
                      {texts.versions.restore}
                    </Button>
                  )
                ) : (
                  <p className="text-xs text-slate-500">{texts.versions.restoreDenied}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
