import { ArrowLeft, Copy, Download, FileOutput, History, LibraryBig, LogOut, Menu, Wifi } from 'lucide-react';
import { ICON } from '../components/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import { can, devicePageId, type Conflict, type PresenceUser, type ProjectMeta } from '@steckplan/core';
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
import { MenuDrawer, MobileMenuSlot, usePhone } from '../components/mobile';
import { ConflictDialog } from '../components/ConflictDialog';
import { VersionsDialog } from '../components/VersionsDialog';
import { SignalFlowView } from '../components/signalflow/SignalFlowView';
import { StagePlanView } from '../components/stageplan/StagePlanView';
import { ListsView } from '../components/lists/ListsView';
import { RegieView } from '../components/regie/RegieView';
import { NetworkView } from '../components/network/NetworkView';
import { ExportDialog } from '../components/ExportDialog';
import { CasesPanel } from '../components/project/CasesPanel';
import { PeoplePanel } from '../components/project/PeoplePanel';
import { WebAccessDialog } from '../components/WebAccessDialog';
import { UploadToServerDialog } from '../components/ServerDialogs';
import { useIssues } from '../lib/useIssues';
import { MeterField } from '../components/library/fields';
import { AccessBadge, Banner, Button, Field, Spinner, TextArea, TextInput } from '../components/ui';

type Tab = 'signalflow' | 'stageplan' | 'network' | 'lists' | 'regie' | 'meta';
const TAB_PARAM: Record<Tab, string> = { signalflow: 'signalfluss', stageplan: 'buehnenplan', network: 'netzwerk', lists: 'listen', regie: 'regie', meta: 'projektdaten' };
const TABS: Tab[] = ['signalflow', 'stageplan', 'network', 'lists', 'regie', 'meta'];

/** Ohne Angabe in der Adresse: Regie-Zugang startet in der Regie, auf schmalen Bildschirmen (Handy) die Packliste, sonst der Signalfluss. */
function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('ansicht');
  const fromUrl = Object.entries(TAB_PARAM).find(([, v]) => v === value)?.[0] as Tab | undefined;
  if (fromUrl) return fromUrl;
  if (useSession.getState().session?.access === 'direction') return 'regie';
  return window.innerWidth <= 640 ? 'lists' : 'signalflow';
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
  const [showWeb, setShowWeb] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const library = useLibrary((s) => s.library);
  const meta = useYMap<ProjectMeta>(project?.doc, 'meta');
  const isDesktop = getDesktop() !== null;
  const phone = usePhone();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);

  const state = project?.state;
  const status = state?.status ?? 'connecting';

  useEffect(() => {
    document.title = meta.name ? `${meta.name} – ${texts.app.name}` : texts.app.name;
  }, [meta.name]);

  useEffect(() => {
    if (status === 'unauthorized') void refreshSession();
  }, [status, refreshSession]);

  useEffect(() => resetEditor(), [id, resetEditor]);

  // Über den QR-Code eines Etiketts geöffnet (?geraet=…): Gerät wählen, seine Seite zeigen, hinspringen – einmal
  const [deviceParam] = useState(() => new URLSearchParams(window.location.search).get('geraet'));
  const target = deviceParam ? data.devices.find((d) => d.id === deviceParam) : undefined;
  const deviceShown = useRef(false);
  useEffect(() => {
    if (!target || deviceShown.current) return;
    deviceShown.current = true;
    const editor = useEditor.getState();
    editor.setFlowPage(devicePageId(target, data.flowPages));
    editor.select({ devices: [target.id], cables: [] });
    if (target.signalFlow) editor.focus({ x: target.signalFlow.position.x + 90, y: target.signalFlow.position.y + 40 });
    editor.requestProperties();
    const url = new URL(window.location.href);
    url.searchParams.delete('geraet');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [target, data.flowPages]);

  // Desktop: Menübefehle „Versionen …“ und „Exportieren …“
  useEffect(
    () =>
      getDesktop()?.onMenuCommand((command) => {
        if (command === 'versions') setShowVersions(true);
        if (command === 'export') setShowExport(true);
        if (command === 'webAccess') setShowWeb(true);
        if (command === 'uploadToServer') setShowUpload(true);
      }),
    [],
  );

  // Kurze Unterbrechung nach erfolgreichem Abgleich (z. B. Proxy trennt, Neuverbindung): weiter bedienbar,
  // Änderungen werden beim Neuverbinden abgeglichen – sonst flackert die Oberfläche kurz.
  const online = status === 'synced' || (!!state?.everSynced && (status === 'connecting' || status === 'disconnected'));
  // Zugang „Regie“ schreibt nur die Regie; Steckplan, Listen usw. bleiben für ihn gesperrt
  const access = state?.access ?? session?.access;
  const editable = online && !state?.readOnly && !!access && can(access, 'editProject');
  const showEditable = online && !state?.readOnly && !!access && can(access, 'editShow');

  const backButton = !isDesktop ? (
    <Button variant="ghost" onClick={() => navigate('/')} aria-label={texts.project.toList} title={texts.project.toList}>
      <ArrowLeft {...ICON} />
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

  const openLibrary = () => {
    // Desktop: eigenes Fenster; Browser/Server-Fenster: neuer Tab, das Projekt bleibt offen
    const desktop = getDesktop();
    if (desktop) void desktop.openLibrary();
    else window.open('/bibliothek', '_blank', 'noopener');
  };
  const readOnlyBadge = state?.readOnly && (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">{texts.project.readOnly}</span>
  );
  const tabs = TABS.map((t) => (
    <Button
      key={t}
      role="tab"
      aria-selected={tab === t}
      variant={tab === t ? 'primary' : 'ghost'}
      onClick={() => {
        setTab(t);
        setMenuOpen(false);
      }}
    >
      {texts.signalflow.tabs[t]}
    </Button>
  ));

  const header = phone ? (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
        <Button variant="ghost" aria-label={texts.mobile.openMenu} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Menu size={22} aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-semibold">{meta.name || ' '}</h1>
          <div className="truncate text-xs text-slate-500">{texts.signalflow.tabs[tab]}</div>
        </div>
        {readOnlyBadge}
        <ConnectionDot status={status} />
      </header>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <section aria-label={texts.mobile.views} className="py-2">
          <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{texts.mobile.views}</h2>
          <div className="flex flex-col px-2 *:justify-start" role="tablist">
            {tabs}
          </div>
        </section>
        <section aria-label={texts.mobile.project} className="border-t border-slate-200 py-2 dark:border-slate-700">
          <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{texts.mobile.project}</h2>
          <div className="flex flex-col px-2 *:justify-start">
            <MenuItem icon={<LibraryBig {...ICON} />} onClick={openLibrary}>
              {texts.project.library}
            </MenuItem>
            <MenuItem icon={<FileOutput {...ICON} />} disabled={!library || !project} onClick={() => { setMenuOpen(false); setShowExport(true); }}>
              {texts.exportDialog.open}
            </MenuItem>
            <MenuItem icon={<History {...ICON} />} onClick={() => { setMenuOpen(false); setShowVersions(true); }}>
              {texts.project.versions}
            </MenuItem>
            {isDesktop && (
              <MenuItem icon={<Wifi {...ICON} />} onClick={() => { setMenuOpen(false); setShowWeb(true); }}>
                {texts.webAccess.open}
              </MenuItem>
            )}
            {!isDesktop && (
              <a className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" href={api.downloadUrl(id)}>
                <Download {...ICON} /> {texts.project.download}
              </a>
            )}
            {!isDesktop && data.media.length > 0 && (
              <a className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" href={api.downloadUrl(id, true)}>
                <Download {...ICON} /> {texts.project.downloadWithMedia}
              </a>
            )}
            {!isDesktop && (
              <MenuItem icon={<ArrowLeft {...ICON} />} onClick={() => navigate('/')}>
                {texts.project.toList}
              </MenuItem>
            )}
          </div>
        </section>
        {/* hier legen Signalfluss und Bühnenplan ihre Werkzeuge, Seiten und Filter ab */}
        <div ref={setMenuSlot} className="contents" />
        {state && state.users.length > 0 && (
          <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">
            <Presence users={state.users} me={state.connectionId} />
          </div>
        )}
        <SessionInMenu />
      </MenuDrawer>
    </>
  ) : (
    <>
      <AppHeader
        left={backButton}
        title={meta.name || ' '}
        right={
          <div className="flex items-center gap-2">
            <ConnectionDot status={status} />
            {readOnlyBadge}
            <Button variant="ghost" title={texts.project.libraryTitle} onClick={openLibrary}>
              <LibraryBig {...ICON} /> {texts.project.library}
            </Button>
            <Button variant="ghost" onClick={() => setShowExport(true)} disabled={!library || !project}>
              {texts.exportDialog.open}
            </Button>
            <Button variant="ghost" onClick={() => setShowVersions(true)}>
              {texts.project.versions}
            </Button>
            {isDesktop && (
              <Button variant="ghost" onClick={() => setShowWeb(true)} title={texts.webAccess.title}>
                {texts.webAccess.open}
              </Button>
            )}
            {!isDesktop && (
              <a className="hidden rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 sm:inline dark:text-slate-300 dark:hover:bg-slate-700" href={api.downloadUrl(id)}>
                {texts.project.download}
              </a>
            )}
            {!isDesktop && data.media.length > 0 && (
              <a className="hidden rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 sm:inline dark:text-slate-300 dark:hover:bg-slate-700" href={api.downloadUrl(id, true)} title={texts.project.downloadWithMediaTitle}>
                {texts.project.downloadWithMedia}
              </a>
            )}
          </div>
        }
      />
      <div className="flex items-center gap-1 overflow-x-auto border-b *:shrink-0 border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="tablist">
        {tabs}
        <div className="flex-1" />
        {state && state.users.length > 0 && <Presence users={state.users} me={state.connectionId} />}
      </div>
    </>
  );

  return (
    <MobileMenuSlot value={phone ? menuSlot : undefined}>
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      {header}
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
      ) : tab === 'regie' ? (
        <RegieView
          projectId={id}
          doc={project.doc}
          origin={undo.origin}
          data={data}
          library={library}
          editable={showEditable}
          sync={project.state}
          sendCue={project.sendCue}
          onRemote={project.onRemote}
          canLead={online && !!access && can(access, 'editShow')}
        />
      ) : tab === 'lists' ? (
        <ListsView
          projectId={id}
          data={data}
          library={library}
          canCheck={online && !state?.readOnlyReason && !!session && can(session.access, 'checkItems')}
          canReset={editable && !!session && can(session.access, 'resetChecks')}
          doc={project.doc}
          origin={undo.origin}
          editable={editable}
        />
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4">
          <MetaForm doc={project.doc} meta={meta} editable={editable} />
          <PeoplePanel doc={project.doc} origin={undo.origin} data={data} library={library} editable={editable} />
          <CasesPanel doc={project.doc} origin={undo.origin} data={data} library={library} editable={editable} />
          <SettingsForm doc={project.doc} settings={data.settings} editable={editable} />
          {session && can(session.access, 'manageProjects') && <CopyProject projectId={id} name={meta.name ?? ''} />}
          {isDesktop && (
            <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.servers.uploadTitle}</h2>
              <p className="text-xs text-slate-500">{texts.servers.uploadIntro}</p>
              <Button onClick={() => setShowUpload(true)}>{texts.servers.uploadTitle} …</Button>
            </section>
          )}
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
      {showWeb && getDesktop() && <WebAccessDialog desktop={getDesktop()!} onClose={() => setShowWeb(false)} />}
      {showUpload && getDesktop() && <UploadToServerDialog desktop={getDesktop()!} projectId={id} onClose={() => setShowUpload(false)} />}
    </div>
    </MobileMenuSlot>
  );
}

function MenuItem({ icon, onClick, disabled = false, children }: { icon: ReactNode; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button variant="ghost" className="justify-start" disabled={disabled} onClick={onClick}>
      {icon} {children}
    </Button>
  );
}

/** Angemeldet als … und Abmelden (im Burgermenü der Handy-Ansicht) */
function SessionInMenu() {
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);
  if (!session) return null;
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
      <span className="min-w-0 flex-1 truncate">{session.name}</span>
      <AccessBadge access={session.access} />
      {session.via === 'browser' && (
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            navigate('/anmelden', { replace: true });
          }}
        >
          <LogOut {...ICON} /> {texts.session.logout}
        </Button>
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
          {(user.access === 'read' || user.access === 'direction') && <AccessBadge access={user.access} />}
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
        <Copy {...ICON} /> {texts.project.copy}
      </Button>
      {error && <Banner tone="error">{error}</Banner>}
    </section>
  );
}
