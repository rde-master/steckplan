import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerCatalog } from '@steckplan/core';
import { cacheFileName, MediaCache, MediaUnavailableError, parseRange } from './cache';
import { broadcastAddress, discoveryTargets, parseAddress } from './discovery';

const sha = (c: string) => c.repeat(64);

describe('Player: Suche', () => {
  it('Rundruf-Adresse je Netz; Ziele: alle Netze, allgemein und dieser Rechner', () => {
    expect(broadcastAddress('192.168.1.23', '255.255.255.0')).toBe('192.168.1.255');
    expect(broadcastAddress('10.4.7.1', '255.255.0.0')).toBe('10.4.255.255');
    expect(broadcastAddress('x', '255.0.0.0')).toBeNull();
    const targets = discoveryTargets({
      eth0: [{ address: '192.168.1.23', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
      lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, mac: '', cidr: null }],
    });
    expect(targets.sort()).toEqual(['127.0.0.1', '192.168.1.255', '255.255.255.255']);
  });

  it('Adresse von Hand: Host und Port (Standard 8080), auch mit http://', () => {
    expect(parseAddress('192.168.1.20:3000')).toEqual({ host: '192.168.1.20', port: 3000 });
    expect(parseAddress('http://buehne.local:8080/projekt')).toEqual({ host: 'buehne.local', port: 8080 });
    expect(parseAddress('server')).toEqual({ host: 'server', port: 8080 });
    expect(parseAddress('a:99999')).toBeNull();
  });
});

describe('Player: Zwischenspeicher', () => {
  it('Bereiche für Videos', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=200-', 100)).toBe('invalid');
  });

  it('plant fehlende Dateien, lädt mit Fortschritt, gleiche Inhalte nur einmal, liefert mit Bereich aus, räumt auf', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'player-cache-'));
    const cache = new MediaCache(dir);
    await cache.load();
    const catalog: PlayerCatalog = {
      projects: [
        { id: 'p1', name: 'A', items: 1, lines: 1, media: [{ id: 'm1', name: 'Video.webm', mime: 'video/webm', sizeBytes: 5, sha256: sha('a') }, { id: 'm2', name: 'Bild.png', mime: 'image/png', sizeBytes: 3, sha256: '' }] },
        { id: 'p2', name: 'B', items: 1, lines: 1, media: [{ id: 'x', name: 'Video.webm', mime: 'video/webm', sizeBytes: 5, sha256: sha('a') }] },
      ],
    };
    expect(cacheFileName('p1', catalog.projects[0]!.media[1]!)).toBe('p1_m2');
    const plan = await cache.plan(catalog);
    expect(plan).toMatchObject({ ready: 0, total: 3, bytesTotal: 13 });
    expect(plan.todo.map((t) => t.file)).toEqual([sha('a'), 'p1_m2', sha('a')]);

    const bodies: Record<string, string> = { m1: 'hallo', m2: 'png', x: 'hallo' };
    let fetched = 0;
    let bytes = 0;
    for (const item of plan.todo) {
      await cache.download(
        item,
        async () => {
          fetched++;
          return new Response(bodies[item.media.id]);
        },
        (n) => (bytes += n),
      );
    }
    // gleicher Inhalt: nur einmal geladen
    expect(fetched).toBe(2);
    expect(bytes).toBe(13);
    expect(await readFile(join(dir, sha('a')), 'utf8')).toBe('hallo');

    const full = cache.respond('p2', 'x', null)!;
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('video/webm');
    expect(await full.text()).toBe('hallo');
    const part = cache.respond('p1', 'm1', 'bytes=1-3')!;
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(await part.text()).toBe('all');
    expect(cache.respond('p1', 'fehlt', null)).toBeUndefined();

    // neu planen: alles da; Datei entfällt → aufgeräumt
    expect((await cache.plan(catalog)).todo).toEqual([]);
    await cache.cleanup({ projects: [catalog.projects[1]!] });
    expect(cache.get('p1', 'm2')).toBeUndefined();
    expect(cache.get('p2', 'x')).toBeDefined();
    await expect(readFile(join(dir, 'p1_m2'))).rejects.toThrow();

    // unvollständige Datei wird nicht übernommen
    const broken = { projectId: 'p3', media: { id: 'b', name: 'Kaputt.mp4', mime: 'video/mp4', sizeBytes: 10, sha256: '' }, file: 'p3_b' };
    await expect(cache.download(broken, async () => new Response('zu kurz'), () => undefined)).rejects.toThrow(/unvollständig/);
    expect(cache.get('p3', 'b')).toBeUndefined();

    // Server liefert die Datei nicht: eigener Fehler (die Synchronisierung lädt die übrigen weiter)
    const gone = { projectId: 'p4', media: { id: 'g', name: 'Kaffeehaus.png', mime: 'image/png', sizeBytes: 3, sha256: '' }, file: 'p4_g' };
    const failed = await cache.download(gone, async () => new Response(null, { status: 404 }), () => undefined).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(MediaUnavailableError);
    expect(failed).toMatchObject({ mediaName: 'Kaffeehaus.png', status: 404 });
    expect(cache.get('p4', 'g')).toBeUndefined();
  });
});

describe('Player: Netzwerk', () => {
  it('IP-Adressen ohne „dieser Rechner“ und 169.254; WLAN-Name aus den Bordmitteln', async () => {
    const { localAddresses, parseMacWifi, parseMacWifiDevice, parseNetsh, parseNmcli } = await import('./network');
    expect(
      localAddresses({
        WLAN: [{ address: '192.168.1.23', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
        Ethernet: [{ address: '169.254.3.4', netmask: '255.255.0.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
        lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, mac: '', cidr: null }],
      }),
    ).toEqual([{ name: 'WLAN', address: '192.168.1.23' }]);
    expect(parseNetsh('    Name                   : WLAN\r\n    BSSID                  : aa:bb\r\n    SSID                   : Bühne 5G\r\n    Status                 : Verbunden\r\n')).toBe('Bühne 5G');
    expect(parseNetsh('Es ist keine drahtlose Schnittstelle vorhanden.')).toBeUndefined();
    expect(parseMacWifi('Current Wi-Fi Network: Halle\n')).toBe('Halle');
    expect(parseMacWifi('  SSID : Saal\n')).toBe('Saal');
    expect(parseMacWifi('  SSID : <redacted>\n')).toBeUndefined();
    expect(parseMacWifiDevice('Hardware Port: Ethernet\nDevice: en1\n\nHardware Port: Wi-Fi\nDevice: en0\n')).toBe('en0');
    expect(parseNmcli('no:Nachbar\nyes:Technik\\:Netz\n')).toBe('Technik:Netz');
  });
});
