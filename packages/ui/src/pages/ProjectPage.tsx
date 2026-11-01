import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { can, type Conflict, type PresenceUser, type ProjectMeta } from '@steckplan/core';
import { api, errorMessage } from '../lib/api';
import { useLibrary } from '../lib/library';
import { getDesktop } from '../lib/desktop';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useEditor } from '../lib/editor';
import { useUndo } from '../lib/undo';
import { useProjectData } from '../lib/useProjectData';
import { useProjectDoc, useYMap } from '../lib/useProjectDoc';
import { texts } from '../texts';
import { AppHeader } from '../components/AppHeader';
import { ConflictDialog } from '../components/ConflictDialog';
import { VersionsDialog } from '../components/VersionsDialog';
import { SignalFlowView } from '../components/signalflow/SignalFlowView';
import { StagePlanView } from '../components/stageplan/StagePlanView';
import { ListsView } from '../components/lists/ListsView';
import { NetworkView } from '../components/network/NetworkView';
import { ExportDialog } from '../components/ExportDialog';
import { useIssues } from '../lib/useIssues';
import { MeterField } from '../components/library/fields';
import { AccessBadge, Banner, Button, Field, Spinner, TextArea, TextInput } from '../components/ui';

type Tab = 'signalflow' | 'stageplan' | 'network' | 'lists' | 'meta';
const TAB_PARAM: Record<Tab, string> = { signalflow: 'signalfluss', stageplan: 'buehnenplan', network: 'netzwerk', lists: 'listen', meta: 'projektdaten' };

function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('ansicht');
  return (Object.entries(TAB_PARAM).find(([, v]) => v === value)?.[0] as Tab | undefined) ?? 'signalflow';
}

export function ProjectPage({ id }: { id: string }) {
  const project = useProjectDoc(id);
  const data = useProjectData(project?.doc);
  const undo = useUndo(project?.doc);
  const issues = useIssues(data, useLibrary((st) => st.library));
  const resetEditor = useEditor((s) => s.reset);
  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (next: Tab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('ansicht', TAB_PARAM[next]);
    window.history.replaceState(null, '', url.pathname + url.search);
  };
  const session = useSession((s) => s.session);
  const refreshSession = useSession((s) => s.refresh);
  const [showVersions, setShowVersions] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const library = useLibrary((s) => s.library);
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

  useEffect(() => resetEditor(), [id, resetEditor]);

  // Desktop: Menübefehle „Versionen …“ und „Exportieren …“
  useEffect(
    () =>
      getDesktop()?.onMenuCommand((command) => {
        if (command === 'versions') setShowVersions(true);
        if (command === 'export') setShowExport(true);
      }),
    [],
  );

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
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
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
            <Button variant="ghost" onClick={() => setShowExport(true)} disabled={!library || !project}>
              {texts.exportDialog.open}
            </Button>
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
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="tablist">
        {(['signalflow', 'stageplan', 'network', 'lists', 'meta'] as const).map((t) => (
          <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
            {texts.signalflow.tabs[t]}
          </Button>
        ))}
        <div className="flex-1" />
        {state && state.users.length > 0 && <Presence users={state.users} me={state.connectionId} />}
      </div>
      <div className="space-y-2 empty:hidden px-2 pt-2">
        {status === 'disconnected' && <Banner tone="warn">{texts.project.disconnected}</Banner>}
        {state?.reconcilePending ? (
          <Banner tone="warn">
            <div className="space-y-2">
              <div>{texts.library.conflicts.pending}</div>
              {session && can(session.access, 'editProject') ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    setConflictError(null);
                    try {
                      setConflicts((await api.getConflicts(id)).conflicts);
                    } catch (err) {
                      setConflictError(errorMessage(err));
                    }
                  }}
                >
                  {texts.library.conflicts.resolve}
                </Button>
              ) : (
                <div>{texts.library.conflicts.pendingRead}</div>
              )}
              {conflictError && <div className="text-red-700">{conflictError}</div>}
            </div>
          </Banner>
        ) : (
          state?.readOnlyReason && <Banner tone="warn">{state.readOnlyReason}</Banner>
        )}
        {state?.notice && <Banner tone="info">{state.notice}</Banner>}
      </div>

      {!project || status === 'connecting' || (status === 'connected' && !meta.name) ? (
        <Spinner />
      ) : tab === 'signalflow' ? (
        <SignalFlowView doc={project.doc} data={data} library={library} editable={editable} undo={undo} />
      ) : tab === 'stageplan' ? (
        <StagePlanView doc={project.doc} data={data} library={library} editable={editable} undo={undo} />
      ) : tab === 'network' ? (
        <NetworkView
          projectId={id}
          doc={project.doc}
          origin={undo.origin}
          data={data}
          library={library}
          issues={issues}
          editable={editable}
          canSeeSecrets={!!session && can(session.access, 'viewSecrets')}
        />
      ) : tab === 'lists' ? (
        <ListsView
          projectId={id}
          data={data}
          library={library}
          canCheck={online && !state?.readOnlyReason && !!session && can(session.access, 'checkItems')}
          canReset={editable && !!session && can(session.access, 'resetChecks')}
        />
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4">
          <MetaForm doc={project.doc} meta={meta} editable={editable} />
          <SettingsForm doc={project.doc} settings={data.settings} editable={editable} />
          {session && can(session.access, 'manageProjects') && <CopyProject projectId={id} name={meta.name ?? ''} />}
        </main>
      )}
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          library={library}
          onClose={() => setConflicts(null)}
          onSubmit={async (resolutions) => {
            await api.resolveConflicts(id, resolutions);
            setConflicts(null);
          }}
        />
      )}
      {showExport && library && project && (
        <ExportDialog projectId={id} data={data} library={library} meta={meta} issues={issues} onClose={() => setShowExport(false)} />
      )}
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
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="presence">
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

function SettingsForm({ doc, settings, editable }: { doc: Y.Doc; settings: { defaultReservePercent?: number; defaultReservePerEndMm?: number }; editable: boolean }) {
  const map = doc.getMap('settings');
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.project.settings}</h2>
      <p className="text-xs text-slate-500">{texts.project.reserveHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={texts.project.reservePercent}>
          <TextInput
            type="number"
            min={0}
            value={settings.defaultReservePercent ?? 10}
            disabled={!editable}
            onChange={(e) => map.set('defaultReservePercent', Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <MeterField label={texts.project.reservePerEnd} value={settings.defaultReservePerEndMm ?? 500} disabled={!editable} onChange={(v) => map.set('defaultReservePerEndMm', v ?? 0)} />
      </div>
    </section>
  );
}

function CopyProject({ projectId, name }: { projectId: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const desktop = getDesktop();
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.project.copyTitle}</h2>
      <p className="text-xs text-slate-500">{texts.project.copyHint}</p>
      <Button
        onClick={async () => {
          setError(null);
          try {
            if (desktop) await desktop.copyAsNew(projectId);
            else navigate(`/projekt/${(await api.copyProject(projectId, `${name} (Kopie)`)).id}?ansicht=projektdaten`);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        ⧉ {texts.project.copy}
      </Button>
      {error && <Banner tone="error">{error}</Banner>}
    </section>
  );
}
