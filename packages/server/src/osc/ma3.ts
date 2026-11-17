// grandMA3: laufenden Cue der Sequenz einer Lichtszene abfragen – je Projekt (Raum). Gefragt wird beim Wechsel der
// geführten Lichtszene und von Hand; das Pult antwortet an den OSC-Empfang des Servers (/steckplan/ma3), der die
// Antwort an alle Räume gibt – hier passt sie, wenn gerade nach dieser Sequenz gefragt wurde.
import { isArtNetHost, isMa3Sequence, ma3QueryCommand, MA3_REPLY_TIMEOUT_MS, type Ma3CueState, type Ma3QueryConfig, type Ma3Reply } from '@steckplan/core';
import { encodeOsc, type OscOut } from './bpm-out';

export class Ma3Query {
  private state: Ma3CueState | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSceneId: string | undefined;

  constructor(
    private readonly out: OscOut | undefined,
    private readonly onState: (state: Ma3CueState | null) => void,
    private readonly timeoutMs = MA3_REPLY_TIMEOUT_MS,
  ) {}

  get current(): Ma3CueState | null {
    return this.state;
  }

  /** Neue Stelle der führenden Person: bei einer anderen Lichtszene mit Sequenz fragen (null = niemand führt) */
  update(sceneId: string | undefined, sequence: number | undefined, config: Ma3QueryConfig, leading: boolean): void {
    if (!leading) {
      this.lastSceneId = undefined;
      return;
    }
    if (sceneId === this.lastSceneId) return;
    this.lastSceneId = sceneId;
    if (sceneId && isMa3Sequence(sequence) && config.enabled && isArtNetHost(config.host)) this.ask(sequence, sceneId, config);
  }

  /** Jetzt fragen; der neue Stand (bei Fehler mit status 'error') */
  ask(sequence: number, sceneId: string | undefined, config: Ma3QueryConfig): Ma3CueState {
    clearTimeout(this.timer);
    // dieselbe Sequenz erneut: der zuletzt gemeldete Cue bleibt stehen, bis die Antwort kommt
    const previous = this.state?.sequence === sequence && this.state.cue !== undefined ? { cue: this.state.cue, ...(this.state.name !== undefined ? { name: this.state.name } : {}), ...(this.state.answeredAt ? { answeredAt: this.state.answeredAt } : {}) } : {};
    const base = { sequence, ...(sceneId ? { sceneId } : {}), ...previous, askedAt: new Date().toISOString() };
    let state: Ma3CueState;
    if (!this.out || !isArtNetHost(config.host)) state = { ...base, status: 'error', error: 'Kein gültiges Ziel (Pult) eingestellt.' };
    else {
      try {
        this.out.send(encodeOsc(config.address, [ma3QueryCommand(sequence, config.oscLine)]), config.host, config.port);
        state = { ...base, status: 'waiting' };
        this.timer = setTimeout(() => {
          if (this.state?.status === 'waiting' && this.state.askedAt === base.askedAt) this.set({ ...this.state, status: 'timeout' });
        }, this.timeoutMs);
        this.timer.unref?.();
      } catch (error) {
        state = { ...base, status: 'error', error: (error as Error).message };
      }
    }
    this.set(state);
    return state;
  }

  /** Antwort des Pults; true = gehört zur offenen bzw. letzten Frage */
  reply(reply: Ma3Reply): boolean {
    if (!this.state || this.state.sequence !== reply.sequence) return false;
    clearTimeout(this.timer);
    const { cue: _cue, name: _name, error: _error, ...base } = this.state;
    this.set({
      ...base,
      ...(reply.cue !== undefined ? { cue: reply.cue } : {}),
      ...(reply.name !== undefined ? { name: reply.name } : {}),
      answeredAt: new Date().toISOString(),
      status: reply.noSequence ? 'noSequence' : reply.cue === undefined ? 'noCue' : 'ok',
    });
    return true;
  }

  close(): void {
    clearTimeout(this.timer);
  }

  private set(state: Ma3CueState | null): void {
    this.state = state;
    this.onState(state);
  }
}
