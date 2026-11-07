// Vorstellung als eigene Seite (eigener Tab bzw. in der Desktop-App eigenes Fenster): /projekt/<id>/vorstellung.
import { useEffect } from 'react';
import { can } from '@steckplan/core';
import { Banner, Button, Spinner } from '../components/ui';
import { PerformanceView } from '../components/regie/PerformanceView';
import { useLibrary } from '../lib/library';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useProjectData } from '../lib/useProjectData';
import { useProjectDoc, useYMap } from '../lib/useProjectDoc';
import { texts } from '../texts';

export function performancePath(projectId: string): string {
  return `/projekt/${encodeURIComponent(projectId)}/vorstellung`;
}

/** Vorstellung im eigenen Tab öffnen bzw. den schon offenen nach vorn holen */
export function openPerformance(projectId: string): void {
  window.open(performancePath(projectId), `steckplan-vorstellung-${projectId}`)?.focus();
}

/** Tab schließen; geht das nicht (Tab nicht per Skript geöffnet), zurück zum Projekt */
function closeTab(projectId: string): void {
  window.close();
  window.setTimeout(() => navigate(`/projekt/${encodeURIComponent(projectId)}?ansicht=regie`), 150);
}

export function PerformancePage({ id }: { id: string }) {
  const project = useProjectDoc(id);
  const data = useProjectData(project?.doc);
  const library = useLibrary((s) => s.library);
  const session = useSession((s) => s.session);
  const meta = useYMap<{ name?: string }>(project?.doc, 'meta');
  const state = project?.state;
  const status = state?.status ?? 'connecting';
  const online = status === 'synced' || (!!state?.everSynced && (status === 'connecting' || status === 'disconnected'));
  const access = state?.access ?? session?.access;
  const canLead = online && !!access && can(access, 'editShow');

  useEffect(() => {
    document.title = meta.name ? `${texts.regie.performance.title} – ${meta.name}` : texts.regie.performance.title;
  }, [meta.name]);

  if (state?.status === 'kicked') {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6" data-testid="kicked">
        <Banner tone="warn">{state.notice ?? texts.project.kicked}</Banner>
        <Button variant="primary" onClick={() => project?.reconnect()}>
          {texts.project.reconnect}
        </Button>
      </div>
    );
  }
  // erst nach dem ersten Abgleich zeigen: dann ist auch bekannt, ob jemand führt (Folgen beim Öffnen)
  if (!project || !state || !state.everSynced) return <Spinner />;
  return <PerformanceView projectId={id} doc={project.doc} data={data} library={library} sync={state} sendCue={project.sendCue} onRemote={project.onRemote} canLead={canLead} onClose={() => closeTab(id)} />;
}
