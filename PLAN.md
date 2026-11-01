# PLAN – Steckplan

**Steckplan** – Open-Source-Software zur Planung von Licht-, Ton- und Netzwerktechnik für Veranstaltungen: Signalfluss, maßstäblicher Bühnenplan, Kabel mit Längen, DMX, Netzwerk/WLAN, Logistik (Besitzer, Anhänger) und PDF-Listen zum Abhaken.

> Dieser Plan ist die Arbeitsgrundlage für die Entwicklung mit Claude Code.
> Claude Code arbeitet ihn **Meilenstein für Meilenstein** ab und fragt bei Unklarheiten nach, bevor es Annahmen trifft (siehe Abschnitt 14).

---

## 1. Ziel

Mit Steckplan kann man:

- eine **Signalfluss-Ansicht** (Geräte als frei platzierbare, komplett einfärbbare Kästen; Kabel von Ausgängen zu Eingängen ziehen) und einen **maßstäblichen 2D-Bühnenplan** nutzen – beide zeigen dieselben Geräte und Kabel,
- **Bühnenelemente, Traversen und Stative** planen und Lichter einem Stativ oder einer Traverse zuordnen,
- **Kabel** (XLR, DMX, Strom, Multicore, Netzwerk …) verlegen und deren **Länge aus dem Bühnenplan** berechnen,
- **DMX-Adressen und Universen** planen und prüfen,
- das **Netzwerk** planen (IP-Adressen, Subnetze, WLAN-Netze) und **WLAN-QR-Codes** zum Verbinden erzeugen,
- für **alles** (Geräte, Kabel, Bühnenelemente, Traversen, Stative) **Kategorie, Besitzer und Anhänger** verwalten,
- **PDF-Listen und Pläne** ausgeben (Abhak-/Packlisten, Kabelliste, Stückliste, DMX-Patch, Netzwerkliste, WLAN-Aushang, Planzeichnung),
- die App als **Desktop-App** (Mac/Windows) **oder im Docker-Container im Browser** nutzen – und die Desktop-App **live mit dem Server verbinden**,
- am Desktop eine **Weboberfläche starten**, die per **QR-Code** am Handy/Tablet geöffnet wird (ansehen, Packliste abhaken, mitbearbeiten).

**Abgrenzung:** CablePlanner (LZ) ist proprietär, rein signalflussbasiert und lief im Test nicht sauber. Perastage (GPL-3) ist MVR-/Licht-fokussiert ohne Kabel-, Ton- und Logistikplanung. Steckplan verbindet **Signalfluss + Bühnenplan + Kabel + DMX + Netzwerk + Logistik + Listen**.

> **Wichtig:** Kein Code, keine Grafiken und keine Bibliotheksdaten aus CablePlanner übernehmen (proprietäre Lizenz). Die Signalfluss-Ansicht ist funktional an CablePlanner angelehnt, aber eine eigenständige Neuentwicklung.

---

## 2. Rahmenbedingungen (entschieden)

| Punkt | Entscheidung |
|---|---|
| Name | **Steckplan** · Dateiendung **`.steckplan`** |
| Plattformen | Desktop: macOS (Apple Silicon + Intel) und Windows · **Docker** (Linux-Container) mit Zugriff per Webbrowser |
| Desktop-Betriebsarten | **Lokal** (`.steckplan`-Dateien frei speichern, Doppelklick öffnet) **oder live mit einem Steckplan-Server verbunden** (Projekte, Bibliothek, Stammdaten liegen auf dem Server) |
| Technik | Electron + React + TypeScript; Node.js-Server für Web/Docker |
| Lizenz | GPL-3.0 |
| Repository | Öffentlich auf GitHub: <https://github.com/rde-master/steckplan> |
| UI-Sprache | **nur Deutsch** (Texte trotzdem zentral ablegen, keine i18n-Bibliothek im MVP) |
| Betrieb | Offline / im eigenen Netz, keine Cloud, keine Telemetrie |
| Branches | `main` (stabil) + `develop` (Entwicklung); Merge nach `main` + Tag → Release |
| Installer | Ohne kostenpflichtige Zertifikate: macOS **ad-hoc signiert** (nötig, damit die App auf Apple-Silicon-Macs überhaupt startet), Windows unsigniert; Hinweis in README zu Gatekeeper/SmartScreen |
| Updates | **Desktop-App** prüft beim Start bei GitHub Releases, ob es eine neue Version gibt, und zeigt einen Hinweis (in den Einstellungen abschaltbar); sonst keine Verbindungen nach außen. **Docker:** kein Update-Hinweis in der App, Aktualisierung über das Image (Anleitung in der Doku) |
| Bibliothek | Startet **komplett leer**, keine mitgelieferten Vorlagen |
| Gerätesymbole | **Einfache Formen** (Rechteck, Kreis, abgerundetes Rechteck) **mit Farbe und Beschriftung** |
| PDF-Formate | **A4 und A3**, beim Export auswählbar, Hoch-/Querformat |
| Kabellängen | Verfügbare Längen **pro Kabeltyp frei konfigurierbar**, keine fest vorgegebene Liste |
| Höhenregel | Standard: Kabel geht **zum Boden und wieder hoch** (pro Kabel überschreibbar) |

---

## 3. Funktionsumfang

### 3.1 MVP (Version 1.0)

1. **Zwei Ansichten auf dasselbe Projekt**
   - **Signalfluss-Ansicht:** Geräte als frei platzierbare Kästen mit sichtbaren Anschlüssen; Ausgänge (rechts) werden per Ziehen mit Eingängen (links) verbunden. Nicht maßstäblich.
   - **Bühnenplan-Ansicht (maßstäblich):** dieselben Geräte an ihrer echten Position; Kabelverlauf mit Wegpunkten; hieraus werden die Kabellängen berechnet.
   - Ein Gerät/Kabel existiert **einmal** im Projekt und hat in jeder Ansicht eine eigene Position. Was in einer Ansicht angelegt wird, erscheint auch in der anderen.
   - Geräte, die im Bühnenplan noch nicht platziert sind, werden markiert; Kabel ohne Bühnenplan-Verlauf haben „Länge manuell/offen“.

2. **Maßstäblicher 2D-Bühnenplan**
   - Zeichenfläche in echten Maßen (intern Millimeter), Raster mit einstellbarer Weite, Fangen (Snap)
   - Reine Zeichnungsformen (ohne Logistik): Wand, Text, Maßlinie. Traversen sind **keine** Zeichnungsform, sondern Objekte aus der Bibliothek (siehe Punkt 5), damit sie in Packlisten erscheinen
   - Optional Hintergrundbild/PDF-Grundriss importieren und per Referenzstrecke kalibrieren
   - Ebenen (z. B. Bühne, Licht, Ton, Strom, Netzwerk, Beschriftung) – ein-/ausblendbar, sperrbar
   - Zoom, Verschieben, Mehrfachauswahl, Drehen, Duplizieren, Rückgängig/Wiederholen

3. **Geräte**
   - Aus der Bibliothek auf die Fläche ziehen (in beiden Ansichten), frei platzierbar
   - **Komplett einfärbbar:** Füllfarbe des ganzen Kastens/Symbols (Farbwähler + Palette)
   - Anschlüsse als Ein- und Ausgänge sichtbar; Kabel von **Ausgang zu Eingang** (Richtung + Stecker werden geprüft; bidirektionale Ports wie Netzwerk erlaubt)
   - Pro Gerät: Kennung (z. B. „Spot 1“), Kategorie (Standard aus der Vorlage, **pro Gerät überschreibbar**), Besitzer, Anhänger, Inventarnummer (optional), Notiz, Position/Rotation/Höhe
   - **Höhe automatisch:** Wird ein Gerät auf ein Bühnenelement (z. B. Podest) gestellt oder an ein Stativ bzw. eine Traverse gehängt, übernimmt es dessen Höhe (überschreibbar) – wichtig für die Kabellänge
   - Kategorie ist **optional**; ohne Kategorie erscheint das Objekt unter „ohne Kategorie“
   - **Multicore/Stagebox als Gerät** (z. B. Stagebox-Ende mit 8 XLR-Ports + 1 Multipin-Port); das Multicore selbst ist ein Kabel zwischen den Multipin-Ports

4. **Vorlagen jederzeit änderbar – mit Wirkung auf alles**
   - Ändert man eine Vorlage (Gerät, Kabeltyp, Bühnenelement, Traverse, Stativ) in der Bibliothek, wirkt sich das **sofort auf alle Instanzen** aus – im offenen Projekt live und in **allen anderen Projekten beim nächsten Öffnen automatisch**.
   - Vorlagen-Eigenschaften (Ports, Abmessungen, Form, DMX-Modi) kommen immer aus der Vorlage. Instanz-Eigenschaften (Kennung, Position, Besitzer, Anhänger, Inventarnummer, DMX-Adresse) bleiben pro Instanz.
   - **Farbe und Kategorie:** Instanz nutzt die Werte der Vorlage, solange sie nicht bewusst pro Instanz überschrieben wurden („auf Vorlage zurücksetzen“ möglich). Ändert man die Vorlage, folgen alle nicht überschriebenen Instanzen.
   - Wird ein Port entfernt, an dem Kabel hängen: Kabel werden **nicht gelöscht**, sondern im Prüfungen-Panel als „Anschluss existiert nicht mehr“ markiert.
   - Fehlt eine Vorlage in der Bibliothek (z. B. Projekt von einem anderen Rechner), wird sie aus der im Projekt mitgespeicherten Kopie in die Bibliothek übernommen.
   - **Konflikt beim Öffnen/Importieren eines fremden Projekts:** Enthält das Projekt eine Vorlage mit gleicher Kennung, aber anderem Inhalt als die eigene Bibliothek, wird **nachgefragt** – pro Vorlage (oder „für alle“): **eigene behalten**, **fremde übernehmen** (überschreibt die eigene Vorlage, wirkt dann auf alle Projekte) oder **als Kopie anlegen** (fremde Vorlage wird unter neuer Kennung angelegt, das Projekt verwendet die Kopie). Gleiches gilt für Stammdaten (Kategorie/Besitzer/Anhänger mit gleicher Kennung, anderem Namen).
   - Eigene Projekte (zuletzt mit dieser Bibliothek gespeichert) werden ohne Nachfrage automatisch aktualisiert.
   - **Gleichzeitiges Ändern derselben Vorlage** durch zwei Personen: die zuletzt gespeicherte Änderung gewinnt; wer eine veraltete Fassung speichern will, bekommt den Hinweis „Vorlage wurde inzwischen von X geändert“ und kann neu laden oder überschreiben.

5. **Bühnenelemente, Traversen & Stative**
   - Eigene Vorlagen-Arten **Bühnenelement** (Podeste, Treppen, Geländer …), **Traverse** (Länge, Querschnitt/Typ als Notiz, Höhe über Boden) und **Stativ** (Licht-, Lautsprecher-, Mikrofonstative …)
   - Als Objekte auf dem Canvas (im Bühnenplan maßstäblich, in der Signalfluss-Ansicht optional ausblendbar)
   - **Geräte einem Stativ oder einer Traverse zuordnen** per Andocken oder in den Eigenschaften; das Gerät bewegt sich mit
   - **Höhe:** Die Vorlage gibt eine Standardhöhe vor; **jedes Stativ bzw. jede Traverse im Plan kann eine eigene Höhe haben** (z. B. Stativ auf 3,20 m ausgefahren). Daran hängende Geräte übernehmen diese Höhe.
   - **Filter nach Stativ/Traverse** auf Canvas und in Listen
   - Haben ebenfalls Kategorie, Besitzer, Anhänger, Inventarnummer und erscheinen in allen Abhak-/Packlisten

6. **Logistik: Kategorie, Besitzer, Anhänger – für alles**
   - Gilt für **Geräte, Kabel, Bühnenelemente, Traversen und Stative**
   - Stammdaten (Kategorien, Besitzer, Anhänger) **projektübergreifend** gespeichert, frei verwaltbar (anlegen, umbenennen, Farbe), Import/Export als JSON
   - **Löschen nur, wenn unbenutzt.** Wird ein Eintrag noch in Projekten oder Vorlagen verwendet, kann er stattdessen **archiviert** werden: er bleibt in bestehenden Projekten erhalten und sichtbar, ist für neue Zuordnungen aber nicht mehr auswählbar. Archivieren ist rückgängig machbar.
   - Zuordnung einzeln oder per **Mehrfachauswahl**
   - **Filter** nach Kategorie, Besitzer, Anhänger, Stativ (nicht passende Objekte werden ausgegraut)
   - Ansichtsmodus „Einfärben nach Besitzer/Anhänger/Kategorie“ (nur Anzeige)

7. **Kabel mit Längen**
   - Kabel von Ausgang zu Eingang; Stecker-Kompatibilität wird geprüft
   - Jedes Kabel hat Kategorie, Besitzer, Anhänger, Inventarnummer (Voreinstellung vom Kabeltyp)
   - Verlauf im Bühnenplan als Polylinie mit Knickpunkten
   - **Längenberechnung:** Planlänge + Höhe (Standard: zum Boden und wieder hoch) + Reserve (% und/oder fix pro Ende)
   - **Rundung auf verfügbare Längen**, die **pro Kabeltyp frei konfiguriert** werden; sind keine Längen hinterlegt, wird **auf ganze Meter aufgerundet**. Warnung, wenn keine verfügbare Länge reicht („Verlängerung nötig“)

8. **DMX-Adressen & Universen**
   - Pro Lichtgerät: Modus (Kanalanzahl), Universum, Startadresse
   - Prüfungen: Überlappung, Ende > 512, fehlende Adresse
   - Automatische Adressvergabe entlang der DMX-Kette
   - Anzeige von Universum/Adresse am Gerät (ein-/ausblendbar)

9. **Netzwerkplanung**
   - **Subnetze** anlegen (Name, Netz/Präfix, z. B. 192.168.1.0/24, Gateway, optional VLAN-Nummer als Notiz)
   - **IP-Adressen pro Gerät** bzw. pro Netzwerk-Port (statisch oder „DHCP“), Hostname
   - Prüfungen: doppelte IP, IP außerhalb des Subnetzes, fehlende IP bei statischer Konfiguration
   - Vorschlag der nächsten freien IP im Subnetz
   - **WLAN-Netze** anlegen (SSID, Verschlüsselung WPA2/WPA3/offen, Passwort, versteckt ja/nein, zugeordneter Access Point/Router aus dem Plan)
   - **WLAN-QR-Code** (Standardformat `WIFI:T:WPA;S:<SSID>;P:<Passwort>;H:<true|false>;;`) – in der App anzeigen und als **PDF-Aushang** (A4/A3) drucken
   - **Lese-Zugang sieht nur SSID und QR-Code**, nicht das WLAN-Passwort im Klartext. Die Passwörter liegen in einem **eigenen geschützten Bereich** des Projekts (nicht im live verteilten Projekt-Dokument); nur der Bearbeiten-Zugang kann sie abrufen. Den QR-Code erzeugt der Server und liefert Lese-Clients nur das fertige Bild. Der WLAN-Aushang darf vom Lese-Zugang gedruckt werden.
   - Netzwerkliste als PDF (Gerät, Hostname, IP, Subnetz, Port/Switch-Notiz)

10. **PDF-Export** (Format **A4 oder A3** auswählbar, Hoch/Quer)
    - **Planzeichnung** (Bühnenplan im Maßstab 1:50, 1:100, „Seite füllen“; Signalfluss-Ansicht) mit Planköpfchen (Projekt, Ort, Datum, Planer, Version) und Legende; aktive Filter werden übernommen
    - **Abhak-/Packliste** für Geräte, Kabel, Bühnenelemente, Traversen, Stative mit Kästchen ☐ Hin · ☐ Zurück, gruppiert **nach Kategorie**, **nach Anhänger** oder **nach Besitzer** (auch verschachtelt)
      - **Option beim Export:** gleiche Artikel zusammengefasst („6 × XLR 10 m“) **oder** einzeln mit Kennung/Inventarnummer
      - Zusammengefasst wird nur, was in **Vorlage, Länge, Besitzer und Anhänger** übereinstimmt
      - Spalten: ☐ Hin, ☐ Zurück, Anzahl, Bezeichnung, Typ/Länge, Kategorie, Besitzer, Anhänger, Stativ/Position, Notiz
      - Abschnitt „Fehlt / defekt“ am Ende (für die Rückgabe-Kontrolle)
      - Gruppe „nicht zugeordnet“ für Objekte ohne Besitzer/Anhänger; Unterschrift/Datum je Gruppe
    - **Packliste in der App** (Desktop, Browser, Handy): Abhaken pro Objekt; in der zusammengefassten Ansicht mit **Zähler** („4 von 6 × XLR 10 m“) – Antippen hakt das nächste Exemplar ab, Aufklappen zeigt die einzelnen Exemplare
    - Neben dem Häkchen pro Exemplar auch Status **„fehlt“** oder **„defekt“** mit kurzer Notiz (Hin und Zurück getrennt); erlaubt für Bearbeiten- und Lese-Zugang
    - **„Häkchen zurücksetzen“** (Hin, Zurück oder beides; mit Rückfrage, im Änderungsprotokoll vermerkt) – **nur mit Bearbeiten-Zugang**
    - **Kabelliste**, **Stückliste**, **DMX-Patchliste**, **Geräteliste**, **Netzwerkliste**, **WLAN-Aushang**
    - Zusätzlich CSV-Export der Listen

11. **Eigene Bibliothek**
    - Startet **leer**
    - Vorlagen-Arten: **Gerät**, **Kabeltyp**, **Bühnenelement**, **Traverse**, **Stativ**
    - Geräte-Editor: Name, Hersteller, Kategorie, Standardfarbe, Form (Rechteck/Kreis/abgerundet) + Abmessungen, Ports (Anzahl, Stecker, Ein-/Ausgang, Signalart, Netzwerk-Port ja/nein), DMX-Modi, Leistung (W, für Phase 2)
    - Import/Export als JSON (zum Teilen im Verein/Team)

12. **Projekte verwalten**
    - Neu, öffnen, speichern, speichern unter, zuletzt geöffnet
    - **Mehrere Projekte gleichzeitig** am Desktop: ein Fenster pro Projekt
    - **Automatische Versionen:** die letzten 30 Stände pro Projekt werden aufbewahrt (beim Speichern, höchstens ein Stand pro 10 Minuten aktiver Bearbeitung) und lassen sich ansehen und wiederherstellen (Wiederherstellen nur mit Bearbeiten-Zugang). Lokal in einem Versionsordner im App-Datenordner, auf dem Server im Volume.
    - **Projekt als Vorlage kopieren** („Neues Projekt aus diesem“): übernimmt Plan, Geräte, Kabel, Zuordnungen; Häkchen, Änderungsprotokoll und Meta-Daten (Datum, Version) werden zurückgesetzt

13. **Desktop, Docker, Server-Verbindung & Web-Zugriff per QR** (Details Abschnitt 5)
    - **Desktop-App** für Mac/Windows, zwei Betriebsarten:
      - **Lokal:** `.steckplan`-Dateien **frei speichern** (z. B. in einem Nextcloud-Ordner), **Doppelklick öffnet** die Datei in Steckplan; Bibliothek und Stammdaten liegen auf dem Rechner
      - **Mit Server verbunden (live):** die Desktop-App verbindet sich mit einem Steckplan-Server (Docker) und arbeitet direkt auf dessen **Projekten, Bibliothek und Stammdaten** – gleichzeitig mit allen anderen Personen; Netzverbindung nötig
      - Anmeldung am Server mit einem **Desktop-Zugangsschlüssel**, der in den Server-Einstellungen erzeugt wird
      - Mehrere Server-Verbindungen speicherbar; Umschalten „Lokal“ ↔ Server in der App
      - Übertragen zwischen beiden Welten: lokales Projekt auf den Server hochladen, Server-Projekt als `.steckplan` herunterladen; Bibliothek/Stammdaten per Import/Export
    - **Name am Desktop:** wird einmal in den Einstellungen festgelegt und bei Häkchen und Änderungen verwendet (lokal und bei Server-Verbindung)
    - **Docker-Image**: volle App im Browser, Projekte und Bibliothek liegen auf dem Server (Volume); **mehrere Personen gleichzeitig**
    - **Weboberfläche am Desktop starten** (nur im lokalen Modus): Knopf „Weboberfläche starten“ → die App wird im lokalen Netz erreichbar, ein **QR-Code** mit der Adresse wird angezeigt → Handy/Tablet scannt, meldet sich an und sieht **nur die am Desktop gerade geöffneten Projekte** (kein Zugriff auf andere Dateien des Rechners). Je nach Zugang kann man
      - Pläne und Listen **ansehen**,
      - die **Packliste abhaken** (Häkchen erscheinen live bei allen),
      - **mitbearbeiten** (alles, auch Geräte verschieben und Kabel ziehen).
    - **Zugang mit zwei Passwörtern – für Docker und für die QR-Weboberfläche gleich:**
      - **Bearbeiten-Passwort:** volle Bearbeitung auf jedem Gerät (Desktop-Browser, Tablet, Handy)
      - **Lese-Passwort:** alles ansehen, **Packliste abhaken und „fehlt/defekt“ setzen erlaubt**, sonst keine Änderungen (auch kein Zurücksetzen der Häkchen)
      - Beim Anmelden wird zusätzlich ein **Name eingetippt** (kein Benutzerkonto); der Name wird bei Häkchen und Änderungen angezeigt
    - Die Person direkt an der lokalen Desktop-App braucht kein Passwort (volle Rechte)
    - **Gleichzeitiges Arbeiten** mehrerer Personen am selben Projekt; Änderungen werden live verteilt; Anzeige, wer gerade verbunden ist
    - **Wer hat was gemacht:** Häkchen mit Name + Zeit; pro Objekt „zuletzt geändert von/am“; einfaches Änderungsprotokoll pro Projekt (wer, wann, was)
    - Handy-taugliche Oberfläche (große Tippflächen, Packliste als Hauptansicht auf kleinen Bildschirmen)

### 3.2 Phase 2 (nach dem MVP)

1. **Ton-Patch / Stagebox-Kanäle** – Quelle → Stagebox-Kanal → Multicore → Pult-Kanal; Input-Liste als PDF
2. **Stromberechnung** – Leistung pro Gerät, Stromkreise/Verteiler mit Absicherung, Phasen L1/L2/L3, Überlast-/Schieflast-Warnungen, Stromliste als PDF
3. Weitere Ideen (unpriorisiert): Gerätegruppen als Vorlage, Kabel-Etiketten mit QR, mehrere Pläne pro Projekt

### 3.3 Nicht-Ziele

- 3D-Darstellung, Live-DMX-Ausgabe / Lichtsteuerung
- Cloud-Dienst, Benutzerkonten im Internet
- MVR/GDTF-Import/Export (kann später neu bewertet werden)
- Zubehör ohne Platz auf dem Canvas (z. B. Gaffa, Ersatzkabel) – alles in den Listen stammt aus dem Plan
- Mehrsprachigkeit im MVP
- Switch-Port-/VLAN-Verwaltung als eigene Funktion (nur Notizfelder)

---

## 4. Technik-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Desktop-Hülle | **Electron** | entschieden |
| UI | **React 19 + TypeScript**, Vite | entschieden; dieselbe UI für Desktop, Docker-Web und Handy |
| 2D-Zeichenfläche | **Konva / react-konva** | performantes Canvas, Ebenen, Hit-Testing, Touch-Unterstützung |
| Server | **Node.js + Fastify** (HTTP + WebSocket) | läuft eingebettet im Electron-Main-Prozess **und** eigenständig im Docker-Container |
| Echtzeit-Sync | **Yjs** (CRDT) über WebSocket (`y-websocket`-Protokoll, eigener Server-Adapter) | konfliktfreies gleichzeitiges Bearbeiten Desktop/Handy/Browser, Undo pro Nutzer |
| Lokaler UI-State | **Zustand** (Ansicht, Auswahl, Filter) | |
| Validierung/Schema | **Zod** | Projekt-, Bibliotheks- und Stammdaten validieren, Migrationen |
| Speicherung | JSON-Dateien | Desktop lokal: frei gewählte `.steckplan`-Datei, Bibliothek/Stammdaten/Versionen im App-Datenordner; Docker: Volume `/data` |
| PDF | **pdf-lib** oder **pdfmake** + Vektor-Export der Zeichnung | finale Wahl im M7 per kurzem Spike; erzeugt im Client (läuft überall gleich) |
| QR-Codes | **qrcode** (npm) | Web-Zugang und WLAN |
| UI-Komponenten | Tailwind CSS + Radix UI (oder shadcn/ui) | |
| Tests | **Vitest** (Logik), **Playwright** (E2E Electron + Browser) | |
| Paketierung | **electron-builder** (`.dmg` Universal, `.exe` NSIS) · **Docker** (Multi-Arch amd64/arm64) | |
| CI/CD | **GitHub Actions** | Tests bei jedem Push; Installer + Docker-Image (GHCR) bei Release |

Alle Bibliotheken müssen **GPL-3-kompatibel** sein (MIT, BSD, Apache-2.0, LGPL). `THIRD_PARTY_LICENSES.md` wird automatisch erzeugt.

---

## 5. Architektur

Eine Codebasis, drei Betriebsarten. Die UI spricht **immer** über dieselbe API (HTTP + WebSocket) mit einem Steckplan-Server – nur wo dieser läuft, unterscheidet sich:

| Betriebsart | Server läuft | Daten liegen |
|---|---|---|
| Desktop **lokal** | eingebettet im Electron-Main-Prozess | `.steckplan`-Datei frei gewählt; Bibliothek/Stammdaten im App-Datenordner |
| Desktop **mit Server verbunden** | entfernt (Docker) | auf dem Server (Volume `/data`) |
| **Browser/Handy** | Docker oder Desktop („Weboberfläche starten“) | wie beim jeweiligen Server |

```
                ┌──────────────── packages/server (Fastify) ────────────────┐
                │ REST: Projekte, Bibliothek, Stammdaten, Import/Export      │
                │ WebSocket: Yjs-Sync pro Projekt (live, mehrere Clients)    │
                │ Speicher: JSON-Dateien im Datenordner                      │
                │ Bibliotheks-Abgleich beim Öffnen (Vorlagen-Updates)        │
                └───────────────▲───────────────────────▲───────────────────┘
                                │                       │
   ┌─── Desktop (Electron) ─────┴──────┐     ┌──── Docker ──┴─────────────────┐
   │ Main-Prozess startet Server       │     │ Container startet Server       │
   │  - standardmäßig nur 127.0.0.1    │     │  - lauscht auf 0.0.0.0:8080    │
   │  - „Weboberfläche starten“:       │     │  - liefert die UI aus          │
   │    zusätzlich im LAN erreichbar   │     │  - Daten im Volume /data       │
   │    + QR-Code mit URL (Login)      │     └────────────────────────────────┘
   │ Renderer = packages/ui            │
   │ Native Menüs, Dateidialoge        │     Handy / Tablet / Browser
   │ (.steckplan öffnen/speichern)     │      = packages/ui (responsive)
   │ oder: verbunden mit Docker-Server │
   └───────────────────────────────────┘

packages/core   – reines TypeScript: Datenmodell, Zod-Schemas, Geometrie,
                  Kabellängen, DMX, Netzwerk/IP-Prüfung, Listen, Filter, Migrationen
packages/ui     – React-App (Desktop-Renderer, Docker-Web und Handy identisch)
packages/server – Fastify-Server (eingebettet oder eigenständig)
```

### 5.1 Desktop – lokal

- Electron-Main startet den eingebetteten Server auf `127.0.0.1` mit zufälligem Port; der Renderer lädt die UI und verbindet sich lokal.
- Projekte sind **`.steckplan`-Dateien an beliebigem Ort**; Öffnen/Speichern über native Dialoge; **Dateizuordnung** (Doppelklick auf `.steckplan` öffnet Steckplan, macOS „Öffnen mit“, Windows-Dateityp-Registrierung durch den Installer).
- Der eingebettete Server öffnet die gewählte Datei und speichert automatisch (Autosave) **in diese Datei** zurück; atomar (temporäre Datei + Umbenennen), damit Sync-Ordner wie Nextcloud keine halben Dateien sehen.
- **Sperrdatei** (`<name>.steckplan.lock` – bewusst **ohne** führenden Punkt, weil Sync-Clients wie Nextcloud versteckte Dateien je nach Einstellung nicht übertragen; Inhalt: Rechnername, Name, Zeit, regelmäßig aktualisiert) neben der Datei: öffnet ein zweiter Rechner dieselbe Datei (z. B. über Nextcloud), erscheint eine Warnung „wird gerade von X bearbeitet – nur lesen öffnen?“. Ist die Sperre veraltet (z. B. nach einem Absturz, Zeitstempel älter als 10 Minuten), wird „**Sperre übernehmen**“ angeboten. Beim Schließen wird die Sperrdatei gelöscht. Gleichzeitiges Bearbeiten über Rechner hinweg geht nur über die Weboberfläche oder einen Server, nicht über einen gemeinsamen Dateiordner.
- Bibliothek, Stammdaten und automatische Versionen liegen im App-Datenordner des Rechners.
- Mehrere Projekte gleichzeitig: ein Fenster pro Projekt, alle über denselben eingebetteten Server.
- **Name am Desktop** in den Einstellungen (Pflicht beim ersten Start).
- **„Weboberfläche starten“** (Menü + Knopf, nur im lokalen Modus):
  - Server zusätzlich auf der LAN-Schnittstelle freigeben (Auswahl der Netzwerkschnittstelle, wenn mehrere vorhanden)
  - **Bearbeiten- und Lese-Passwort** werden in den Einstellungen der Desktop-App festgelegt (beim ersten Start der Weboberfläche abgefragt, wenn noch keine gesetzt sind)
  - QR-Code mit der Adresse (`http://<LAN-IP>:<Port>/`) + URL im Fenster anzeigen; der QR-Code enthält **kein** Passwort
  - Web-Clients sehen **nur die am Desktop geöffneten Projekte**; kein Dateibrowser, kein Zugriff auf andere Dateien. Wird ein Projekt am Desktop geschlossen, wird es auch für die Web-Clients geschlossen (mit Hinweis).
  - Liste der verbundenen Personen (Name, Zugang Bearbeiten/Lesen); einzelne trennen; „Weboberfläche beenden“ trennt alle
- Hinweis bei Firewall-Abfrage (macOS/Windows) im UI erklären.

### 5.1a Desktop – mit Server verbunden

- „Mit Server verbinden“: Server-Adresse + **Desktop-Zugangsschlüssel** eingeben; mehrere Server speicherbar, Schlüssel im Schlüsselbund des Betriebssystems (macOS Keychain / Windows Credential Manager).
- Die Desktop-App nutzt dann **ausschließlich** den entfernten Server: Projektliste, Bibliothek, Stammdaten, Live-Sync mit allen anderen.
- Der eingebettete lokale Server bleibt für den lokalen Modus bestehen; „Weboberfläche starten“ ist nur im lokalen Modus verfügbar (im Server-Modus nutzt man die Weboberfläche des Servers).
- Verbindungsanzeige in der Statusleiste (verbunden / getrennt / verbinde neu). Bei Verbindungsabbruch: Bearbeiten wird gesperrt mit Hinweis, Ansehen bleibt möglich; automatischer Neuverbindungsversuch. (Offline-Arbeiten mit späterem Abgleich ist **nicht** vorgesehen.)
- Übertragen: lokales Projekt „auf Server hochladen“ (mit Vorlagen-Konfliktabfrage wie beim Import), Server-Projekt „als Datei herunterladen“.

### 5.2 Docker

- Ein Image `ghcr.io/rde-master/steckplan` (gebaut auf GitHub Actions; Tags `develop`, `latest`, `X.Y.Z`), startet den Server und liefert die UI aus.
- Daten im Volume `/data` (Projekte, Bibliothek, Stammdaten, Desktop-Zugangsschlüssel, automatische Versionen).
- Konfiguration per Umgebungsvariablen: `PORT` (Standard 8080), **`STECKPLAN_EDIT_PASSWORD`** (Pflicht), **`STECKPLAN_READ_PASSWORD`** (Pflicht), `TZ`. Ohne gesetzte Passwörter startet der Container nicht (klare Fehlermeldung).
- Mehrere Personen gleichzeitig; Anmeldung im Browser mit Passwort + Name.
- **Desktop-Zugangsschlüssel:** in den Server-Einstellungen (nur mit Bearbeiten-Zugang) erzeugen, mit Bezeichnung (z. B. „MacBook Ralf“) und Zugangsstufe (Bearbeiten oder Lesen); Schlüssel wird nur einmal angezeigt, ist einzeln widerrufbar, „zuletzt benutzt“ wird angezeigt. Der Name für Häkchen/Änderungen kommt aus den Einstellungen der Desktop-App.
- Beispiel `docker-compose.yml` im Repo.
- Import/Export `.steckplan` über Upload/Download im Browser.

### 5.3 Echtzeit & Konflikte

- Jedes geöffnete Projekt ist auf dem Server ein Yjs-Dokument; alle Clients (Desktop-Fenster, Handys, Browser) sind live verbunden.
- Änderungen erscheinen sofort bei allen; gleichzeitige Änderungen werden durch Yjs konfliktfrei zusammengeführt.
- Server speichert periodisch und beim Schließen als JSON (Snapshot) – die Datei bleibt menschenlesbar.
- Packlisten-Häkchen sind Teil des Projekts (pro Exemplar `check.out` = Hin und `check.in` = Zurück, jeweils mit Status ok/fehlt/defekt, optionaler Notiz, Zeitstempel und **Name**).
- Undo/Redo pro Client (Yjs UndoManager).
- **Rechte werden serverseitig durchgesetzt:** Clients mit Lese-Zugang erhalten das Yjs-Dokument nur lesend (Server verwirft Yjs-Updates von ihnen). Häkchen und „fehlt/defekt“ setzen sie über einen eigenen, eng begrenzten Befehl (`check`/`uncheck`/`setStatus` für ein Exemplar), den der Server prüft und dann selbst ins Dokument schreibt. „Häkchen zurücksetzen“ und „Version wiederherstellen“ sind nur für `edit`/`local` erlaubt.
- **Geschützter Bereich:** WLAN-Passwörter sind **nicht** Teil des Yjs-Dokuments, sondern liegen in einem eigenen Bereich (`secrets`) des Projekts. Der Server liefert ihn nur an `edit`/`local` per REST aus; für alle Clients erzeugt der Server die WLAN-QR-Codes als Bild.
- Präsenz: verbundene Personen (Name, Zugang) werden allen angezeigt (Yjs Awareness).
- **Bibliothek und Stammdaten** liegen außerhalb der Projekt-Dokumente. Ändert jemand eine Vorlage oder einen Stammdaten-Eintrag, schickt der Server die Änderung als eigene Nachricht an **alle** verbundenen Clients (auch die in anderen Projekten); die Clients aktualisieren ihre Bibliothek, und der Server aktualisiert den `templateSnapshot` in den gerade geöffneten Projekten. Nicht geöffnete Projekte werden beim nächsten Öffnen abgeglichen.
- Gleichzeitiges Ändern derselben Vorlage: optimistische Sperre über `Template.version` – speichert jemand auf Basis einer veralteten Version, antwortet der Server mit „inzwischen geändert von X“; der Client bietet „neu laden“ oder „trotzdem überschreiben“ an.
- **Automatische Versionen:** Der Server legt beim Speichern eine Kopie des Projekts im Versionsordner ab (höchstens eine pro 10 Minuten aktiver Bearbeitung, die letzten 30 werden behalten).
- **Berechnete Werte** (Kabellängen, DMX-Konflikte, Netzwerk-Prüfungen, Listen) werden **nicht im Projekt gespeichert**, sondern in jedem Client aus den Daten berechnet (`packages/core`). So gibt es keine Konflikte beim gleichzeitigen Bearbeiten und keine veralteten Werte nach Vorlagen-Änderungen. Für PDF/CSV wird ebenfalls frisch berechnet.
- Änderungsprotokoll: Server protokolliert pro Projekt Name, Zeit und betroffene Objekte (zusammengefasst, nicht jede Mausbewegung).

### 5.4 Anmeldung & Sicherheit

- **Zwei Zugangsstufen:** `edit` (Bearbeiten-Passwort) und `read` (Lese-Passwort: ansehen, abhaken und „fehlt/defekt“ setzen; kein Zurücksetzen, kein Wiederherstellen). Gilt identisch für Docker, Desktop-Weboberfläche und Desktop-Zugangsschlüssel. Die Person an der lokalen Desktop-App hat `local` (volle Rechte).
- **Desktop-Zugangsschlüssel** (nur Docker-Server): zufällig, lang, nur gehasht gespeichert, mit Zugangsstufe; Übertragung als `Authorization`-Header; widerrufen beendet die Verbindung sofort.
- Lese-Clients erhalten keine WLAN-Passwörter (sie liegen im geschützten Bereich `secrets`, siehe 5.3).
- Anmeldeseite: Passwort + Name; danach Sitzung per HttpOnly-Cookie (SameSite=Strict); Abmelden möglich.
- Passwörter werden nur gehasht gespeichert (argon2 oder scrypt); Vergleich zeitkonstant; Begrenzung von Fehlversuchen (Rate-Limit pro IP).
- Ändern der Passwörter beendet alle bestehenden Sitzungen.
- Hinweis in der Doku: Docker für Zugriff von außen nur hinter einem Reverse-Proxy mit HTTPS betreiben.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, nur freigegebene IPC-Kanäle.
- Keine Passwörter oder Projektinhalte in Logs.
- WLAN-Passwörter liegen im Projekt im Klartext (nötig für den QR-Code) → im UI darauf hinweisen; beim Export optional „Passwörter weglassen“.
- Für den Server-Modus über das Internet: nur per HTTPS (Reverse-Proxy); die Desktop-App warnt bei unverschlüsselter Verbindung außerhalb privater IP-Bereiche.

---

## 6. Datenmodell (Entwurf)

Alle Maße intern in **Millimetern**, Winkel in Grad, jede Entität mit stabiler `id` (UUID).

```ts
Project {
  schemaVersion: number
  libraryId: string                  // Bibliothek/Server, mit der das Projekt zuletzt gespeichert wurde
  meta: { name, venue, date, planner, client, version, notes }
  settings: { gridMm, snap, defaultReservePercent, defaultReservePerEndMm }
  layers: Layer[]
  shapes: Shape[]                    // nur Zeichnungsformen: Wand, Text, Maßlinie (ohne Logistik)
  devices: DeviceInstance[]          // inkl. Bühnenelemente, Traversen und Stative
  cables: Cable[]
  network: { subnets: Subnet[], wifi: WifiNetwork[] }
  secrets: { wifiPasswords: { wifiId, password }[] }   // NICHT im Yjs-Dokument, nur für edit/local
  templateSnapshot: Template[]       // Kopie verwendeter Vorlagen (nur für Portabilität)
  masterDataSnapshot: MasterData     // Kopie verwendeter Stammdaten (nur für Portabilität)
  views: { stagePlan: { zoom, pan }, signalFlow: { zoom, pan } }
  background?: { image, calibration: { p1, p2, realDistanceMm } }
}

MasterData {                         // projektübergreifend (lokal im App-Datenordner bzw. auf dem Server)
  categories: { id, name, color?, archived?: boolean }[]
  owners:     { id, name, color?, contact?, archived?: boolean }[]
  trailers:   { id, name, color?, notes?, archived?: boolean }[]
}

Template {                           // Bibliothek, projektübergreifend
  id, kind: 'device'|'cableType'|'stageElement'|'truss'|'stand',
  version: number, updatedAt,        // für den automatischen Abgleich
  name, manufacturer?, categoryId?, defaultColor?,   // ohne Kategorie → „ohne Kategorie“
  defaultOwnerId?, defaultTrailerId?,
  shape?: { form: 'rect'|'circle'|'rounded', widthMm, depthMm, heightMm? }
                                     // heightMm bei Bühnenelement/Traverse/Stativ = Standardhöhe,
                                     // pro Instanz überschreibbar (stagePlan.heightMm)
                                     // mm-Maße gelten nur im Bühnenplan; in der Signalfluss-Ansicht
                                     // ergibt sich die Kastengröße aus Name und Anzahl der Ports
  ports?: PortDef[]
  dmxModes?: { name, channels }[]
  powerW?: number                    // Phase 2
  maxMountedDevices?: number         // nur Stative und Traversen
  lengthMm?: number                  // nur Traversen
  // nur Kabeltypen:
  connectorA?, connectorB?, signal?, maxLengthMm?, availableLengthsMm?: number[]
}

PortDef { id, label, connector, direction: 'in'|'out'|'bi', signal, isNetwork?: boolean }

DeviceInstance {
  id, templateId, layerId, label,
  colorOverride?,                    // fehlt = Standardfarbe der Vorlage
  categoryOverride?,                 // fehlt = Kategorie der Vorlage
  notes?,
  ownerId?, trailerId?, inventoryNo?,
  stagePlan?:  { position, rotationDeg, heightMm?, standsOnId? },
                                     // standsOnId = Bühnenelement, auf dem das Gerät steht;
                                     // heightMm fehlt = Höhe übernehmen (siehe 7.1);
                                     // bei Stativ/Traverse selbst: eigene Höhe, sonst Standardhöhe der Vorlage
  signalFlow?: { position },
  mountedOnId?,                      // Stativ oder Traverse (DeviceInstance mit kind 'stand' | 'truss')
  dmx?: { modeName, universe, address },
  network?: { portId, mode: 'static'|'dhcp', ip?, subnetId?, hostname? }[],
  check?: { out?: CheckMark, in?: CheckMark }   // Packliste
}

Cable {
  id, templateId, label?,
  ownerId?, trailerId?, inventoryNo?, categoryOverride?,
  from: { deviceId, portId }, to: { deviceId, portId },
  waypoints: Point[], signalFlowWaypoints?: Point[],
  heightRule?: 'floor'|'direct',     // Standard 'floor'
  reservePercent?, reservePerEndMm?, manualLengthMm?,
  check?: { out?: CheckMark, in?: CheckMark }
  // Länge wird NICHT gespeichert, sondern per core.computeCableLength(project, cable) berechnet:
  //   → { planLengthMm, heightDeltaMm, totalMm, chosenLengthMm | null, warnings }
}

CheckMark {
  at: ISODate, by: string,           // eingetippter Name bzw. Name aus den Desktop-Einstellungen
  status: 'ok'|'missing'|'damaged',  // abgehakt / fehlt / defekt
  note?: string
}

// zusätzlich auf DeviceInstance und Cable:
//   lastModified?: { at: ISODate, by: string }

ChangeLogEntry {
  at: ISODate, by: string,
  access: 'local'|'edit'|'read',      // 'local' = direkt an der lokalen Desktop-App
  via: 'desktop'|'browser'|'desktopKey',
  action: string, objectIds: string[]
}
// Server-Modus: pro Projekt serverseitig gespeichert, nicht im .steckplan-Export
// Lokal: in der .steckplan-Datei (Abschnitt changeLog, auf die letzten N Einträge begrenzt)

DesktopKey {                           // nur auf dem Docker-Server
  id, label, access: 'edit'|'read', keyHash, createdAt, lastUsedAt?, revoked?: boolean
}

Subnet { id, name, cidr, gateway?, vlanNote? }
WifiNetwork { id, ssid, security: 'WPA2'|'WPA3'|'WPA2/WPA3'|'open', hidden, accessPointDeviceId? }
                                       // Passwort liegt in Project.secrets, nicht hier
```

**Vorlagen-Abgleich beim Öffnen/Importieren/Hochladen:**
1. Vorlage fehlt in der Bibliothek → aus dem Snapshot übernehmen.
2. Vorlage gleich (Inhalt/Version) → nichts tun.
3. Vorlage verschieden und das Projekt wurde zuletzt **mit dieser Bibliothek** gespeichert (Kennung der Bibliothek im Projekt vermerkt: `libraryId`) → Bibliothek ist maßgeblich, Snapshot wird automatisch aktualisiert.
4. Vorlage verschieden und das Projekt stammt **aus einer anderen Bibliothek** → **Nachfrage** pro Vorlage: eigene behalten / fremde übernehmen / als Kopie anlegen (bei Kopie werden die `templateId`s der betroffenen Instanzen im Projekt umgeschrieben).
5. Danach Prüfung auf verwaiste Kabel (Port entfernt).

Dasselbe Verfahren für Stammdaten. Dafür bekommt `Project` zusätzlich das Feld `libraryId` (Kennung der Bibliothek/des Servers, mit der das Projekt zuletzt gespeichert wurde).

**Datei:** `.steckplan` = eine JSON-Datei (mit `schemaVersion`), Hintergrundbild optional eingebettet (Base64). Migrationen in `core/migrations`, mit Tests pro Version.

---

## 7. Kernlogik

### 7.1 Kabellänge

```
Planlänge = Summe der Segmente: Port A → Wegpunkte → Port B
Höhe      = 'floor' (Standard):  Höhe A + Höhe B
            'direct':            |Höhe A − Höhe B|
Reserve   = Planlänge × Reserve% + 2 × Reserve pro Ende
Gesamt    = Planlänge + Höhe + Reserve
Gewählt   = kleinste konfigurierte Länge ≥ Gesamt (keine Längen konfiguriert → auf ganze Meter aufrunden)
            reicht keine → Warnung „Verlängerung nötig“
```

Höhe eines Geräts = eigene Höhe, falls gesetzt; sonst Höhe des Stativs bzw. der Traverse, an dem/der es hängt (deren Instanz-Höhe, sonst Standardhöhe der Vorlage); sonst Höhe des Bühnenelements, auf dem es steht; sonst 0. Die Länge wird bei jeder Anzeige frisch berechnet (nicht gespeichert, siehe 5.3). Unit-Tests mit festen Beispielen.

### 7.2 DMX

Footprint `[address, address + channels − 1]`; Prüfungen Überlappung, > 512, fehlende Adresse/Modus; Auto-Adressierung entlang der DMX-Kette.

### 7.3 Netzwerk

- IP-/CIDR-Berechnung in `core` (eigene kleine Funktionen oder MIT-lizenzierte Bibliothek)
- Prüfungen: doppelte IP, IP außerhalb Subnetz, Netz-/Broadcast-Adresse vergeben, fehlende IP
- Nächste freie IP vorschlagen
- WLAN-QR: Sonderzeichen in SSID/Passwort korrekt escapen (`\`, `;`, `,`, `:`, `"`) – mit Tests

### 7.4 Listen & Filter

- Alle Listen (Kabel, Stück, Pack, DMX, Geräte, Netzwerk) als Datenstruktur in `core` → dieselbe Quelle für Bildschirm, PDF, CSV
- Packliste: Gruppierung nach Kategorie/Anhänger/Besitzer (auch verschachtelt), Option zusammengefasst/einzeln; zusammengefasst wird nur bei gleicher Vorlage, Länge, Besitzer und Anhänger; zusammengefasste Zeilen mit Zähler (abgehakt/gesamt), Häkchen und Status bleiben pro Exemplar gespeichert; Abschnitt „Fehlt / defekt“
- Prüfung: doppelte Inventarnummern (Warnung im Prüfungen-Panel)
- „Häkchen zurücksetzen“ und „Neues Projekt aus diesem“ als Funktionen in `core` (mit Tests)
- Gemeinsame Filterfunktion (Kategorie, Besitzer, Anhänger, Stativ/Traverse) für Canvas, Listen und PDF

### 7.5 Stativ- und Traversen-Zuordnung

Andocken an ein Stativ oder eine Traverse setzt `mountedOnId`, Position folgt dem Träger (bei Traversen entlang der Traverse verschiebbar), Lösen per Kontextmenü/Wegziehen, Warnung bei mehr Geräten als `maxMountedDevices`.

Analog: Wird ein Gerät im Bühnenplan auf einem Bühnenelement abgelegt, wird `standsOnId` gesetzt und die Höhe übernommen (solange keine eigene Höhe gesetzt ist).

---

## 8. Benutzeroberfläche

```
┌ Menü: Datei · Bearbeiten · Ansicht · Plan · Netzwerk · Export · Hilfe   [Weboberfläche starten ▣] ┐
├ Ansicht: [ Signalfluss | Bühnenplan ]   Filter: Kategorie ▾ Besitzer ▾ Anhänger ▾ Stativ/Traverse ▾ ┤
├─────────────┬──────────────────────────────────────────────┬────────────────┤
│ Bibliothek  │            Zeichenfläche (Konva)             │ Eigenschaften  │
│ - Geräte    │  Signalfluss: Kästen mit Ports, frei         │ Farbe,         │
│ - Kabeltypen│  Bühnenplan: Raster · Maßstab · Ebenen       │ Kategorie,     │
│ - Bühnen-   │                                              │ Besitzer,      │
│   elemente  │                                              │ Anhänger,      │
│ - Traversen │                                              │ Stativ, DMX,   │
│ - Stative   │                                              │                │
│ [Suche]     │                                              │ Netzwerk …     │
├─────────────┴──────────────────────────────────────────────┴────────────────┤
│ Unten: Kabelliste · DMX-Patch · Netzwerk · Stückliste · Packliste · Prüfungen │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Signalfluss-Ansicht:** Kasten in Gerätefarbe, Titelzeile mit Name, Eingänge links, Ausgänge rechts; beim Ziehen eines Kabels werden passende Eingänge hervorgehoben; Kabel folgen beim Verschieben automatisch; Minikarte; Ausrichten/Verteilen
- **Netzwerk-Bereich:** Subnetze und WLAN-Netze verwalten, IP-Tabelle, WLAN-QR anzeigen/drucken
- **Weboberfläche-Dialog:** QR-Code groß, URL zum Abtippen, verbundene Personen (Name, Zugang), Trennen, Beenden; Link zu den Passwort-Einstellungen
- **Anmeldeseite** (Browser/Handy): Passwort + Name, Hinweis welcher Zugang aktiv ist („Nur lesen + abhaken“ / „Bearbeiten“)
- **Handy-Ansicht** (schmale Bildschirme): Startseite mit Packliste (Gruppierung wählbar, große Häkchen), Plan ansehen und – mit Bearbeiten-Zugang – voll bearbeiten (Touch: Ziehen, Zoom per Geste, langes Drücken für Kontextmenü)
- Mit Lese-Zugang sind alle Bearbeiten-Elemente ausgeblendet bzw. deaktiviert
- Anzeige „zuletzt geändert von/am“ in den Eigenschaften, Änderungsprotokoll als eigene Liste
- **Stammdaten-Dialog:** Kategorien, Besitzer, Anhänger; Löschen nur wenn unbenutzt, sonst „Archivieren“; Filter „Archivierte anzeigen“
- **Import-Konflikt-Dialog:** Liste der abweichenden Vorlagen/Stammdaten mit Gegenüberstellung (eigene ↔ fremde) und Auswahl pro Eintrag oder „für alle“
- **Verbindungen** (Desktop): Umschalter „Lokal“ / gespeicherte Server; Dialog „Mit Server verbinden“ (Adresse, Desktop-Zugangsschlüssel); Statusanzeige der Verbindung
- **Server-Einstellungen** (Docker, nur Bearbeiten-Zugang): Desktop-Zugangsschlüssel erzeugen/widerrufen
- **Einstellungen** (Desktop): eigener Name, Passwörter für die Weboberfläche, Update-Hinweis an/aus
- **Versionen-Dialog:** Liste der automatischen Stände (Zeit, wer), Vorschau, Wiederherstellen (nur Bearbeiten-Zugang)
- **Packliste:** pro Exemplar Häkchen sowie „fehlt“ / „defekt“ mit Notiz
- **Prüfungen-Panel:** alle Warnungen (Längen, DMX, Stecker, Netzwerk, verwaiste Kabel, nicht zugeordnet, doppelte Inventarnummern), Klick springt zum Objekt
- Texte nur Deutsch, zentral in einer Datei abgelegt

---

## 9. Repository-Struktur

```
/
├─ apps/
│  ├─ desktop/            # Electron (main, preload); lädt packages/ui, startet packages/server
│  └─ docker/             # Dockerfile, docker-compose.yml, Entrypoint
├─ packages/
│  ├─ core/               # Fachlogik, Schemas, Tests
│  ├─ ui/                 # React-App (Desktop, Web, Handy)
│  └─ server/             # Fastify + WebSocket (Yjs), Speicherung
├─ docs/                  # Benutzerhandbuch, Architektur, Dateiformat, Docker-Anleitung
├─ .github/workflows/     # CI, Release (Installer + Docker-Image)
├─ LICENSE                # GPL-3.0
├─ README.md · CONTRIBUTING.md · CHANGELOG.md · PLAN.md
```

Monorepo mit **pnpm workspaces**.

---

## 10. Meilensteine

Jeder Meilenstein endet mit grünen Tests, lauffähigem Build (Desktop **und** Docker ab M0) und CHANGELOG-Eintrag.

| # | Meilenstein | Ergebnis / Abnahmekriterium |
|---|---|---|
| **M0** | Projektgerüst | Monorepo (core/ui/server/desktop/docker), Electron startet leeres Fenster auf Mac & Windows, Docker-Container liefert dieselbe leere UI im Browser; Lint, Vitest; **GitHub Actions bauen von Anfang an Desktop-Installer (macOS/Windows, als Artefakte) und Docker-Image (`:develop` auf GHCR)**; GPL-3, README; Version `0.1.0` |
| **M1** | Datenmodell, Server, Sync & Anmeldung | Zod-Schemas, Server mit Projekt-Verwaltung; Desktop lokal: `.steckplan` frei öffnen/speichern, Doppelklick-Zuordnung, Autosave, Sperrdatei, mehrere Projekte in eigenen Fenstern, automatische Versionen + Wiederherstellen; Docker: Projektliste, Upload/Download; Yjs-Sync über WebSocket, zwei Browserfenster bearbeiten live dasselbe Projekt; Anmeldung mit Bearbeiten-/Lese-Passwort + Name, Rechte serverseitig durchgesetzt, Präsenz-Anzeige; Name in den Desktop-Einstellungen; Migrations-Gerüst |
| **M2** | Bibliothek & Stammdaten | Leere Bibliothek; Editor für Geräte, Kabeltypen, Bühnenelemente, Traversen, Stative; Stammdaten Kategorien/Besitzer/Anhänger (projektübergreifend, Archivieren statt Löschen bei Verwendung); **Vorlagen-Änderungen wirken live auf alle Instanzen und beim Öffnen auf alte Projekte**; Import-Konfliktabfrage (eigene/fremde/Kopie); Import/Export JSON |
| **M3** | Signalfluss-Ansicht | Geräte frei platzieren, komplett einfärben, Ports sichtbar, Kabel Ausgang → Eingang mit Prüfungen, automatische Kabelführung, Minikarte; Multicore/Stagebox als Gerät |
| **M4** | Bühnenplan-Ansicht | Maßstab, Raster/Snap, Zeichnungsformen (Wand, Text, Maßlinie), Bühnenelemente/Traversen/Stative maßstäblich mit Instanz-Höhe, Ebenen, Hintergrund kalibrieren, Geräte an Stative und Traversen andocken und auf Bühnenelemente stellen (Höhe wird übernommen); gleiche Objekte wie Signalfluss |
| **M5** | Kabellängen & Logistik | Kabelverlauf, Längenberechnung (live berechnet) + konfigurierbare Längen bzw. Aufrunden auf ganze Meter, Kategorie/Besitzer/Anhänger/Inventarnummer für alles (doppelte Nummern gewarnt), Mehrfachzuweisung, Filter; Kabelliste und Packliste (Abhaken, „fehlt/defekt“, Zähler bei zusammengefassten Zeilen, Häkchen zurücksetzen) im UI; „Neues Projekt aus diesem“ |
| **M6** | DMX & Netzwerk | DMX-Modi/Adressen/Prüfungen/Auto-Adressierung/Patchliste; Subnetze, IPs mit Prüfungen, WLAN-Netze, WLAN-QR-Code in der App; WLAN-Passwörter im geschützten Bereich, Lese-Zugang sieht sie nicht |
| **M7** | PDF & CSV | A4/A3 wählbar; Planzeichnung (beide Ansichten), Packliste (Kategorie/Anhänger/Besitzer, zusammengefasst/einzeln), Kabel-, Stück-, DMX-, Geräte-, Netzwerkliste, WLAN-Aushang; CSV |
| **M8** | Weboberfläche per QR & Handy | Desktop: „Weboberfläche starten“, LAN-Freigabe, Passwörter in den Einstellungen, QR-Code, verbundene Personen; Handy-Ansicht (Packliste abhaken mit Zähler, Plan ansehen, volle Bearbeitung per Touch); „zuletzt geändert von“ und Änderungsprotokoll |
| **M8b** | Desktop ↔ Server-Verbindung | Desktop-Zugangsschlüssel auf dem Docker-Server (erzeugen, Zugangsstufe, widerrufen); Desktop „Mit Server verbinden“ (mehrere Server, Schlüssel im OS-Schlüsselbund), Live-Arbeit auf Server-Projekten/Bibliothek/Stammdaten, Verbindungsstatus, Sperre bei Verbindungsabbruch; lokales Projekt hochladen (mit Konfliktabfrage) / Server-Projekt herunterladen |
| **M9** | Release 1.0 | Installer (.dmg Universal ad-hoc signiert, .exe), Docker-Image (amd64/arm64) auf GHCR, Update-Hinweis (Desktop) über GitHub Releases, Benutzerhandbuch, Docker-Anleitung inkl. Aktualisieren, Beispielprojekt (nur in `docs/`, nicht in der Bibliothek), Bugfixing |
| **M10** | Phase 2a: Ton-Patch | Stagebox-/Pult-Kanalbelegung, Input-Liste als PDF |
| **M11** | Phase 2b: Strom | Leistung, Stromkreise, Phasen, Überlast-Warnungen, Stromliste als PDF |

---

## 11. Qualität, CI/CD und Release

- **Tests:** `packages/core` ≥ 80 % Abdeckung (Kabellänge, DMX, IP/CIDR, WLAN-QR-Escaping, Listen, Filter, Vorlagen-Abgleich, Migrationen). Server-Tests für Sync, Anmeldung, Desktop-Zugangsschlüssel (inkl. Widerruf), Rate-Limit und Rechte (Lese-Zugang kann nur abhaken und „fehlt/defekt“ setzen, kein Zurücksetzen/Wiederherstellen, Yjs-Updates werden verworfen, WLAN-Passwörter werden nicht ausgeliefert), Bibliotheks-Broadcast, gleichzeitige Vorlagen-Änderung, automatische Versionen und Import-Konfliktfälle. E2E-Smoke-Tests mit Playwright für Electron **und** Browser (Projekt anlegen, Gerät setzen, Kabel ziehen, Packliste abhaken in zweitem Client, PDF exportieren).
- **Alle Builds laufen auf GitHub Actions** (nicht lokal): Desktop-Installer auf einem **macOS-Runner** (`.dmg` Universal, ad-hoc signiert) und einem **Windows-Runner** (`.exe`), das **Docker-Image** per Buildx für amd64 und arm64.
- **CI (jeder Push/PR):** Lint, Typecheck, Unit-Tests, E2E-Smoke-Tests, Build Desktop (macOS + Windows) und Docker-Image.
- **Test-Builds von `develop`:** Bei jedem Push auf `develop` werden die Desktop-Installer als **Workflow-Artefakte** zum Herunterladen bereitgestellt und das Docker-Image als `ghcr.io/rde-master/steckplan:develop` veröffentlicht – so kann der Projektinhaber jeden Stand ausprobieren.
- **Release:** Merge `develop` → `main` + Versions-Tag `vX.Y.Z` erzeugt per GitHub Actions ein GitHub-Release mit `.dmg` und `.exe` sowie das Docker-Image auf GHCR (`latest` + `X.Y.Z`).
- **Versionierung (führt Claude Code selbständig mit):**
  - SemVer (`MAJOR.MINOR.PATCH`), **eine** Versionsnummer für das ganze Projekt: in der Root-`package.json` gepflegt und per Skript in alle Pakete, die Electron-App und das Docker-Image übernommen; in der App unter „Über Steckplan“ angezeigt.
  - Vor 1.0: Start mit `0.1.0` (M0); jeder abgeschlossene Meilenstein erhöht MINOR (M1 → `0.2.0`, M2 → `0.3.0` …); Fehlerbehebungen dazwischen erhöhen PATCH. **M9 = `1.0.0`.** Danach: neue Funktionen MINOR, Fehlerbehebungen PATCH, inkompatible Änderungen (z. B. Dateiformat ohne Migration, API-Bruch) MAJOR.
  - `CHANGELOG.md` nach „Keep a Changelog“: Änderungen laufend unter „Unreleased“ eintragen, beim Versionssprung in einen Abschnitt mit Version und Datum überführen.
  - Unabhängig davon: `schemaVersion` des Dateiformats wird bei jeder Änderung am Projekt-Datenmodell erhöht – immer zusammen mit einer Migration und Test.
  - Git-Tags `vX.Y.Z` werden auf `main` gesetzt (siehe Release).
- **Open-Source-Hygiene:** CONTRIBUTING.md, Issue-Vorlagen, Code of Conduct.

---

## 12. Entscheidungen (Protokoll)

- Name **Steckplan**, Endung `.steckplan`; UI nur Deutsch; `main` + `develop`
- Electron + React/TS; GPL-3.0; öffentlich auf GitHub
- Zwei Ansichten (Signalfluss + maßstäblicher Bühnenplan)
- Kategorie/Besitzer/Anhänger für alles; Stammdaten projektübergreifend
- Bühnenelemente, Traversen & Stative als Canvas-Objekte aus der Bibliothek (mit Logistik, in Packlisten); Geräte an Stative und Traversen andockbar, Filter danach; Höhe pro Instanz überschreibbar
- Packliste nach Kategorie/Anhänger/Besitzer; zusammengefasst oder einzeln beim Export wählbar
- Kein Zubehör ohne Canvas-Platz
- Kabellängen pro Kabeltyp frei konfigurierbar; Höhenregel Standard „zum Boden und wieder hoch“
- Einfache Symbole mit Farben; PDF A4/A3 wählbar
- Bibliothek startet leer; Vorlagen-Änderungen wirken überall, auch in alten Projekten (automatisch beim Öffnen)
- Docker: volle App im Browser, mehrere Personen gleichzeitig
- Weboberfläche per QR: ansehen, Packliste abhaken, mitbearbeiten (gleichzeitig mit Desktop)
- Zugang (Docker und QR-Weboberfläche): **zwei Passwörter** – Bearbeiten (alles, auf jedem Gerät inkl. Handy) und Lesen (ansehen + Packliste abhaken)
- Beim Anmelden wird ein Name eingetippt (kein Benutzerkonto); Name erscheint bei Häkchen und Änderungen
- Netzwerk: IP-Adressen/Subnetze + WLAN-Netze mit QR-Code
- Desktop: lokal mit frei gespeicherten `.steckplan`-Dateien (Doppelklick) **oder live mit einem Steckplan-Server verbunden** (Projekte, Bibliothek, Stammdaten auf dem Server); Anmeldung per Desktop-Zugangsschlüssel; kein Offline-Abgleich
- Fremde Vorlagen/Stammdaten beim Import: Nachfrage (eigene behalten / fremde übernehmen / als Kopie)
- Stammdaten: Löschen nur wenn unbenutzt, sonst Archivieren
- Kategorie aus der Vorlage, pro Gerät überschreibbar
- Packliste in der App: Zähler bei zusammengefassten Zeilen; „Häkchen zurücksetzen“; „Neues Projekt aus diesem“
- Lese-Zugang sieht WLAN-Passwörter nicht, nur den QR-Code
- Name am Desktop wird einmal in den Einstellungen festgelegt
- Berechnete Werte (Kabellängen, Prüfungen) werden nicht gespeichert, sondern live berechnet
- Kabellänge ohne konfigurierte Längen: auf ganze Meter aufrunden
- Häkchen zurücksetzen und Versionen wiederherstellen nur mit Bearbeiten-Zugang
- Packliste: Status „fehlt“ / „defekt“ mit Notiz; zusammengefasst nur bei gleicher Vorlage, Länge, Besitzer, Anhänger
- Automatische Versionen (letzte 30 Stände pro Projekt)
- Mehrere Projekte gleichzeitig am Desktop (ein Fenster pro Projekt)
- Update-Hinweis über GitHub Releases (nur Desktop), abschaltbar; Docker wird über das Image aktualisiert
- Warnung bei doppelten Inventarnummern
- Geräte übernehmen die Höhe von Podest/Stativ (überschreibbar)
- Kategorie optional („ohne Kategorie“)
- WLAN-Passwörter in einem geschützten Bereich außerhalb des live verteilten Dokuments
- Weboberfläche (lokal) zeigt nur die am Desktop geöffneten Projekte
- macOS-Installer ad-hoc signiert
- Gleichzeitige Vorlagen-Änderung: letzte gewinnt, mit Hinweis
- Sperrdatei ohne führenden Punkt (Nextcloud-tauglich), „Sperre übernehmen“ bei veralteter Sperre
- Claude Code committet regelmäßig und führt die Versionierung selbständig (Abschnitt 11 und 14)
- Desktop-Installer und Docker-Image werden auf GitHub Actions gebaut; Test-Builds bei jedem Push auf `develop`, Releases bei Tag auf `main`

---

## 13. Offene Fragen

Derzeit keine. Neue Fragen, die während der Umsetzung entstehen, hier ergänzen und vor der Entscheidung mit dem Projektinhaber klären.

Name „Steckplan“: auf GitHub am 01.11.2026 kein Repository mit diesem Namen gefunden. Vor der Veröffentlichung optional noch eine Markenrecherche (DPMA/EUIPO).

---

## 14. Arbeitsweise für Claude Code

- Immer **einen Meilenstein** nach dem anderen; vor dem Start die geplanten Schritte nennen.
- Bei Unklarheiten **nachfragen statt annehmen** (insbesondere Abschnitt 13).
- Fachlogik zuerst in `packages/core` mit Tests, danach Server, danach UI.
- Keine Inhalte aus proprietären Tools übernehmen (siehe Abschnitt 1).
- Nach jedem Meilenstein: Tests grün, Desktop- und Docker-Build lauffähig, CHANGELOG aktualisiert, Version erhöht, kurze Zusammenfassung was fertig ist und was offen bleibt.

### 14.1 Git & Commits

- Repository: <https://github.com/rde-master/steckplan> (Branches `main` und `develop`).
- Gearbeitet wird auf `develop` bzw. auf Feature-Branches je Meilenstein (z. B. `feature/m1-server-sync`), die nach Abschluss in `develop` gemergt werden.
- **Regelmäßig committen:** kleine, in sich abgeschlossene Commits – mindestens nach jedem fertigen Teilschritt (eine Funktion, ein Test-Block, eine Bildschirmseite), spätestens bevor ein neuer Teilschritt beginnt. Keine riesigen Sammel-Commits am Ende eines Meilensteins.
- Vor jedem Commit: Lint, Typecheck und betroffene Tests laufen grün. Unfertiges, das den Build bricht, wird nicht auf `develop` committet.
- Commit-Nachrichten im Format **Conventional Commits** mit deutscher Beschreibung, z. B. `feat(core): Kabellänge mit Höhenregel berechnen`, `fix(server): Lese-Zugang darf keine Häkchen zurücksetzen`, `chore(release): 0.2.0`.
- Regelmäßig pushen (mindestens nach jedem Arbeitsblock), damit der Stand auf GitHub gesichert ist.
- Niemals Passwörter, Schlüssel, `.env`-Dateien oder echte Projektdaten committen; `.gitignore` von Anfang an pflegen.
- Kein Force-Push auf `main` oder `develop`; keine Änderung der Git-Historie dort.

### 14.2 Versionierung & Releases

- Claude Code führt die Versionierung **selbständig** nach den Regeln in Abschnitt 11: Versionsnummer erhöhen, CHANGELOG-Abschnitt anlegen, Commit `chore(release): X.Y.Z`.
- Bei jeder Änderung am Datenmodell: `schemaVersion` erhöhen + Migration + Test im selben Commit.
- **Merge `develop` → `main` und das Setzen des Tags `vX.Y.Z`** (löst den Release mit Installern und Docker-Image aus) erst nach kurzer Bestätigung durch den Projektinhaber.
