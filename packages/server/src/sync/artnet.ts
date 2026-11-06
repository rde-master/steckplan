// Timecode per Art-Net (ArtTimeCode): Solange in der Vorstellung jemand führt, rechnet der Server die Position
// aus der letzten Stelle (Abspielposition + seit dem Empfang vergangene Zeit) weiter und sendet 25 Pakete pro Sekunde.
// Steht die Wiedergabe, geht einmal die aktuelle Position raus. Senden per UDP an Port 6454 (auch Broadcast).
import dgram from 'node:dgram';
import { ARTNET_PORT, artTimecodePacket, isArtNetHost, TIMECODE_FPS, type LeadInfo } from '@steckplan/core';

export interface TimecodeSender {
  send(packet: Uint8Array, host: string): void;
  close(): void;
}

/** UDP-Sender; das Socket entsteht erst beim ersten Paket */
export function udpSender(onError: (message: string) => void = () => undefined): TimecodeSender {
  let socket: dgram.Socket | null = null;
  let lastError = '';
  const open = (): dgram.Socket => {
    const s = dgram.createSocket('udp4');
    s.on('error', (error) => onError(error.message));
    s.on('listening', () => s.setBroadcast(true));
    s.bind();
    s.unref(); // hält den Prozess nicht am Leben (Beenden der Desktop-App)
    return s;
  };
  return {
    send(packet, host) {
      socket ??= open();
      socket.send(packet, ARTNET_PORT, host, (error) => {
        // gleiche Meldung nicht 25-mal pro Sekunde
        if (error && error.message !== lastError) onError(error.message);
        lastError = error?.message ?? '';
      });
    },
    close() {
      socket?.close();
      socket = null;
    },
  };
}

export interface ArtNetConfig {
  enabled: boolean;
  host: string;
}

export class ArtNetTimecode {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sender: TimecodeSender | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  /** Neue Stelle bzw. geänderte Einstellung: senden starten, einmal senden oder aufhören */
  update(lead: LeadInfo | null, receivedAt: number, config: ArtNetConfig | undefined): void {
    this.stop();
    const sender = this.sender;
    if (!sender || !config?.enabled || !isArtNetHost(config.host) || !lead || lead.at === undefined) return;
    const host = config.host.trim();
    const at = lead.at;
    const position = () => (lead.playing ? at + Math.max(0, this.now() - receivedAt) / 1000 : at);
    sender.send(artTimecodePacket(position()), host);
    if (lead.playing) this.timer = setInterval(() => sender.send(artTimecodePacket(position()), host), 1000 / TIMECODE_FPS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
