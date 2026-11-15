// Steckplan Player (/player): alle Projekte mit Texten sind beim Start verbunden (Texte geladen, bleiben aktuell);
// sichtbar ist das Textfenster des Projekts, in dem gerade geführt wird. Vor dem ersten Führen: „Bereit“ mit Netz und
// Netzprüfung; danach sieht das Publikum ohne Führen nur Bild bzw. Schwarz (Einstellung) – „Bereit“ zeigt dann
// Strg+Umschalt+I. Wechsel blenden weich.
import { useCallback, useEffect, useState } from 'react';
import { VERSION, worstCheck, type NetCheck, type PlayerCatalog } from '@steckplan/core';
import { api } from '../lib/api';
import { useFadeSwitch } from '../lib/fadeSwitch';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { LyricsPage } from './LyricsPage';

const t = texts.player;

interface PlayerNetwork {
  connected: boolean;
  addresses: { name: string; address: string }[];
  wifi?: string;
}

/** Netzwerk des Player-Rechners (nur im Steckplan Player, über dessen Preload) */
function usePlayerNetwork(): PlayerNetwork | null {
  const [network, setNetwork] = useState<PlayerNetwork | null>(null);
  useEffect(() => {
    const player = (globalThis as { steckplanPlayer?: { onNetwork?: (cb: (n: PlayerNetwork) => void) => () => void } }).steckplanPlayer;
    return player?.onNetwork?.((n) => setNetwork(n));
  }, []);
  return network;
}
/** Netzprüfung des Player-Rechners (nur im Steckplan Player; fehlt in älteren Playern) */
function usePlayerChecks(): NetCheck[] {
  const [checks, setChecks] = useState<NetCheck[]>([]);
  useEffect(() => {
    const player = (globalThis as { steckplanPlayer?: { onChecks?: (cb: (c: unknown) => void) => () => void } }).steckplanPlayer;
    return player?.onChecks?.((c) => setChecks(Array.isArray(c) ? (c as NetCheck[]) : []));
  }, []);
  return checks;
}

/** Neuere Version des Players (nur im Steckplan Player; fehlt in älteren Playern) */
function usePlayerUpdate(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const player = (globalThis as { steckplanPlayer?: { onUpdate?: (cb: (u: { version?: unknown } | null) => void) => () => void } }).steckplanPlayer;
    return player?.onUpdate?.((u) => setVersion(u && typeof u.version === 'string' ? u.version : null));
  }, []);
  return version;
}

/** Wer führt, falls ein Projekt nicht vorgeladen ist (neu angelegt) */
const STATE_POLL_MS = 2000;
const VERSION_RELOAD_KEY = 'steckplan.versionReloadAt';
/** zuletzt gezeigtes Projekt (übersteht das Neuladen der Seite: danach kein „Bereit“ vor Publikum) */
const LAST_SHOWN_KEY = 'steckplan.playerLastShown';

function readLastShown(): string | null {
  try {
    return sessionStorage.getItem(LAST_SHOWN_KEY);
  } catch {
    return null;
  }
}

/**
 * Wurde die Steuersoftware aktualisiert, läuft hier noch die alte Oberfläche: neu laden – aber nur, solange nichts
 * gezeigt wird (nicht mitten in der Vorstellung) und höchstens einmal je Minute (keine Schleife).
 */
export function shouldReloadForVersion(serverVersion: string | undefined, ownVersion: string, showing: boolean, lastReloadAt: number, now: number): boolean {
  if (!serverVersion || serverVersion === ownVersion || showing) return false;
  return now - lastReloadAt >= 60_000;
}

export function PlayerPage() {
  const name = useSession((s) => s.session?.name ?? '');
  const network = usePlayerNetwork();
  const checks = usePlayerChecks();
  const update = usePlayerUpdate();
  const [serverVersion, setServerVersion] = useState<string | undefined>(undefined);
  const [catalog, setCatalog] = useState<PlayerCatalog | null>(null);
  const [error, setError] = useState(false);
  const [serverLead, setServerLead] = useState<string | null>(null);
  // je Projekt: führt dort jemand? (live aus der Verbindung des Textfensters)
  const [leading, setLeading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    api
      .playerCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      void api
        .playerState()
        .then((s) => {
          if (!alive) return;
          setServerLead(s.leadProjectId);
          setServerVersion(s.version);
        })
        .catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, STATE_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.title = t.title;
  }, []);

  const onLead = useCallback((projectId: string, lead: boolean) => setLeading((current) => (current[projectId] === lead ? current : { ...current, [projectId]: lead })), []);

  const ids = catalog?.projects.map((p) => p.id) ?? [];
  if (serverLead && !ids.includes(serverLead)) ids.push(serverLead);
  // zuletzt gezeigtes Projekt (nach dem Neuladen) gleich wieder verbinden – sofern es noch Texte hat
  const [lastShown, setLastShown] = useState<string | null>(readLastShown);
  if (lastShown && !ids.includes(lastShown) && (!catalog || catalog.projects.some((p) => p.id === lastShown))) ids.push(lastShown);
  // live gemeldet geht vor; sonst laut Server
  const shown = ids.find((id) => leading[id]) ?? (serverLead && leading[serverLead] !== false ? serverLead : null);
  const media = catalog?.projects.reduce((n, p) => n + p.media.length, 0) ?? 0;

  // nach dem ersten Führen bleibt das Projekt sichtbar (ohne Text); „Bereit“ nur auf Wunsch (Strg+Umschalt+I)
  if (shown && shown !== lastShown) setLastShown(shown);
  useEffect(() => {
    try {
      if (lastShown) sessionStorage.setItem(LAST_SHOWN_KEY, lastShown);
    } catch {
      // ohne Speicher: nach dem Neuladen wieder „Bereit“
    }
  }, [lastShown]);
  const active = shown ?? (lastShown && ids.includes(lastShown) ? lastShown : null);
  // (ids enthält lastShown nur, solange es das Projekt mit Texten noch gibt)
  const [info, setInfo] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setInfo((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const ready = useFadeSwitch(!active || info ? 'ready' : 'hidden', 800);

  const showing = shown !== null;
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(VERSION_RELOAD_KEY)) || 0;
      if (!shouldReloadForVersion(serverVersion, VERSION, showing, last, Date.now())) return;
      sessionStorage.setItem(VERSION_RELOAD_KEY, String(Date.now()));
    } catch {
      // ohne Speicher kein Neuladen (sonst droht eine Schleife)
      return;
    }
    window.location.reload();
  }, [serverVersion, showing]);

  return (
    <div className="dark fixed inset-0 cursor-none overflow-hidden bg-black text-slate-100 select-none" data-testid="player-page">
      {ids.map((id) => (
        <LyricsPage key={id} id={id} player={{ visible: id === active, onLead }} />
      ))}
      {ready.shown === 'ready' && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black text-center transition-opacity duration-700 ease-in-out ${ready.visible ? 'steckplan-fade-in opacity-100' : 'opacity-0'}`}
          data-testid="player-ready"
        >
          <img src="/icon.png" alt="" className="mb-[2vh] h-[14vw] w-[14vw] drop-shadow-[0_0_3vw_rgb(56_189_248/0.25)]" data-testid="player-logo" />
          <div className="flex items-center gap-4 text-[5vw] font-semibold text-emerald-400">
            <span className="inline-block h-[3vw] w-[3vw] rounded-full bg-emerald-500 shadow-[0_0_2vw_rgb(16_185_129/0.7)]" aria-hidden />
            {error ? t.notReady : t.ready}
          </div>
          <p className="text-[1.6vw] text-slate-400">{catalog ? t.loaded(catalog.projects.length, media) : error ? t.catalogError : t.loading}</p>
          <p className="text-[1.3vw] text-slate-500">{active ? t.infoHint : t.waiting}</p>
          {checks.length > 0 && <ReadyChecks checks={checks} />}
          <div className="absolute bottom-[3vh] flex flex-col items-center gap-[0.8vh]">
            {network && (
              <p className="flex flex-wrap justify-center gap-x-[2vw] gap-y-[0.5vh] text-[1.25vw] text-slate-400" data-testid="player-network">
                <span className="flex items-center gap-[0.5vw]">
                  <span className={`inline-block h-[0.8vw] w-[0.8vw] rounded-full ${network.connected ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden />
                  <b className="font-semibold text-slate-200">{network.connected ? t.networkConnected : t.networkNone}</b>
                </span>
                {network.wifi && (
                  <span>
                    {t.wifi}: <b className="font-semibold text-slate-200">{network.wifi}</b>
                  </span>
                )}
                {network.addresses.map((a) => (
                  <span key={`${a.name}-${a.address}`}>
                    IP {a.name}: <b className="font-semibold text-slate-200">{a.address}</b>
                  </span>
                ))}
              </p>
            )}
            {update && (
              <p className="text-[1.25vw] text-sky-400" data-testid="player-update">
                {t.updateAvailable(update)}
              </p>
            )}
            {name && <p className="text-[1.1vw] text-slate-600">{name}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** „Bereit“: Netzprüfung – Zusammenfassung, Hinweise und Probleme mit Tipp */
function ReadyChecks({ checks }: { checks: NetCheck[] }) {
  const worst = worstCheck(checks);
  const issues = checks.filter((c) => c.state !== 'ok');
  const dot = { ok: 'bg-emerald-500', warn: 'bg-amber-400', bad: 'bg-red-500' } as const;
  return (
    <div className="mt-[1vh] max-w-[70vw] text-left text-[1.2vw]" data-testid="player-ready-checks" data-state={worst}>
      <p className="flex items-center justify-center gap-[0.6vw] text-slate-300">
        <span className={`inline-block h-[0.9vw] w-[0.9vw] rounded-full ${dot[worst]}`} aria-hidden />
        {issues.length ? t.checksIssues(issues.length) : t.checksOk}
        <span className="text-slate-500">· {checks.map((c) => c.text).join(' · ')}</span>
      </p>
      {issues.map((c) => (
        <p key={c.id} className="mt-[0.8vh] flex gap-[0.6vw]" data-testid="player-ready-check" data-state={c.state}>
          <span className={`mt-[0.35vw] inline-block h-[0.8vw] w-[0.8vw] shrink-0 rounded-full ${dot[c.state]}`} aria-hidden />
          <span>
            <b className="font-semibold text-slate-100">{c.text}</b>
            {c.tip && <span className="block text-[0.95vw] text-slate-400">{c.tip}</span>}
          </span>
        </p>
      ))}
    </div>
  );
}
