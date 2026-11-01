import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { can, type PresenceUser, type ProjectMeta } from '@steckplan/core';
import { api } from '../lib/api';
import { getDesktop } from '../lib/desktop';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useProjectDoc, useYMap } from '../lib/useProjectDoc';
import { texts } from '../texts';
import { AppHeader } from '../components/AppHeader';
import { VersionsDialog } from '../components/VersionsDialog';
import { AccessBadge, Banner, Button, Field, Spinner, TextArea, TextInput } from '../components/ui';

export function ProjectPage({ id }: { id: string }) {
  const project = useProjectDoc(id);
  const session = useSession((s) => s.session);
  const refreshSession = useSession((s) => s.refresh);
  const [showVersions, setShowVersions] = useState(false);
  const meta = useYMap<ProjectMeta>(project?.doc, 'meta');
  const isDesktop = getDesktop() !== null;

  const state = project?.state;
  const status = state?.status ?? 'connecting';

  useEffect(() => {
    document.title = meta.name ? `${meta.name} – ${texts.app.name}` : texts.app.name;
  }, [meta.name]);

  useEffect(() => {
    if (status === 'unauthorized') void refreshSession();
  }, [status, refreshSession]);

  // Desktop: „Datei → Versionen …“ im Menü
  useEffect(() => getDesktop()?.onMenuCommand((command) => command === 'versions' && setShowVersions(true)), []);

  const online = status === 'synced';
  const editable = online && !state?.readOnly;

  const backButton = !isDesktop ? (
    <Button variant="ghost" onClick={() => navigate('/')} aria-label={texts.project.toList} title={texts.project.toList}>
      ←
    </Button>
  ) : null;

  if (status === 'notFound' || status === 'closed') {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader left={backButton} />
        <main className="mx-auto max-w-xl space-y-3 p-4">
          <Banner tone="warn">{status === 'notFound' ? texts.project.notFound : (state?.notice ?? texts.project.closed)}</Banner>
          {!isDesktop && <Button onClick={() => navigate('/')}>{texts.project.toList}</Button>}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        left={backButton}
        title={meta.name || ' '}
        right={
          <div className="flex items-center gap-2">
            <ConnectionDot status={status} />
            {state?.readOnly && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {texts.project.readOnly}
              </span>
            )}
            <Button variant="ghost" onClick={() => setShowVersions(true)}>
              {texts.project.versions}
            </Button>
            {!isDesktop && (
              <a className="hidden rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 sm:inline dark:text-slate-300 dark:hover:bg-slate-700" href={api.downloadUrl(id)}>
                {texts.project.download}
              </a>
            )}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        {status === 'disconnected' && <Banner tone="warn">{texts.project.disconnected}</Banner>}
        {state?.readOnlyReason && <Banner tone="warn">{state.readOnlyReason}</Banner>}
        {state?.notice && <Banner tone="info">{state.notice}</Banner>}
        {state && state.users.length > 0 && <Presence users={state.users} me={state.connectionId} />}

        {!project || status === 'connecting' || (status === 'connected' && !meta.name) ? (
          <Spinner />
        ) : (
          <MetaForm doc={project.doc} meta={meta} editable={editable} />
        )}
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">{texts.project.comingSoon}</p>
      </main>
      {showVersions && session && (
        <VersionsDialog
          projectId={id}
          canRestore={can(session.access, 'restoreVersion') && !state?.readOnly}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const online = status === 'synced';
  const label = online ? texts.project.connected : status === 'disconnected' ? texts.project.disconnected : texts.project.connecting;
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500" title={label}>
      <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : status === 'disconnected' ? 'bg-red-500' : 'bg-amber-400'}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Presence({ users, me }: { users: PresenceUser[]; me: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="presence">
      <span className="text-slate-500 dark:text-slate-400">{texts.project.present}</span>
      {users.map((user) => (
        <span
          key={user.id}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${user.id === me ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
        >
          {user.name}
          {user.access === 'read' && <AccessBadge access="read" />}
        </span>
      ))}
    </div>
  );
}

const FIELDS: { key: keyof ProjectMeta; type?: 'date' | 'textarea' }[] = [
  { key: 'name' },
  { key: 'venue' },
  { key: 'date', type: 'date' },
  { key: 'planner' },
  { key: 'client' },
  { key: 'version' },
  { key: 'notes', type: 'textarea' },
];

function MetaForm({ doc, meta, editable }: { doc: Y.Doc; meta: Partial<ProjectMeta>; editable: boolean }) {
  const map = doc.getMap('meta');
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.project.meta}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, type }) => {
          const props = {
            value: (meta[key] as string | undefined) ?? '',
            disabled: !editable,
            name: key,
            onChange: (e: { target: { value: string } }) => map.set(key, e.target.value),
          };
          return (
            <div key={key} className={type === 'textarea' || key === 'name' ? 'sm:col-span-2' : ''}>
              <Field label={texts.project.fields[key]}>
                {type === 'textarea' ? <TextArea {...props} /> : <TextInput type={type ?? 'text'} {...props} />}
              </Field>
            </div>
          );
        })}
      </div>
    </section>
  );
}
