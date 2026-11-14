// Verbindung zum APC40 über Web MIDI (in der Desktop-App, in Chromium auch über HTTPS/localhost): Ports finden,
// in Modus 2 schalten, Eingaben melden, LEDs setzen (nur Änderungen senden). Ein-/Ausstecken wird erkannt – nach
// dem Wiederverbinden wird das Gerät neu eingerichtet und alle LEDs neu gesendet.
import { useEffect, useRef, useState } from 'react';
import { APC40_INIT, isApc40Port, ledMessage, parseApc40, ringMessages, type Apc40Input, type LedState } from './apc40';

export type Apc40Status = 'unsupported' | 'connecting' | 'denied' | 'notFound' | 'connected';

/** Web MIDI vorhanden? (sicherer Kontext, z. B. Desktop-App) */
export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function' && (typeof window === 'undefined' || window.isSecureContext);
}

/**
 * leds: Zustand je Taste; rings: Wert (0–1) je Drehregler-Ring, null = Ring aus (Regler ohne Aufgabe). Der Wert
 * setzt auch die Lage des Reglers – Drehen macht dort weiter (die Fader haben keinen Motor und springen).
 */
export function useApc40(enabled: boolean, leds: Record<string, LedState>, onInput: (input: Apc40Input) => void, rings: Record<string, number | null> = {}): { status: Apc40Status; port: string | null } {
  const [state, setState] = useState<{ status: Apc40Status; port: string | null }>({ status: 'connecting', port: null });
  const output = useRef<MIDIOutput | null>(null);
  /** zuletzt gesendeter LED-Zustand je Taste */
  const sent = useRef(new Map<string, string>());
  const handler = useRef(onInput);
  const wanted = useRef(leds);
  const wantedRings = useRef(rings);
  /** zuletzt gesendeter Ring je Regler (gerundet auf die 128 Stufen) */
  const sentRings = useRef(new Map<string, number | null>());
  useEffect(() => {
    handler.current = onInput;
    wanted.current = leds;
    wantedRings.current = rings;
  });

  const flush = () => {
    const out = output.current;
    if (!out) return;
    for (const [id, led] of Object.entries(wanted.current)) {
      const key = led;
      if (sent.current.get(id) === key) continue;
      const msg = ledMessage(id, led);
      if (!msg) continue;
      try {
        out.send(msg);
        sent.current.set(id, key);
      } catch {
        // Gerät gerade weg – beim Wiederverbinden wird alles neu gesendet
      }
    }
    for (const [id, value] of Object.entries(wantedRings.current)) {
      const step = value === null ? null : Math.round(value * 127);
      if (sentRings.current.has(id) && sentRings.current.get(id) === step) continue;
      try {
        for (const msg of ringMessages(id, value)) out.send(msg);
        sentRings.current.set(id, step);
      } catch {
        // wie oben
      }
    }
  };

  useEffect(() => {
    if (!enabled || !midiSupported()) return;
    let cancelled = false;
    let access: MIDIAccess | null = null;
    let input: MIDIInput | null = null;
    const sentLeds = sent.current;
    const ringsSent = sentRings.current;
    const onMessage = (e: MIDIMessageEvent) => {
      const parsed = e.data ? parseApc40(e.data) : null;
      if (parsed) handler.current(parsed);
    };
    const connect = () => {
      if (!access || cancelled) return;
      const nextIn = [...access.inputs.values()].find((p) => isApc40Port(p.name) && p.state !== 'disconnected') ?? null;
      const nextOut = [...access.outputs.values()].find((p) => isApc40Port(p.name) && p.state !== 'disconnected') ?? null;
      if (nextIn !== input) {
        input?.removeEventListener('midimessage', onMessage as EventListener);
        input = nextIn;
        input?.addEventListener('midimessage', onMessage as EventListener);
      }
      if (nextOut !== output.current) {
        output.current = nextOut;
        sent.current.clear();
        sentRings.current.clear();
        if (nextOut) {
          try {
            nextOut.send(APC40_INIT);
          } catch {
            // ohne SysEx-Recht bleibt das Gerät in Modus 0 – Tasten gehen trotzdem
          }
        }
      }
      setState(input && output.current ? { status: 'connected', port: input.name ?? 'APC40' } : { status: 'notFound', port: null });
      flush();
    };
    const request = (sysex: boolean) => navigator.requestMIDIAccess({ sysex });
    request(true)
      .catch(() => request(false))
      .then((a) => {
        if (cancelled) return;
        access = a;
        access.addEventListener('statechange', connect);
        connect();
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'denied', port: null });
      });
    return () => {
      cancelled = true;
      access?.removeEventListener('statechange', connect);
      input?.removeEventListener('midimessage', onMessage as EventListener);
      // beim Verlassen alle LEDs aus
      const out = output.current;
      if (out) for (const id of sentLeds.keys()) {
        const msg = ledMessage(id, 'off');
        if (msg) {
          try {
            out.send(msg);
          } catch {
            // egal
          }
        }
      }
      if (out) for (const id of ringsSent.keys()) {
        try {
          for (const msg of ringMessages(id, null)) out.send(msg);
        } catch {
          // egal
        }
      }
      output.current = null;
      sentLeds.clear();
      ringsSent.clear();
    };
  }, [enabled]);

  // LEDs nachführen, wenn sich der gewünschte Zustand ändert
  const signature = JSON.stringify(leds) + JSON.stringify(rings);
  useEffect(() => {
    flush();
  }, [signature]);

  if (!enabled) return { status: 'connecting', port: null };
  if (!midiSupported()) return { status: 'unsupported', port: null };
  return state;
}
