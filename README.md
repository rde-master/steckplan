# Steckplan

Open-Source-Software zur Planung von **Licht-, Ton- und Netzwerktechnik** für Veranstaltungen:
Signalfluss, maßstäblicher Bühnenplan, Kabel mit Längen, DMX, Netzwerk/WLAN, Logistik
(Kategorie, Besitzer, Anhänger) und PDF-Listen zum Abhaken.

> **Status:** in Entwicklung – noch keine nutzbare Version. Den vollständigen Plan findest du in [PLAN.md](PLAN.md).

## Funktionen (geplant für 1.0)

- **Signalfluss-Ansicht** und **maßstäblicher 2D-Bühnenplan** auf dasselbe Projekt
- Bühnenelemente, Traversen und Stative; Geräte daran andocken (Höhe wird übernommen)
- Kabel mit **automatisch berechneter Länge** (inkl. Höhe und Reserve)
- **DMX**-Adressen und Universen mit Prüfungen und Auto-Adressierung
- **Netzwerk**: Subnetze, IP-Adressen, WLAN-Netze mit QR-Code
- **Logistik**: Kategorie, Besitzer und Anhänger für alles
- **PDF-Export** (A4/A3): Pack-/Abhaklisten, Kabelliste, Stückliste, DMX-Patch, Netzwerkliste, WLAN-Aushang, Planzeichnung
- **Desktop-App** (macOS, Windows) – lokal oder live mit einem Server verbunden
- **Docker-Image** für die Nutzung im Browser, mehrere Personen gleichzeitig
- **Weboberfläche per QR-Code** fürs Handy/Tablet: ansehen, Packliste abhaken, mitbearbeiten

## Installation

Stabile Versionen erscheinen unter [Releases](https://github.com/rde-master/steckplan/releases).

Dort gibt es außerdem den **Steckplan Player** (`Steckplan-Player-…`): ein eigenes Programm für den Rechner am
Bildschirm bzw. Beamer. Er startet automatisch im Vollbild, sucht die Steuersoftware im Netz (Desktop-App mit
laufender Weboberfläche oder Server), koppelt sich per Code (im Führen-Bildschirm unter „Player“ zulassen), lädt
beim Start Texte, Bilder und Videos und zeigt dann das Textfenster der laufenden Vorstellung.

**Test-Builds** aus dem Branch `develop`:

- **Desktop:** unter [Actions → CI](https://github.com/rde-master/steckplan/actions/workflows/ci.yml) den neuesten Lauf auf `develop` öffnen und unten bei *Artifacts* `.dmg` (macOS) bzw. `.exe` (Windows) herunterladen
- **Docker:** `ghcr.io/rde-master/steckplan:develop` – siehe [Docker-Anleitung](docs/docker.md)

### Hinweis zu den Installern

Die Installer sind nicht kostenpflichtig signiert, daher warnt das Betriebssystem beim ersten Start:

- **macOS:** „Steckplan kann nicht geöffnet werden …“ → in *Systemeinstellungen → Datenschutz & Sicherheit* ganz unten auf **„Dennoch öffnen“** klicken. Alternativ im Terminal: `xattr -dr com.apple.quarantine /Applications/Steckplan.app`
- **Windows:** SmartScreen „Der Computer wurde durch Windows geschützt“ → **„Weitere Informationen“** → **„Trotzdem ausführen“**

## Entwicklung

Voraussetzungen: Node.js ≥ 22.12 (empfohlen 24) und pnpm (`corepack enable`).

```bash
pnpm install          # Abhängigkeiten installieren
pnpm dev              # Server (Port 8080) + UI mit Hot-Reload (http://localhost:5173),
                      # Anmeldung mit „dev-bearbeiten“ bzw. „dev-lesen“
pnpm --filter @steckplan/desktop dev   # Desktop-App lokal starten
pnpm check            # Lint, Typecheck, Unit-Tests
pnpm build            # alles bauen
pnpm test:e2e         # E2E-Tests (Browser + Desktop; vorher bauen, unter Linux mit xvfb-run)
pnpm docker:build     # Docker-Image lokal bauen
```

Aufbau (Monorepo mit pnpm workspaces):

| Ordner | Inhalt |
|---|---|
| `packages/core` | Fachlogik, Datenmodell, Schemas (reines TypeScript) |
| `packages/server` | Fastify-Server – eingebettet in der Desktop-App oder eigenständig im Docker-Container |
| `packages/ui` | React-Oberfläche (Desktop, Browser, Handy) |
| `apps/desktop` | Electron-App und Installer |
| `apps/docker` | Dockerfile und `docker-compose.yml` |

Die Versionsnummer wird nur in der Root-`package.json` gepflegt und mit `pnpm version:sync` in alle Pakete übernommen.
Mehr in [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[GPL-3.0](LICENSE)
