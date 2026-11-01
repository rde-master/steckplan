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

Folgt mit dem ersten Release. Test-Builds aus dem Branch `develop` stehen als
GitHub-Actions-Artefakte bzw. als Docker-Image `ghcr.io/rde-master/steckplan:develop` bereit.

> **Hinweis zu Installern:** Die Installer sind nicht kostenpflichtig signiert.
> macOS (Gatekeeper) und Windows (SmartScreen) zeigen daher beim ersten Start eine Warnung.
> Details folgen in der Dokumentation.

## Entwicklung

Monorepo mit pnpm workspaces (`packages/core`, `packages/ui`, `packages/server`, `apps/desktop`, `apps/docker`).
Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[GPL-3.0](LICENSE)
