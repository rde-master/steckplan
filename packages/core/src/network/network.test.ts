import { describe, expect, it } from 'vitest';
import type { DeviceInstance, Template } from '../model/schema';
import { formatCidr, formatIPv4, inSubnet, isReservedAddress, nextFreeIp, parseCidr, parseIPv4 } from './ip';
import { buildNetworkList, checkNetwork, suggestIp, withNetworkEntry } from './network';
import { escapeWifi, wifiQrPayload } from './wifi';

const T0 = '2026-01-01T00:00:00.000Z';
const node: Template = { id: 'node', kind: 'device', version: 1, updatedAt: T0, name: 'Node', ports: [{ id: 'eth', label: 'Netz', connector: 'etherCON', direction: 'bi', signal: 'Ethernet', isNetwork: true }, { id: 'eth2', label: 'Netz 2', connector: 'RJ45', direction: 'bi', signal: 'Ethernet', isNetwork: true }] };
const templates = new Map([[node.id, node]]);
const subnet = { id: 'n1', name: 'Licht', cidr: '10.0.0.0/24', gateway: '10.0.0.1' };
const dev = (id: string, network: DeviceInstance['network']): DeviceInstance => ({ id, templateId: 'node', layerId: 'l', label: id, network });

describe('IPv4/CIDR', () => {
  it('liest und schreibt Adressen', () => {
    expect(parseIPv4('192.168.1.10')).toBe(3232235786);
    expect(formatIPv4(3232235786)).toBe('192.168.1.10');
    for (const bad of ['256.1.1.1', '1.2.3', '1.2.3.4.5', 'a.b.c.d', '', ' 1.2.3.04x']) expect(parseIPv4(bad)).toBeNull();
  });

  it('rechnet Netze', () => {
    const c = parseCidr('192.168.1.77/24')!;
    expect(formatCidr(c)).toBe('192.168.1.0/24');
    expect(formatIPv4(c.broadcast)).toBe('192.168.1.255');
    expect(inSubnet(parseIPv4('192.168.1.200')!, c)).toBe(true);
    expect(inSubnet(parseIPv4('192.168.2.1')!, c)).toBe(false);
    expect(isReservedAddress(c.network, c)).toBe(true);
    expect(isReservedAddress(c.broadcast, c)).toBe(true);
    expect(parseCidr('10.0.0.0/33')).toBeNull();
    expect(parseCidr('10.0.0.0')).toBeNull();
    expect(isReservedAddress(parseIPv4('10.0.0.0')!, parseCidr('10.0.0.0/31')!)).toBe(false);
  });

  it('schlägt die nächste freie Adresse vor', () => {
    const c = parseCidr('10.0.0.0/29')!; // .1–.6 nutzbar
    expect(formatIPv4(nextFreeIp(c, [parseIPv4('10.0.0.2')!], parseIPv4('10.0.0.1'))!)).toBe('10.0.0.3');
    expect(nextFreeIp(c, [2, 3, 4, 5, 6].map((n) => c.network + n), c.network + 1)).toBeNull();
  });
});

describe('Netzwerk-Prüfungen', () => {
  it('doppelt, außerhalb, Netz-/Broadcast-Adresse, fehlend, ungültig, DHCP ok', () => {
    const issues = checkNetwork(
      {
        network: { subnets: [subnet, { id: 'bad', name: 'Kaputt', cidr: '10.0.0/8' }], wifi: [] },
        devices: [
          dev('a', [{ portId: 'eth', mode: 'static', ip: '10.0.0.10', subnetId: 'n1' }]),
          dev('b', [{ portId: 'eth', mode: 'static', ip: '10.0.0.10', subnetId: 'n1' }]),
          dev('c', [{ portId: 'eth', mode: 'static', ip: '10.0.1.5', subnetId: 'n1' }]),
          dev('d', [{ portId: 'eth', mode: 'static', ip: '10.0.0.255', subnetId: 'n1' }]),
          dev('e', [{ portId: 'eth', mode: 'static' }]),
          dev('f', [{ portId: 'eth', mode: 'static', ip: '10.0.0.300' }]),
          dev('g', [{ portId: 'eth', mode: 'dhcp' }]),
        ],
      },
      templates,
    );
    const ids = issues.map((i) => i.id.replace(/:\d+$/, ':IP'));
    expect(ids.sort()).toEqual(['ip-duplicate:IP', 'ip-invalid:f:eth', 'ip-missing:e:eth', 'ip-outside:c:eth', 'ip-reserved:d:eth', 'subnet-cidr:bad']);
    expect(issues.find((i) => i.id.startsWith('ip-missing'))!.message).toContain('„e“ (Netz)');
  });

  it('nächste freie IP berücksichtigt alle Geräte und das Gateway', () => {
    const project = { devices: [dev('a', [{ portId: 'eth', mode: 'static', ip: '10.0.0.2' }]), dev('b', [{ portId: 'eth', mode: 'dhcp', ip: '10.0.0.3' }])] };
    expect(suggestIp(project, subnet)).toBe('10.0.0.3');
  });

  it('Netzwerkliste und Einträge je Anschluss', () => {
    const a = dev('a', [{ portId: 'eth', mode: 'static', ip: '10.0.0.20', subnetId: 'n1', hostname: 'node-a' }]);
    const rows = buildNetworkList({ devices: [a, dev('b', [{ portId: 'eth', mode: 'dhcp' }])], network: { subnets: [subnet], wifi: [] } }, templates);
    expect(rows.map((r) => `${r.device}/${r.port}:${r.ip}:${r.subnet}`)).toEqual(['a/Netz:10.0.0.20:Licht', 'a/Netz 2::', 'b/Netz:DHCP:', 'b/Netz 2::']);
    expect(withNetworkEntry(a, { portId: 'eth', mode: 'dhcp' })).toEqual([{ portId: 'eth', mode: 'dhcp' }]);
  });
});

describe('WLAN-QR-Code', () => {
  it('escapt Sonderzeichen', () => {
    expect(escapeWifi('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
  });

  it('erzeugt den Standardtext', () => {
    expect(wifiQrPayload({ ssid: 'Crew;Netz', security: 'WPA2', hidden: false }, 'p:a"ss')).toBe('WIFI:T:WPA;S:Crew\\;Netz;P:p\\:a\\"ss;H:false;;');
    expect(wifiQrPayload({ ssid: 'Gäste', security: 'open', hidden: true }, 'egal')).toBe('WIFI:T:nopass;S:Gäste;H:true;;');
    expect(wifiQrPayload({ ssid: 'X', security: 'WPA3', hidden: false }, undefined)).toBe('WIFI:T:WPA;S:X;P:;H:false;;');
  });
});
