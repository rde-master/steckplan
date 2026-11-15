// Führen, rechts neben dem Player: aktuelle Uhrzeit und voraussichtliches Ende der Vorstellung (jetzt + Rest des
// laufenden Eintrags + Dauer der folgenden). Mit Anfangszeit im Ablauf auch das geplante Ende und die Abweichung.
// Jede Sekunde neu; feste Ziffernbreite, damit nichts springt.
import { useEffect, useState } from 'react';
import { clockDiffMinutes, plannedEndMinutes, remainingShow, type ShowItem, type ShowSettings } from '@steckplan/core';
import type { TimeSource } from '../../lib/playerTime';
import { texts } from '../../texts';

const t = texts.regie.performance;

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const hms = (d: Date) => `${hm(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
const fromMinutes = (minutes: number) => {
  const m = Math.round(minutes) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** „5 min“ bzw. „1 h 05 min“ */
export function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** jede Sekunde (an der vollen Sekunde) die Uhrzeit */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

export function ShowClock({ items, itemId, source, settings }: { items: ShowItem[]; itemId: string | undefined; source: TimeSource; settings: ShowSettings }) {
  const now = useNow();
  const { remainingSec, missingDurations } = remainingShow(items, itemId, source.currentTime);
  const end = new Date(now.getTime() + remainingSec * 1000);
  const planned = plannedEndMinutes(items, settings);
  const diff = planned === undefined ? undefined : Math.round(clockDiffMinutes(end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60, planned));
  return (
    <div className="flex shrink-0 items-end gap-5 pb-1 text-right" data-testid="show-clock">
      <div className="flex flex-col items-end">
        <span className="text-xs text-slate-500">{t.clockNow}</span>
        <span className="text-3xl font-semibold text-slate-100 tabular-nums" data-testid="show-clock-now">
          {hms(now)}
        </span>
      </div>
      <div className="flex flex-col items-end" title={t.expectedEndHint}>
        <span className="text-xs text-slate-500">{t.expectedEnd}</span>
        <span className="text-3xl font-semibold text-sky-300 tabular-nums" data-testid="show-clock-end">
          {hm(end)}
        </span>
        {(planned !== undefined || missingDurations > 0) && (
          <span className="text-xs tabular-nums" data-testid="show-clock-plan">
            {planned !== undefined && (
              <span className="text-slate-400">
                {t.plannedEnd(fromMinutes(planned))}
                {diff !== undefined && (
                  <span className={diff > 1 ? 'font-semibold text-amber-300' : diff < -1 ? 'font-semibold text-emerald-300' : 'text-slate-400'} data-testid="show-clock-diff">
                    {' · '}
                    {diff === 0 ? t.onTime : `${diff > 0 ? '+' : '−'}${formatMinutes(Math.abs(diff))}`}
                  </span>
                )}
              </span>
            )}
            {missingDurations > 0 && (
              <span className="ml-1 text-amber-300" title={t.missingDurationsHint}>
                {t.missingDurations(missingDurations)}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
