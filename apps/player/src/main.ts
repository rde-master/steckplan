// Steckplan Player: startet im Vollbild (und trägt sich in den Autostart ein), sucht die Steuersoftware im Netz,
// koppelt sich einmal (Code im Führen-Bildschirm bestätigen), lädt Texte und alle Bilder/Videos des Textfensters
// und zeigt dann „Bereit“ bzw. das Textfenster des Projekts, in dem geführt wird. Medien kommen danach nur noch aus
// dem eigenen Zwischenspeicher. Lebenszeichen jede Sekunde: Stand an den Führen-Bildschirm, „Neu synchronisieren“ zurück.
// Bleiben die Lebenszeichen aus (WLAN), bleibt das Textfenster stehen (es verbindet sich selbst neu); im Hintergrund
// wird nachgesehen, ob die Steuersoftware unter einer anderen Adresse antwortet – nur dann wird die Seite neu geladen.
import { join } from 'node:path';
import { hostname } from 'node:os';
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, powerSaveBlocker, protocol, screen, session } from 'electron';
import { checkForUpdate, evaluateNet, PLAYER_COOKIE, PLAYER_HEARTBEAT_MS, VERSION, type LatencySample, type NetCheck, type PlayerCatalog, type PlayerHeartbeatReply, type PlayerReport, type UpdateInfo } from '@steckplan/core';
import { MediaCache, MediaUnavailableError } from './cache';
import { ConfigStore } from './config';
import { DiscoveryClient, parseAddress, type FoundServer } from './discovery';
import { networkInfo, wifiPowerSave, type NetworkInfo } from './network';

const MEDIA_SCHEME = 'steckplan-media';
protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }]);
// Videos ohne Klick abspielen
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// nicht drosseln, wenn ein anderes Fenster (Meldung, Update-Hinweis) den Player verdeckt – sonst steht der Text
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const env = process.env;
if (env.STECKPLAN_PLAYER_USER_DATA) app.setPath('userData', env.STECKPLAN_PLAYER_USER_DATA);
const isSmokeTest = env.STECKPLAN_SMOKE_TEST === '1';
const windowed = env.STECKPLAN_PLAYER_WINDOWED === '1' || isSmokeTest;
const deviceName = (env.STECKPLAN_PLAYER_NAME || hostname() || 'Player').slice(0, 60);
const discoveryPort = env.STECKPLAN_DISCOVERY_PORT ? Number(env.STECKPLAN_DISCOVERY_PORT) : undefined;
/** Ohne Lebenszeichen-Antwort so lange → neu suchen (bei gezeigtem Textfenster: still im Hintergrund) */
const SILENT_SEARCH_MS = 8000;
/** stille Suche: so oft die Adressen fragen */
const QUIET_PROBE_MS = 3000;
/** so lange nach dem ersten Fund warten, ob weitere antworten */
const CHOOSE_DELAY_MS = 2500;
const RETRY_MS = 8000;

type ViewState =
  | { screen: 'searching'; found: FoundServer[]; choose: boolean; error?: string }
  | { screen: 'connecting'; server: FoundServer }
  | { screen: 'pairing'; server: FoundServer; code: string }
  | { screen: 'syncing'; server: FoundServer; phase: 'texts' | 'media' | 'images'; done: number; total: number; bytesDone: number; bytesTotal: number; current?: string }
  | { screen: 'error'; message: string };

class Cancelled extends Error {}

/**
 * Verkleinert Bilder in einem unsichtbaren Fenster (Bildfunktionen des Browsers: beachten die Drehung von Handyfotos,
 * rechnen außerhalb des Hauptprozesses). Das Fenster gibt es nur während des Synchronisierens.
 */
class ImageResizer {
  private win: BrowserWindow | null = null;
  private seq = 0;
  private readonly pending = new Map<number, (data: Uint8Array | null) => void>();

  constructor() {
    ipcMain.on('player:resized', (_e, id: unknown, data: unknown) => {
      const done = typeof id === 'number' ? this.pending.get(id) : undefined;
      if (!done) return;
      this.pending.delete(id as number);
      done(data instanceof Uint8Array ? data : null);
    });
  }

  private async window(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { preload: join(__dirname, 'resizer.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
    await win.loadFile(join(__dirname, 'resizer.html'));
    this.win = win;
    return win;
  }

  async resize(data: Buffer, mime: string, width: number, height: number): Promise<Uint8Array | null> {
    const win = await this.window();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, 30_000);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      win.webContents.send('player:resize', { id, data, mime, width, height });
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

const baseUrl = (s: Pick<FoundServer, 'host' | 'port'>) => `http://${s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}`;
const isLoopback = (host: string) => host === '127.0.0.1' || host === '::1' || host === 'localhost';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Player {
  private view: ViewState = { screen: 'searching', found: [], choose: false };
  private readonly found = new Map<string, FoundServer>();
  private discovery: DiscoveryClient | null = null;
  private server: FoundServer | null = null;
  private token: string | null = null;
  private generation = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** zuletzt beantwortetes Lebenszeichen */
  private lastBeat = 0;
  private beating = false;
  private quiet: { discovery: DiscoveryClient; timer: ReturnType<typeof setInterval> } | null = null;
  private syncing = false;
  private showingPage = false;
  private choose: ((server: FoundServer) => void) | null = null;
  private report: PlayerReport = { phase: 'syncing', version: VERSION, projects: 0, mediaDone: 0, mediaTotal: 0, bytesDone: 0, bytesTotal: 0 };
  private lastViewSent = 0;
  private readonly resizer = new ImageResizer();

  constructor(
    private readonly win: BrowserWindow,
    private readonly config: ConfigStore,
    private readonly cache: MediaCache,
  ) {}

  get state(): ViewState & { device: string; version: string } {
    return { ...this.view, device: deviceName, version: VERSION };
  }

  // ---------- Anzeige ----------

  private setView(view: ViewState, throttle = false): void {
    this.view = view;
    const now = Date.now();
    if (throttle && now - this.lastViewSent < 200) return;
    this.lastViewSent = now;
    if (!this.showingPage) this.win.webContents.send('player:state', this.state);
  }

  private async showStatus(): Promise<void> {
    if (!this.showingPage && this.win.webContents.getURL().startsWith('file:')) return;
    this.showingPage = false;
    await this.win.loadFile(join(__dirname, 'status.html'));
  }

  private async showPage(): Promise<void> {
    if (!this.server) return;
    this.showingPage = true;
    await this.win.loadURL(`${baseUrl(this.server)}/player`).catch(() => undefined);
  }

  /** Seite neu laden (nach einem Absturz der Anzeige bzw. wenn sie nicht geladen werden konnte) */
  async reloadView(): Promise<void> {
    if (this.showingPage) await this.showPage();
    else {
      this.showingPage = true; // erzwingt das Laden der Statusseite
      await this.showStatus();
    }
  }

  get pageShown(): boolean {
    return this.showingPage;
  }

  /** Netzprüfung fürs Lebenszeichen (Führen-Bildschirm) */
  setChecks(checks: NetCheck[]): void {
    this.report = { ...this.report, checks };
  }

  /** Wessen Laufzeit gemessen wird: verbunden, sonst gefunden, sonst zuletzt genutzt */
  get latencyTarget(): { host: string; port: number } | null {
    return this.server ?? [...this.found.values()][0] ?? this.config.config.lastServer ?? null;
  }

  // ---------- Ablauf ----------

  /** (Neu) beginnen: suchen, verbinden, koppeln, laden, anzeigen */
  async start(options: { forceChoose?: boolean } = {}): Promise<void> {
    const gen = ++this.generation;
    this.stopHeartbeat();
    this.stopQuietSearch();
    this.choose = null;
    await this.showStatus();
    try {
      const server = await this.search(gen, options.forceChoose === true);
      this.check(gen);
      await this.connect(server, gen);
    } catch (error) {
      if (error instanceof Cancelled || gen !== this.generation) return;
      this.fail((error as Error).message, gen);
    }
  }

  private check(gen: number): void {
    if (gen !== this.generation) throw new Cancelled();
  }

  private fail(message: string, gen: number): void {
    this.report = { ...this.report, phase: 'error', error: message };
    this.setView({ screen: 'error', message });
    setTimeout(() => {
      if (gen === this.generation) void this.start();
    }, RETRY_MS);
  }

  private search(gen: number, forceChoose: boolean): Promise<FoundServer> {
    this.found.clear();
    this.setView({ screen: 'searching', found: [], choose: forceChoose });
    return new Promise<FoundServer>((resolve) => {
      let firstFound = 0;
      let decideTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (server: FoundServer) => {
        if (gen !== this.generation) return;
        this.discovery?.stop();
        this.discovery = null;
        if (decideTimer) clearTimeout(decideTimer);
        this.choose = null;
        resolve(server);
      };
      this.choose = finish;
      const decide = () => {
        if (gen !== this.generation) return;
        const list = [...this.found.values()];
        if (!forceChoose) {
          // schon gekoppelt: sofort; zuletzt genutzt: bevorzugt; nur einer: nach kurzer Wartezeit
          const paired = list.find((s) => this.config.config.tokens[s.id] && s.id === this.config.config.lastServer?.id) ?? list.find((s) => this.config.config.tokens[s.id]);
          if (paired) return finish(paired);
          // (Zeitgeber laufen nach einer anderen Uhr als Date.now() und kommen evtl. eine Millisekunde früher)
          if (list.length === 1 && Date.now() - firstFound >= CHOOSE_DELAY_MS - 50) return finish(list[0]!);
        }
        this.setView({ screen: 'searching', found: list, choose: forceChoose || list.length > 1 });
        if (list.length === 1 && !forceChoose && !decideTimer) {
          decideTimer = setTimeout(() => {
            decideTimer = null;
            decide();
          }, Math.max(0, CHOOSE_DELAY_MS - (Date.now() - firstFound)));
        }
      };
      const add = (server: FoundServer) => {
        if (gen !== this.generation) return;
        const existing = this.found.get(server.id);
        // eine Adresse im Netz geht vor „dieser Rechner“
        if (existing && !(isLoopback(existing.host) && !isLoopback(server.host))) return;
        if (!firstFound) firstFound = Date.now();
        this.found.set(server.id, server);
        decide();
      };
      // jede Antwort-Adresse erst prüfen: die Oberfläche lauscht evtl. nur auf einer Adresse (z. B. Weboberfläche)
      const checked = new Map<string, number>();
      const verify = (server: FoundServer) => {
        const key = `${server.host}:${server.port}`;
        const last = checked.get(key);
        if (last !== undefined && Date.now() - last < 10_000) return;
        checked.set(key, Date.now());
        void probe(server).then((ok) => {
          if (ok && ok.id === server.id) add({ ...server, name: server.name || ok.name });
        });
      };
      this.discovery = new DiscoveryClient(verify, discoveryPort);
      void this.discovery.start();
      // zuletzt genutzte bzw. vorgegebene Adresse direkt fragen (z. B. Docker, wo der Rundruf nicht ankommt)
      const direct = [this.config.config.lastServer, env.STECKPLAN_PLAYER_SERVER ? parseAddress(env.STECKPLAN_PLAYER_SERVER) : null].filter((x): x is { host: string; port: number } => !!x);
      for (const address of direct) void probe(address).then((s) => s && add(s));
    });
  }

  /** Adresse von Hand (Statusseite) */
  async manual(text: string): Promise<void> {
    const address = parseAddress(text);
    const server = address ? await probe(address) : null;
    if (!server) {
      if (this.view.screen === 'searching') this.setView({ ...this.view, error: `Unter „${text}“ antwortet keine Steckplan-Steuersoftware.` });
      return;
    }
    if (this.choose) this.choose(server);
    else {
      this.found.set(server.id, server);
      void this.start();
    }
  }

  chooseFound(id: string): void {
    const server = this.found.get(id);
    if (server && this.choose) this.choose(server);
  }

  private async connect(server: FoundServer, gen: number): Promise<void> {
    this.server = server;
    this.setView({ screen: 'connecting', server });
    let token = this.config.config.tokens[server.id];
    if (!token) {
      token = await this.pair(server, gen);
      await this.config.setToken(server.id, token);
    }
    this.check(gen);
    this.token = token;
    const res = await fetch(`${baseUrl(server)}/api/auth/session`, { headers: this.headers(), signal: AbortSignal.timeout(8000) });
    if (res.status === 401) {
      // Schlüssel nicht mehr gültig (entfernt) → neu koppeln
      await this.config.setToken(server.id, undefined);
      return this.connect(server, gen);
    }
    if (!res.ok) throw new Error(`Die Steuersoftware antwortet nicht wie erwartet (${res.status}).`);
    await session.defaultSession.cookies.set({ url: baseUrl(server), name: PLAYER_COOKIE, value: token, httpOnly: true, sameSite: 'strict', expirationDate: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600 });
    await this.config.update({ lastServer: { id: server.id, host: server.host, port: server.port } });
    this.check(gen);
    this.startHeartbeat(gen);
    await this.sync(gen);
    this.check(gen);
    await this.showPage();
  }

  /** Kopplung anfragen, Code zeigen, auf „Zulassen“ warten */
  private async pair(server: FoundServer, gen: number): Promise<string> {
    const base = baseUrl(server);
    for (;;) {
      this.check(gen);
      const res = await fetch(`${base}/api/player/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: deviceName, deviceId: this.config.config.deviceId }), signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Kopplung nicht möglich (${res.status}).`);
      const { requestId, code } = (await res.json()) as { requestId: string; code: string };
      this.setView({ screen: 'pairing', server, code });
      for (;;) {
        await sleep(1500);
        this.check(gen);
        const poll = await fetch(`${base}/api/player/pair/${encodeURIComponent(requestId)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (!poll) continue;
        if (poll.status === 404) break; // abgelaufen → neu anfragen
        const state = (await poll.json()) as { state: string; token?: string };
        if (state.state === 'approved' && state.token) return state.token;
        if (state.state === 'rejected') throw new Error('Die Kopplung wurde im Führen-Bildschirm abgelehnt.');
      }
    }
  }

  private headers(): Record<string, string> {
    return this.token ? { cookie: `${PLAYER_COOKIE}=${this.token}` } : {};
  }

  /** Texte (Katalog) und Medien laden */
  private async sync(gen: number): Promise<void> {
    const server = this.server!;
    const base = baseUrl(server);
    this.syncing = true;
    try {
      this.report = { ...this.report, phase: 'syncing', error: undefined };
      this.setView({ screen: 'syncing', server, phase: 'texts', done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
      const res = await fetch(`${base}/api/player/catalog`, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Texte konnten nicht geladen werden (${res.status}).`);
      const catalog = (await res.json()) as PlayerCatalog;
      this.check(gen);
      const plan = await this.cache.plan(catalog);
      let done = plan.ready;
      let bytesDone = plan.bytesReady;
      const progress = (current?: string) => {
        this.report = { ...this.report, projects: catalog.projects.length, mediaDone: done, mediaTotal: plan.total, bytesDone, bytesTotal: plan.bytesTotal };
        this.setView({ screen: 'syncing', server, phase: 'media', done, total: plan.total, bytesDone, bytesTotal: plan.bytesTotal, ...(current ? { current } : {}) }, true);
      };
      progress();
      // fehlt eine Datei beim Server, die übrigen trotzdem laden (Netzfehler brechen weiter ab → neuer Versuch)
      const missing = new Set<string>();
      for (const item of plan.todo) {
        this.check(gen);
        progress(item.media.name);
        try {
          await this.cache.download(
            item,
            () => fetch(`${base}/api/projects/${encodeURIComponent(item.projectId)}/media/${encodeURIComponent(item.media.id)}`, { headers: this.headers() }),
            (n) => {
              bytesDone += n;
              progress(item.media.name);
            },
          );
          done++;
        } catch (error) {
          // kommt vor dem ersten Byte – am Fortschritt ist nichts zurückzunehmen
          if (!(error instanceof MediaUnavailableError)) throw error;
          missing.add(error.message);
        }
      }
      progress();
      // große Bilder auf Bildschirmgröße verkleinern (einmal je Bild und Bildschirm)
      const target = this.screenSize();
      try {
        await this.cache.prepareScreens(
          `${target.width}x${target.height}`,
          (data, mime) => this.resizer.resize(data, mime, target.width, target.height),
          (_file, n, total) => {
            this.check(gen);
            this.setView({ screen: 'syncing', server, phase: 'images', done: n, total, bytesDone, bytesTotal: plan.bytesTotal }, true);
          },
        );
      } finally {
        this.resizer.close();
      }
      await this.cache.cleanup(catalog);
      const error = missing.size ? `${missing.size === 1 ? 'Nicht geladen' : `${missing.size} Dateien nicht geladen`}: ${[...missing].join(' ')}` : undefined;
      this.report = { ...this.report, phase: 'ready', mediaDone: done, bytesDone, syncedAt: new Date().toISOString(), error };
      void this.sendHeartbeat(gen);
    } catch (error) {
      if (!(error instanceof Cancelled)) this.report = { ...this.report, phase: 'error', error: (error as Error).message };
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  /** Bildschirm des Players in Pixeln (für die Bildschirmfassung der Bilder) */
  private screenSize(): { width: number; height: number } {
    const display = screen.getDisplayMatching(this.win.getBounds());
    const width = Math.round(display.size.width * display.scaleFactor);
    const height = Math.round(display.size.height * display.scaleFactor);
    return width > 0 && height > 0 ? { width, height } : { width: 1920, height: 1080 };
  }

  /** „Neu synchronisieren“ aus dem Führen-Bildschirm (bzw. Strg+Umschalt+R) */
  async resync(): Promise<void> {
    if (this.syncing || !this.server) return;
    const gen = this.generation;
    try {
      await this.showStatus();
      await this.sync(gen);
      this.check(gen);
      await this.showPage();
    } catch (error) {
      if (error instanceof Cancelled || gen !== this.generation) return;
      this.fail((error as Error).message, gen);
    }
  }

  // ---------- Lebenszeichen ----------

  private startHeartbeat(gen: number): void {
    this.stopHeartbeat();
    this.lastBeat = Date.now();
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(gen), PLAYER_HEARTBEAT_MS);
    void this.sendHeartbeat(gen);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async sendHeartbeat(gen: number): Promise<void> {
    if (!this.server || gen !== this.generation || this.beating) return;
    // nie mehrere gleichzeitig (bei schlechtem WLAN dauert eine Antwort länger als der Abstand)
    this.beating = true;
    try {
      await this.heartbeat(gen);
    } finally {
      this.beating = false;
    }
  }

  private async heartbeat(gen: number): Promise<void> {
    if (!this.server) return;
    try {
      const res = await fetch(`${baseUrl(this.server)}/api/player/heartbeat`, { method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(this.report), signal: AbortSignal.timeout(5000) });
      if (gen !== this.generation) return;
      if (res.status === 401) {
        // entfernt → neu koppeln
        await this.config.setToken(this.server.id, undefined);
        void this.start();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      this.lastBeat = Date.now();
      this.stopQuietSearch();
      const reply = (await res.json()) as PlayerHeartbeatReply;
      if (reply.resync) void this.resync();
    } catch {
      if (gen !== this.generation || Date.now() - this.lastBeat < SILENT_SEARCH_MS) return;
      // Steuersoftware nicht erreichbar (Netz, beendet, neue Adresse). Zeigt der Player gerade das Textfenster, bleibt
      // es stehen (es verbindet sich selbst neu) und es wird still gesucht; sonst neu beginnen (Statusseite).
      if (this.showingPage && !this.syncing) this.startQuietSearch(gen);
      else if (!this.syncing) void this.start();
    }
  }

  /** Steuersoftware still suchen (gleiche Kennung, evtl. neue Adresse); das Textfenster bleibt dabei sichtbar */
  private startQuietSearch(gen: number): void {
    if (this.quiet || !this.server) return;
    const id = this.server.id;
    const check = (found: FoundServer | null) => {
      if (!found || found.id !== id || gen !== this.generation || !this.quiet || !this.server) return;
      if (found.host === this.server.host && found.port === this.server.port) return; // gleiche Adresse: Lebenszeichen kommen von selbst wieder
      this.stopQuietSearch();
      void this.moveTo(found, gen);
    };
    const discovery = new DiscoveryClient((s) => void probe(s).then((ok) => check(ok && { ...s, name: s.name || ok.name })), discoveryPort);
    void discovery.start();
    const timer = setInterval(() => {
      if (this.server) void probe(this.server).then(check);
    }, QUIET_PROBE_MS);
    this.quiet = { discovery, timer };
  }

  private stopQuietSearch(): void {
    if (!this.quiet) return;
    this.quiet.discovery.stop();
    clearInterval(this.quiet.timer);
    this.quiet = null;
  }

  /** Steuersoftware unter neuer Adresse: Schlüssel dort hinterlegen und das Textfenster von dort laden */
  private async moveTo(server: FoundServer, gen: number): Promise<void> {
    if (!this.token) return void this.start();
    this.server = server;
    try {
      await session.defaultSession.cookies.set({ url: baseUrl(server), name: PLAYER_COOKIE, value: this.token, httpOnly: true, sameSite: 'strict', expirationDate: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600 });
      await this.config.update({ lastServer: { id: server.id, host: server.host, port: server.port } });
    } catch {
      // Speichern egal – geladen wird trotzdem
    }
    if (gen !== this.generation) return;
    this.lastBeat = Date.now();
    await this.showPage();
  }

  // ---------- Medien aus dem Zwischenspeicher ----------

  async media(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [projectId, mediaId] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (!projectId || !mediaId) return new Response(null, { status: 404 });
    const cached = this.cache.respond(projectId, mediaId, request.headers.get('range'));
    if (cached) return cached;
    // noch nicht geladen (z. B. nach dem Start neu hinzugekommen): vom Server
    if (!this.server) return new Response(null, { status: 404 });
    const range = request.headers.get('range');
    return fetch(`${baseUrl(this.server)}/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}`, { headers: { ...this.headers(), ...(range ? { range } : {}) } });
  }
}

/** Laufzeit zur Steuersoftware: einige Anfragen hintereinander */
async function measure(address: { host: string; port: number }, count = 10): Promise<LatencySample> {
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const ok = await fetch(`${baseUrl(address)}/api/player/info`, { signal: AbortSignal.timeout(2000), cache: 'no-store' })
      .then((r) => r.ok && r.arrayBuffer().then(() => true))
      .catch(() => false);
    if (ok) times.push(performance.now() - started);
    await sleep(150);
  }
  return {
    sent: count,
    answered: times.length,
    ...(times.length ? { avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), maxMs: Math.round(Math.max(...times)) } : {}),
  };
}

/** Antwortet unter der Adresse eine Steckplan-Steuersoftware? */
async function probe(address: { host: string; port: number }): Promise<FoundServer | null> {
  try {
    const res = await fetch(`${baseUrl(address)}/api/player/info`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const info = (await res.json()) as { id?: unknown; name?: unknown; mode?: unknown };
    if (typeof info.id !== 'string') return null;
    return { app: 'steckplan', v: 1, id: info.id, name: typeof info.name === 'string' ? info.name : '', port: address.port, mode: info.mode === 'desktop' ? 'desktop' : 'standalone', version: '', host: address.host };
  } catch {
    return null;
  }
}

async function runSmokeTest(win: BrowserWindow): Promise<void> {
  const timer = setTimeout(() => {
    console.error('Smoke-Test: Zeitüberschreitung');
    app.exit(1);
  }, 30_000);
  // auf die Statusseite (Suche) warten
  for (let i = 0; i < 100; i++) {
    const screen = (await win.webContents.executeJavaScript(`document.querySelector('[data-testid=player-status]')?.dataset.screen ?? ''`).catch(() => '')) as string;
    if (screen) {
      clearTimeout(timer);
      console.log(`Smoke-Test: OK – Statusseite „${screen}“`);
      app.exit(0);
      return;
    }
    await sleep(200);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // in den Autostart (nur das installierte Programm)
    if (app.isPackaged && env.STECKPLAN_PLAYER_NO_AUTOSTART !== '1') app.setLoginItemSettings({ openAtLogin: true });
    // Bildschirm nicht abschalten
    powerSaveBlocker.start('prevent-display-sleep');
    // und den Rechner nicht schlafen legen (sonst reißt auch das WLAN ab)
    powerSaveBlocker.start('prevent-app-suspension');

    const config = new ConfigStore(app.getPath('userData'));
    await config.load();
    const cache = new MediaCache(join(app.getPath('userData'), 'media'));
    await cache.load();

    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      fullscreen: !windowed,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      title: 'Steckplan Player',
      show: !isSmokeTest,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Fenster zu → Programm beenden (auch wenn gerade das unsichtbare Fenster zum Verkleinern offen ist)
    win.on('closed', () => app.quit());
    const player = new Player(win, config, cache);
    // Anzeige abgestürzt bzw. Seite nicht geladen (Netz): nach kurzer Pause neu laden – nie eine Fehlerseite stehen lassen
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const reloadSoon = (ms: number) => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        if (!win.isDestroyed()) void player.reloadView();
      }, ms);
    };
    win.webContents.on('render-process-gone', (_e, details) => {
      if (details.reason !== 'clean-exit') reloadSoon(500);
    });
    // hängt die Anzeige länger, neu laden – antwortet sie vorher wieder, nicht
    win.webContents.on('unresponsive', () => reloadSoon(10_000));
    win.webContents.on('responsive', () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = null;
    });
    win.webContents.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => {
      // -3: abgebrochen (eine neue Seite wird geladen)
      if (isMainFrame && code !== -3 && player.pageShown) reloadSoon(2000);
    });

    protocol.handle(MEDIA_SCHEME, (request) => player.media(request));
    ipcMain.handle('player:state', () => player.state);
    ipcMain.handle('player:choose', (_e, id: unknown) => {
      if (typeof id === 'string') player.chooseFound(id);
    });
    ipcMain.handle('player:manual', (_e, address: unknown) => (typeof address === 'string' ? player.manual(address) : undefined));
    ipcMain.handle('player:retry', () => player.start());

    // Netzwerk (verbunden?, IP, WLAN, Signal, Band) für Statusseite und „Bereit“ – alle 10 s, bei Änderung an die Seite
    let network: NetworkInfo = { connected: false, addresses: [] };
    // Netzprüfung: Netzwerk, Energiesparen des WLAN-Adapters, Akku, Laufzeit zur Steuersoftware
    let power: { ac?: number; dc?: number } = {};
    let latency: LatencySample | undefined;
    let checks: NetCheck[] = [];
    ipcMain.handle('player:network', () => network);
    ipcMain.handle('player:checks', () => checks);
    const onBattery = () => {
      try {
        return powerMonitor.isOnBatteryPower();
      } catch {
        return false;
      }
    };
    const updateChecks = () => {
      const next = evaluateNet({ connected: network.connected, wired: network.wired === true, ...(network.wifi ? { wifi: network.wifi } : {}), signal: network.signal, bandGHz: network.bandGHz, powerSaveAc: power.ac, powerSaveDc: power.dc, battery: onBattery(), latency });
      player.setChecks(next);
      if (JSON.stringify(next) === JSON.stringify(checks)) return;
      checks = next;
      if (!win.isDestroyed()) win.webContents.send('player:checks', checks);
    };
    const updateNetwork = async () => {
      const next = await networkInfo().catch(() => network);
      if (JSON.stringify(next) !== JSON.stringify(network)) {
        network = next;
        if (!win.isDestroyed()) win.webContents.send('player:network', network);
      }
      updateChecks();
    };
    const updatePower = async () => {
      power = await wifiPowerSave().catch(() => ({}));
      updateChecks();
    };
    // Laufzeit: 10 Anfragen an die Steuersoftware; vor dem Textfenster alle 15 s, danach jede Minute (der Server misst
    // während der Vorstellung selbst jede Sekunde)
    let measuring = false;
    const measureLatency = async () => {
      const target = player.latencyTarget;
      if (!target || measuring || !network.connected) return;
      measuring = true;
      try {
        latency = await measure(target);
        updateChecks();
      } finally {
        measuring = false;
      }
    };
    await updateNetwork();
    void updatePower();
    setInterval(() => void updateNetwork(), 10_000);
    setInterval(() => void updatePower(), 60_000);
    let lastMeasure = 0;
    setInterval(() => {
      const every = player.pageShown ? 60_000 : 15_000;
      if (Date.now() - lastMeasure < every) return;
      lastMeasure = Date.now();
      void measureLatency();
    }, 2000);
    powerMonitor.on('on-battery', updateChecks);
    powerMonitor.on('on-ac', updateChecks);

    // Hinweis auf eine neue Version: einmal beim Start bei GitHub nachsehen (nur das installierte Programm;
    // abschaltbar mit STECKPLAN_UPDATE_CHECK=aus, für Tests eine eigene Adresse). Ohne Netz passiert nichts.
    let update: UpdateInfo | null = null;
    ipcMain.handle('player:update', () => update);
    const updateUrl = env.STECKPLAN_UPDATE_URL;
    if ((app.isPackaged || updateUrl) && env.STECKPLAN_UPDATE_CHECK !== 'aus' && !isSmokeTest) {
      void checkForUpdate(VERSION, fetch, updateUrl ? { url: updateUrl } : {}).then((info) => {
        update = info;
        if (info && !win.isDestroyed()) win.webContents.send('player:update', info);
      });
    }

    // Tasten: beenden, Vollbild, neu synchronisieren, andere Steuersoftware wählen
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const mod = input.control || input.meta;
      const key = input.key.toLowerCase();
      if (mod && input.shift && key === 'q') {
        event.preventDefault();
        app.quit();
      } else if (input.key === 'F11') {
        event.preventDefault();
        win.setFullScreen(!win.isFullScreen());
      } else if (mod && input.shift && key === 'r') {
        event.preventDefault();
        void player.resync();
      } else if (mod && input.shift && key === 's') {
        event.preventDefault();
        void player.start({ forceChoose: true });
      }
    });

    if (isSmokeTest) {
      await win.loadFile(join(__dirname, 'status.html'));
      void runSmokeTest(win);
      return;
    }
    void player.start();
  });

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
