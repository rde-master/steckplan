import { afterEach, describe, expect, it, vi } from 'vitest';
import { ma3QueryConfig, type Ma3CueState } from '@steckplan/core';
import type { OscOut } from './bpm-out';
import { Ma3Query } from './ma3';
import { parseOsc } from './osc';

const config = ma3QueryConfig({ enabled: true, host: '127.0.0.1', port: 9000, address: '/gma3/cmd', oscLine: 2 });

function setup() {
  const sent: { address: string; args: unknown[]; host: string; port: number }[] = [];
  const out: OscOut = {
    send: (packet, host, port) => {
      const [message] = parseOsc(Buffer.from(packet));
      sent.push({ ...message!, host, port });
    },
    close: () => undefined,
  };
  const states: (Ma3CueState | null)[] = [];
  const query = new Ma3Query(out, (s) => states.push(s), 1000);
  return { sent, states, query };
}

afterEach(() => vi.useRealTimers());

describe('Ma3Query', () => {
  it('fragt beim Wechsel der Lichtszene (nicht erneut bei derselben), nur mit Sequenz und eingeschaltet', () => {
    const { sent, query } = setup();
    query.update('s1', 103, config, true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ address: '/gma3/cmd', host: '127.0.0.1', port: 9000 });
    expect(String(sent[0]!.args[0])).toContain("'Sequence 103'");
    expect(String(sent[0]!.args[0])).toContain('SendOSC 2 ');
    query.update('s1', 103, config, true);
    expect(sent).toHaveLength(1);
    query.update('s2', undefined, config, true); // Szene ohne Sequenz
    query.update('s3', 7, { ...config, enabled: false }, true);
    expect(sent).toHaveLength(1);
    // niemand führt mehr – beim nächsten Führen wird wieder gefragt
    query.update(undefined, undefined, config, false);
    query.update('s1', 103, config, true);
    expect(sent).toHaveLength(2);
  });

  it('Antwort zur gefragten Sequenz übernehmen, fremde ignorieren; erneut fragen behält den Cue bis zur Antwort', () => {
    const { query } = setup();
    query.ask(103, 's1', config);
    expect(query.current).toMatchObject({ sequence: 103, sceneId: 's1', status: 'waiting' });
    expect(query.reply({ sequence: 5, cue: '1', noSequence: false })).toBe(false);
    expect(query.reply({ sequence: 103, cue: '4', name: 'Refrain', noSequence: false })).toBe(true);
    expect(query.current).toMatchObject({ sequence: 103, cue: '4', name: 'Refrain', status: 'ok' });
    query.ask(103, 's1', config);
    expect(query.current).toMatchObject({ cue: '4', status: 'waiting' });
    query.reply({ sequence: 103, noSequence: false });
    expect(query.current?.status).toBe('noCue');
    expect(query.current?.cue).toBeUndefined();
    query.ask(999, 's9', config);
    query.reply({ sequence: 999, noSequence: true });
    expect(query.current).toMatchObject({ sequence: 999, status: 'noSequence' });
  });

  it('ohne Antwort: nach der Frist „timeout“; ohne gültiges Ziel: Fehler', () => {
    vi.useFakeTimers();
    const { query, states } = setup();
    query.ask(103, 's1', config);
    vi.advanceTimersByTime(1100);
    expect(states.at(-1)?.status).toBe('timeout');
    expect(query.ask(103, 's1', { ...config, host: '' })).toMatchObject({ status: 'error' });
  });
});
