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

describe('Player: Bilder in Bildschirmgröße', () => {
  it('verkleinert Bilder einmal je Bildschirm, liefert die kleine Fassung aus, behält sie beim Neuplanen, räumt sie mit auf', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'player-screen-'));
    const cache = new MediaCache(dir);
    await cache.load();
    const catalog: PlayerCatalog = {
      projects: [
        {
          id: 'p',
          name: 'A',
          items: 1,
          lines: 1,
          media: [
            { id: 'foto', name: 'Foto.jpg', mime: 'image/jpeg', sizeBytes: 6, sha256: sha('f') },
            { id: 'klein', name: 'Klein.png', mime: 'image/png', sizeBytes: 5, sha256: sha('k') },
            { id: 'film', name: 'Film.mp4', mime: 'video/mp4', sizeBytes: 4, sha256: sha('v') },
            { id: 'gif', name: 'Tanz.gif', mime: 'image/gif', sizeBytes: 3, sha256: sha('g') },
          ],
        },
      ],
    };
    const bodies: Record<string, string> = { foto: 'GROSS!', klein: 'klein', film: 'film', gif: 'gif' };
    for (const item of (await cache.plan(catalog)).todo) await cache.download(item, async () => new Response(bodies[item.media.id]), () => undefined);

    const asked: string[] = [];
    // nur das Foto ist zu groß; das kleine PNG passt schon
    const resize = async (data: Buffer, mime: string) => {
      asked.push(`${data.toString()}:${mime}`);
      return data.toString() === 'GROSS!' ? new TextEncoder().encode('ok') : null;
    };
    const progress: string[] = [];
    await cache.prepareScreens('1920x1080', resize, (file, done, total) => progress.push(`${done}/${total}`));
    expect(asked.sort()).toEqual(['GROSS!:image/jpeg', 'klein:image/png']);
    expect(progress).toEqual(['0/2', '1/2']);
    const small = cache.respond('p', 'foto', null)!;
    expect(small.headers.get('content-type')).toBe('image/jpeg');
    expect(small.headers.get('content-length')).toBe('2');
    expect(await small.text()).toBe('ok');
    expect(await cache.respond('p', 'klein', null)!.text()).toBe('klein');

    // gleicher Bildschirm: nichts mehr zu tun – auch nach neuem Planen
    expect((await cache.plan(catalog)).todo).toEqual([]);
    asked.length = 0;
    await cache.prepareScreens('1920x1080', resize);
    expect(asked).toEqual([]);
    // anderer Bildschirm: neu
    await cache.prepareScreens('3840x2160', resize);
    expect(asked).toHaveLength(2);
    // aufräumen: aktuelle Fassung bleibt, die alte (1920x1080) geht
    await cache.cleanup(catalog);
    expect(await readFile(join(dir, `${sha('f')}.3840x2160.jpg`), 'utf8')).toBe('ok');
    await expect(readFile(join(dir, `${sha('f')}.1920x1080.jpg`))).rejects.toThrow();
    // nach dem Neustart (Index aus der Datei) weiterhin die kleine Fassung
    const again = new MediaCache(dir);
    await again.load();
    expect(await again.respond('p', 'foto', null)!.text()).toBe('ok');
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

  it('WLAN-Signal, Band, Anschluss, Energiesparen und Kabel aus den Bordmitteln', async () => {
    const { hasWiredAddress, parseMacProfiler, parseNetshDetails, parseNmcliDetails, parsePowercfg } = await import('./network');
    // Windows deutsch (ohne „Band“-Zeile: aus dem Kanal) und englisch (Windows 11 mit „Band“)
    const de = '    Name                   : WLAN\r\n    SSID                   : Bühne\r\n    BSSID                  : aa:bb\r\n    Funktyp                : 802.11n\r\n    Kanal                  : 6\r\n    Signal                 : 54%\r\n';
    expect(parseNetshDetails(de)).toEqual({ ssid: 'Bühne', iface: 'WLAN', signal: 54, bandGHz: 2.4 });
    const en = '    Name                   : Wi-Fi\r\n    SSID                   : Technik\r\n    Band                   : 5 GHz\r\n    Channel                : 36\r\n    Signal                 : 91%\r\n';
    expect(parseNetshDetails(en)).toEqual({ ssid: 'Technik', iface: 'Wi-Fi', signal: 91, bandGHz: 5 });
    expect(parseNetshDetails('    Name : WLAN\r\n    Status : Getrennt\r\n')).toEqual({});
    // Linux
    expect(parseNmcliDetails('no:Nachbar:40:2412 MHz:wlan0\nyes:Technik\\:5:77:5180 MHz:wlan0\n')).toEqual({ ssid: 'Technik:5', iface: 'wlan0', signal: 77, bandGHz: 5 });
    // macOS
    const mac = 'Wi-Fi:\n  Interfaces:\n    en0:\n      Current Network Information:\n        Saal:\n          PHY Mode: 802.11ac\n          Channel: 149 (5GHz, 80MHz)\n          Signal / Noise: -61 dBm / -94 dBm\n      Other Local Wi-Fi Networks:\n        Nachbar:\n          Channel: 1 (2GHz, 20MHz)\n          Signal / Noise: -80 dBm / -94 dBm\n';
    expect(parseMacProfiler(mac)).toEqual({ signal: 78, bandGHz: 5 });
    expect(parseMacProfiler('Wi-Fi:\n  Status: Off\n')).toEqual({});
    // Windows powercfg (deutsch): Netzbetrieb Höchstleistung, Akku mittel
    const power = 'GUID des Energieschemas: 381b4222-…  (Ausbalanciert)\r\n  GUID der Untergruppe: 19cbb8fa-…  (Drahtlosadaptereinstellungen)\r\n    GUID der Energieeinstellung: 12bbebe6-…  (Energiesparmodus)\r\n      Index der möglichen Einstellung: 000\r\n      Angezeigter Name der möglichen Einstellung: Höchstleistung\r\n    Index der aktuellen Wechselstromeinstellung: 0x00000000\r\n    Index der aktuellen Gleichstromeinstellung: 0x00000002\r\n';
    expect(parsePowercfg(power)).toEqual({ ac: 0, dc: 2 });
    expect(parsePowercfg('Ungültige Parameter')).toEqual({});
    // Kabel: Ethernet mit Adresse, nicht das WLAN und nicht virtuell
    expect(hasWiredAddress([{ name: 'WLAN', address: '1' }, { name: 'vEthernet (WSL)', address: '2' }], 'WLAN')).toBe(false);
    expect(hasWiredAddress([{ name: 'Ethernet 2', address: '1' }], 'WLAN')).toBe(true);
    expect(hasWiredAddress([{ name: 'en0', address: '1' }], 'en0')).toBe(false);
    expect(hasWiredAddress([{ name: 'enp3s0', address: '1' }, { name: 'wlp2s0', address: '2' }], 'wlp2s0')).toBe(true);
  });
});
