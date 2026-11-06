// Kopf einer Szenenfolge in der Vorstellung (Licht und Ton): links die aktuelle Szene mit Startpunkt und wie lange
// sie schon läuft, rechts die nächste mit Startpunkt und Countdown; darunter ein grüner Balken bis zur nächsten.
import { texts } from '../../texts';
import { formatSceneClock } from './ScenesSection';

const t = texts.regie.performance;

export interface SceneMark {
  number: number;
  name: string;
  /** Startpunkt (Sekunden), falls bekannt */
  at: number | undefined;
}

export function SceneProgress({ current, next, time, nextItemTitle, testPrefix }: { current: SceneMark | undefined; next: SceneMark | undefined; time: number; nextItemTitle: string | undefined; testPrefix: string }) {
  const elapsed = current?.at !== undefined && time >= current.at ? time - current.at : undefined;
  const countdown = next?.at !== undefined && next.at > time ? next.at - time : undefined;
  const span = current?.at !== undefined && next?.at !== undefined && next.at > current.at ? next.at - current.at : undefined;
  const progress = span !== undefined && elapsed !== undefined ? Math.min(1, elapsed / span) : undefined;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.currentScene}</span>
          {current ? (
            <>
              <span className="text-xl font-semibold" data-testid={`${testPrefix}-scene`}>
                {current.number}. {current.name || '–'}
              </span>
              {current.at !== undefined && <span className="tabular-nums text-slate-400">{formatSceneClock(current.at)}</span>}
              {elapsed !== undefined && (
                <span className="tabular-nums text-emerald-400" data-testid={`${testPrefix}-elapsed`}>
                  {t.running(formatSceneClock(elapsed))}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500">–</span>
          )}
        </div>
        <div className="text-right text-sm text-slate-300" data-testid={`${testPrefix}-next`}>
          {next ? (
            <>
              <div>{t.nextScene(`${next.number}. ${next.name || '–'}`)}</div>
              <div className="tabular-nums">
                {next.at !== undefined && <span className="text-slate-400">{t.startsAt(formatSceneClock(next.at))}</span>}
                {countdown !== undefined && (
                  <span className="ml-2 text-lg font-semibold text-amber-400" data-testid={`${testPrefix}-countdown`}>
                    −{formatSceneClock(countdown)}
                  </span>
                )}
              </div>
            </>
          ) : nextItemTitle !== undefined ? (
            t.nextItem(nextItemTitle)
          ) : (
            t.end
          )}
        </div>
      </div>
      {/* grüner Balken: Fortschritt bis zur nächsten Szene */}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        {progress !== undefined && <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} data-testid={`${testPrefix}-progress`} data-progress={progress.toFixed(2)} />}
      </div>
    </div>
  );
}
