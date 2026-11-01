// Änderungsprotokoll des Projekts (wer, wann, was) – neueste zuerst, aktualisiert sich regelmäßig.
import { useCallback, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useLoader } from '../../lib/useLoader';
import { texts } from '../../texts';
import { AccessBadge, Banner, Button, Spinner } from '../ui';

const REFRESH_MS = 15_000;
const t = texts.changeLog;

export function ChangeLogView({ projectId }: { projectId: string }) {
  const load = useCallback(() => api.getChangeLog(projectId).then((r) => r.entries), [projectId]);
  const { data: entries, error, reload } = useLoader(load);

  useEffect(() => {
    const timer = window.setInterval(reload, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-slate-500 dark:text-slate-400">{t.hint}</p>
        <Button variant="ghost" onClick={reload}>
          {t.refresh}
        </Button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {!entries && !error && <Spinner />}
      {entries && entries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t.empty}</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900" data-testid="changelog">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{formatDateTime(entry.at)}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{entry.by}</span>
                <AccessBadge access={entry.access} />
                <span>{t.via[entry.via] ?? entry.via}</span>
              </div>
              <div className="mt-0.5 break-words">{entry.action}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
