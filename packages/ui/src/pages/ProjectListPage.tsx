import { useCallback, useRef, useState } from 'react';
import { can } from '@steckplan/core';
import { api, errorMessage, type ProjectSummary } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatDate, formatDateTime } from '../lib/format';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { AppHeader, MainNav } from '../components/AppHeader';
import { Banner, Button, Field, Modal, Spinner, TextInput } from '../components/ui';

export function ProjectListPage() {
  const session = useSession((s) => s.session);
  const canManage = session ? can(session.access, 'manageProjects') : false;
  const list = useLoader(useCallback(() => api.listProjects(), []));
  const projects = list.data?.projects ?? null;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? list.error;
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = list.reload;

  async function upload(file: File) {
    setError(null);
    try {
      const { id } = await api.uploadProject(await file.text());
      setMessage(texts.projects.uploaded);
      load();
      navigate(`/projekt/${id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title={texts.projects.title} nav={<MainNav active="projects" />} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4">
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setCreating(true)}>
              ＋ {texts.projects.create}
            </Button>
            <Button onClick={() => fileInput.current?.click()} title={texts.projects.uploadHint}>
              ⇪ {texts.projects.upload}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".steckplan,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setShowTrash(true)}>
              🗑 {texts.projects.trash}
            </Button>
          </div>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        {message && <Banner tone="success">{message}</Banner>}
        {projects === null && !error && <Spinner />}
        {projects && projects.length === 0 && (
          <p className="py-12 text-center text-slate-500">{canManage ? texts.projects.empty : texts.projects.emptyRead}</p>
        )}
        {projects && projects.length > 0 && (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <a
                  href={`/projekt/${project.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/projekt/${project.id}`);
                  }}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate font-medium text-sky-700 hover:underline dark:text-sky-400">{project.name || '(ohne Namen)'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {[project.venue, formatDate(project.date)].filter(Boolean).join(' · ')}
                    {project.venue || project.date ? ' · ' : ''}
                    {texts.projects.updated} {formatDateTime(project.updatedAt)}
                  </div>
                </a>
                <a className="text-sm text-slate-600 hover:underline dark:text-slate-300" href={api.downloadUrl(project.id)}>
                  {texts.projects.download}
                </a>
                {canManage && (
                  <Button variant="ghost" onClick={() => setDeleting(project)} aria-label={`${texts.common.delete}: ${project.name}`}>
                    {texts.common.delete}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            navigate(`/projekt/${id}`);
          }}
        />
      )}
      {deleting && (
        <Modal
          title={texts.projects.deleteTitle}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>{texts.common.cancel}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const target = deleting;
                  setDeleting(null);
                  try {
                    await api.deleteProject(target.id);
                    load();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                {texts.common.delete}
              </Button>
            </>
          }
        >
          <p className="text-sm">{texts.projects.deleteText(deleting.name)}</p>
        </Modal>
      )}
      {showTrash && <TrashDialog onClose={() => setShowTrash(false)} onRestored={load} />}
    </div>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      onCreated((await api.createProject(name)).id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={texts.projects.createTitle}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{texts.common.cancel}</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {texts.projects.create}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void submit();
        }}
        className="space-y-3"
      >
        <Field label={texts.projects.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Modal>
  );
}

function TrashDialog({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const trash = useLoader(useCallback(() => api.listTrash(), []));
  const entries = trash.data?.entries ?? null;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? trash.error;

  return (
    <Modal title={texts.projects.trash} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{texts.projects.trashHint}</p>
      {error && <Banner tone="error">{error}</Banner>}
      {entries === null && !error && <Spinner />}
      {entries?.length === 0 && <p className="py-4 text-sm text-slate-500">{texts.projects.trashEmpty}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {entries?.map((entry) => (
          <li key={entry.trashId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{entry.name}</div>
              <div className="text-xs text-slate-500">
                {texts.projects.deletedAt} {formatDateTime(entry.deletedAt)}
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  await api.restoreTrash(entry.trashId);
                  trash.reload();
                  onRestored();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              {texts.projects.restore}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
