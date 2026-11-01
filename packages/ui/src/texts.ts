// Alle Texte der Oberfläche zentral an einer Stelle (UI nur Deutsch, keine i18n-Bibliothek).
export const texts = {
  app: {
    tagline: 'Planung von Licht-, Ton- und Netzwerktechnik für Veranstaltungen',
  },
  start: {
    emptyState: 'Hier entsteht Steckplan. Noch gibt es nichts zu planen.',
    serverConnected: 'Verbunden mit dem Server',
    serverConnecting: 'Verbinde mit dem Server …',
    serverError: 'Keine Verbindung zum Server',
    modeDesktop: 'Desktop-App',
    modeStandalone: 'Server (Docker)',
  },
} as const;
