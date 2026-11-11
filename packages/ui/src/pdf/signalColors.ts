// Farben je Signalart (Etiketten, Helfer-Ansicht) – eigene Datei, damit die Oberfläche dafür nicht die PDF-Erzeugung lädt.
import type { SignalKind } from '@steckplan/core';

export const SIGNAL_COLORS: Record<SignalKind, string> = {
  audio: '#0284c7',
  dmx: '#9333ea',
  network: '#16a34a',
  power: '#dc2626',
  video: '#ea580c',
  other: '#64748b',
};
