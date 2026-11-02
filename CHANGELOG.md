# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und dieses Projekt verwendet [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.13.2] - 2026-11-02

### Hinzugefügt

- Markieren-Modus in Signalfluss und Bühnenplan: Rahmen mit der Maus aufziehen, um mehrere Objekte auszuwählen (Umschalt/Strg = hinzufügen), und die markierten gemeinsam verschieben; daneben der bisherige Auswählen-Modus (leere Fläche ziehen verschiebt die Ansicht). Im Signalfluss werden Kabel zwischen markierten Geräten mit ausgewählt, im Bühnenplan auch Wände, Texte und Maßlinien
- Signalfluss: Besitzer in der Geräteauswahl links einblendbar; in den Kästen Besitzer und Personennamen ein-/ausblendbar (wird je Browser bzw. Rechner gemerkt)

### Geändert

- Neues Logo: App-Symbol (macOS/Windows), Favicon und Logo in der Oberfläche
- PDF-Exporte mit Logo im Kopf (Pläne zusätzlich im Schriftfeld, WLAN-Aushang oben) und Fußzeile mit Programmversion, Art des Exports, Datum und Uhrzeit sowie Name

### Behoben

- Bibliothek: Die Kästchen „Netzwerk“ und „Strom“ in der Anschlusstabelle saßen versetzt – jetzt mittig zu den Eingabefeldern; „Mehrere Anschlüsse/Adern anlegen“ mit passendem Symbol

## [0.13.1] - 2026-11-02

### Behoben

- Personen-Import: Die Spalte „Art“ wurde bei vielen Überschriften nicht erkannt. Jetzt reicht es, wenn die Überschrift ein passendes Wort enthält (z. B. „Art der Person“, „Funktion/Rolle“, „Instrument“, „Bereich“); eine einzelne weitere Spalte gilt als Art. Zusätzlich lassen sich die Spalten für Name, Vorname und Art in der Vorschau von Hand zuordnen

## [0.13.0] - 2026-11-02

Meilenstein M10 – Strom (dazu Personen-Import und neue Symbole).

### Hinzugefügt

- Stromanschlüsse in der Bibliothek: Anschluss „Strom“ mit Absicherung (A) und Phase (L1/L2/L3/Drehstrom); Geräte mit Strom-Abgängen sind Verteiler (auch Steckdosenleisten und Unterverteiler)
- Leistung je Gerät im Projekt änderbar (Vorgabe aus der Vorlage)
- Last je Abgang, Verteiler und Phase aus den Stromkabeln im Signalfluss; Verteiler hinter Verteilern werden aufsummiert, Drehstrom-Geräte gleichmäßig verteilt
- Prüfungen: Warnung ab 80 % der Absicherung, Überlast ab 100 %, Schieflast an Drehstrom-Anschlüssen, Geräte mit Leistung ohne Stromanschluss
- Listen → Strom: je Verteiler Phasenbalken, Abgänge mit angeschlossenen Geräten, Leistung, Strom und Auslastung; Gesamtleistung
- Stromliste als PDF und CSV
- Personen importieren (Projektdaten → Personen → Importieren …): CSV-Datei (Semikolon, Komma oder Tabulator, UTF-8 oder Windows-Zeichensatz) oder aus Excel kopierte Zellen; Spalten Name, Vorname, Art werden an den Überschriften erkannt; Vorschau; vorhandene Personen werden übersprungen, eine fehlende Art wird ergänzt; als ein Rückgängig-Schritt

### Geändert

- Strom-Anschlüsse eines Mischpults erscheinen nicht in der Input-/Output-Liste
- Einheitliche Symbole aus der Bibliothek Lucide (ISC-Lizenz) in den Werkzeugleisten von Signalfluss und Bühnenplan sowie bei Hinzufügen, Entfernen, Kopieren, Löschen, Zurücksetzen, Export/Import, Ebenen (sichtbar/gesperrt)

## [0.12.0] - 2026-11-02

Meilenstein M9 – Ton-Patch (dazu Case-Listen).

### Hinzugefügt

- Ton-Patch: Input- und Output-Liste je Mischpult (Vorlage „Mischpult“), automatisch aus dem Signalfluss – Kabel und Multicore-Adern werden bis zur Quelle bzw. zum Ziel verfolgt, die Stagebox-Seite der Ader wird genannt; offene Kanäle sind sichtbar
- Input-Liste bearbeitbar: Kanalname, 48 V, Stativ, Bemerkung – mit Vorschlägen (Gerät und Person, „Braucht 48 V“ aus der Vorlage, Stativ, an dem die Quelle hängt)
- Output-Liste mit Ziel und Person (z. B. In-Ear-Wege)
- Input-/Output-Liste als PDF (je Pult) und CSV
- Case-Listen: je Case, was hineingehört (zusammengefasst oder einzeln, mit Anhänger) – auf dem Bildschirm unter Listen → Cases zum Abhaken, als PDF (eine Seite je Case mit Unterschrift) und als CSV

### Geändert

- Packliste lässt sich nach Case sortieren (Bildschirm und PDF), zusätzlich zum Gruppieren nach Case

## [0.11.0] - 2026-11-02

Meilenstein M8b – Desktop ↔ Server-Verbindung.

### Hinzugefügt

- Server-Einstellungen (Docker, nur Bearbeiten-Zugang): Desktop-Zugangsschlüssel mit Bezeichnung und Zugangsstufe erzeugen (wird nur einmal angezeigt, nur als Hash gespeichert), „zuletzt benutzt“, widerrufen (trennt sofort), widerrufene entfernen
- Desktop: „Mit Server verbinden …“ – Adresse und Zugangsschlüssel, mehrere Server speicherbar; der Schlüssel liegt verschlüsselt im Schlüsselbund-geschützten Speicher des Systems
- Je Server ein eigenes Fenster mit der Oberfläche des Servers: live auf Projekten, Bibliothek und Stammdaten; Häkchen und Änderungen mit dem Namen aus den Desktop-Einstellungen; bei Verbindungsabbruch ist Bearbeiten gesperrt, Ansehen bleibt möglich
- „Auf Server hochladen …“ für lokale Projekte (Vorlagen-Abgleich beim Öffnen auf dem Server); Server-Projekte lassen sich als Datei herunterladen (Speichern-Dialog)
- Warnung bei Server-Adressen mit http:// (unverschlüsselt) außerhalb des eigenen Rechners
- Hinweis statt Anmeldeseite, wenn der Zugangsschlüssel ungültig ist oder widerrufen wurde

### Geändert

- Meilenstein-Reihenfolge: Release 1.0 kommt nach Ton-Patch und Strom; neu nummeriert: M9 Ton-Patch, M10 Strom, M11 Release 1.0

## [0.10.0] - 2026-11-01

Meilenstein M8c – Personen, Gruppen, Cases, Lager (Dateiformat 4; ältere Dateien werden beim Öffnen automatisch angehoben).

### Hinzugefügt

- Personen je Projekt (Name, Vorname, Art mit Vorschlägen) unter Projektdaten
- „Benutzt von Mensch“ für Geräte: Vorgabe in der Vorlage, je Gerät änderbar; Person zuordnen (auch direkt neu anlegen). Der Name erscheint im Signalfluss, im Bühnenplan, in den Listen und in den PDFs
- Personenliste (Listen → Personen, PDF und CSV) mit Anschlüssen und Kabeln je Gerät
- Geräte-Etiketten als PDF auf A4-Bögen (70 × 37, 63,5 × 38,1, 105 × 48, 105 × 74 mm; optional Schnittlinien): Gerät, Person und wo es mit welchem Kabel eingesteckt wird
- Gruppen im Signalfluss (Gruppieren-Knopf oder Strg/⌘+G): Name und Farbe, Rahmen mit schattiertem Hintergrund wird automatisch berechnet; Ziehen am Rahmen verschiebt die Gruppe. Im Bühnenplan und im PDF ein-/ausblendbar
- Stative mit T-Bar: Länge in der Vorlage, je Stativ änderbar; angedockte Geräte liegen nebeneinander statt übereinander; Gerät hängt unten oder steht oben
- Cases (Kisten) als Stammdaten mit Standard-Anhänger; Geräte und Kabel kommen in ein Case, Cases je Projekt in einen Anhänger (Projektdaten → Cases); Standard-Case in der Vorlage
- Lagerbestand je Vorlage (Kabeltypen mit festen Längen je Länge) mit Warnung, wenn ein Projekt mehr verwendet
- Bibliothek: Geräte/Kabel kopieren (in der Liste und im Editor); Kategorien, Besitzer, Anhänger und Cases direkt im Auswahlfeld neu anlegen
- Änderungsprotokoll erfasst auch Personen, Gruppen und Case-Zuordnungen

### Geändert

- Packliste zeigt Kategorie, Besitzer, Anhänger, Case und Person; Gruppieren auch nach Case; Inhalt eines Cases steht im Anhänger des Cases
- Kabel-, Geräte- und Packliste (Bildschirm, PDF, CSV) mit Spalte „Case“, Geräteliste zusätzlich mit Person und Gruppe
- Gerätewahl im Signalfluss nach Kategorien unterteilt (einklappbar)
- Anhänger-Filter findet auch den Inhalt von Cases, die in diesem Anhänger stehen

## [0.9.0] - 2026-11-01

Meilenstein M8 – Weboberfläche per QR & Handy.

### Hinzugefügt

- Desktop: „Weboberfläche (QR & Handy)“ (Menü Datei, Startfenster, Projektfenster) – macht die am Desktop geöffneten Projekte im lokalen Netz erreichbar; QR-Code mit der Adresse, Netzwerkkarte wählbar, Port 8080 (einstellbar; ist er belegt, wird der nächste freie genommen), Hinweis zur Firewall
- Bearbeiten- und Lese-Passwort für die Weboberfläche in den Einstellungen (nur als Hash gespeichert); neue Passwörter oder Beenden melden alle Browser ab
- Liste der verbundenen Personen mit Zugang und geöffneten Projekten, einzeln trennbar
- Handy: Packliste als Startansicht, waagrecht scrollende Reiter, Zwei-Finger-Zoom auch im Bühnenplan, langes Drücken öffnet die Eigenschaften des Objekts
- „Zuletzt geändert von … am …“ bei Geräten und Kabeln (vom Server mit dem Namen aus der Anmeldung gestempelt)
- Änderungsprotokoll je Projekt (Listen → Änderungen): je Person und Minute zusammengefasst, eigene Einträge für Häkchen zurücksetzen, Version wiederhergestellt und Vorlagen-Abgleich; im Docker-Betrieb getrennt von der Projektdatei gespeichert

### Geändert

- Dialoge haben einen zugänglichen Namen (Screenreader)

## [0.8.0] - 2026-11-01

Meilenstein M7 – PDF & CSV.

### Hinzugefügt

- Export als PDF (A4 oder A3, Hoch- oder Querformat), erzeugt direkt in der App – gleich in Desktop, Browser und auf dem Handy
- Planzeichnung des Bühnenplans als Vektorgrafik im Maßstab 1:50 oder 1:100 (zu große Pläne werden auf mehrere Blätter mit Überlappung verteilt) oder „Seite füllen“; Signalfluss auf einer Seite; Planköpfchen (Projekt, Ort, Datum, Planer, Version, Maßstab, Blatt) und Legende; aktive Filter werden übernommen
- Packliste zum Abhaken (☐ Hin · ☐ Zurück), gruppiert nach Kategorie, Anhänger oder Besitzer (auch verschachtelt), zusammengefasst oder einzeln mit Kennung; Unterschrift und Datum je Gruppe; Abschnitt „Fehlt / defekt“; optional mit aktuellem Stand der Häkchen
- Kabelliste (mit Zusammenfassung je Typ und Länge), Stückliste, DMX-Patch, Geräteliste und Netzwerkliste als PDF
- WLAN-Aushang mit großem QR-Code; Passwort als Text wählbar (nur mit Bearbeiten-Zugang, Lese-Zugang druckt SSID und QR-Code)
- CSV-Export der Listen für Excel (UTF-8, Semikolon)
- Desktop: Datei → „Exportieren (PDF/CSV) …“ (⌘/Strg+E)

### Geändert

- Kabelliste sortiert natürlich („Spot 2“ vor „Spot 10“)

## [0.7.0] - 2026-11-01

Meilenstein M6 – DMX & Netzwerk.

### Hinzugefügt

- DMX pro Lichtgerät: Modus (aus der Vorlage), Universum (ab 1) und Startadresse; Anzeige des belegten Bereichs
- DMX-Prüfungen: Überlappung, Ende über 512, fehlende Adresse, unbekannter Modus
- Auto-Adressierung entlang der DMX-Kette (folgt den DMX-Kabeln im Signalfluss, auch durch Multicore-Adern); passt ein Gerät nicht mehr, geht es im nächsten Universum weiter
- DMX-Patchliste; Universum.Adresse an den Geräten einblendbar
- Netzwerk: Subnetze (Netz, Gateway, VLAN-Notiz), IP-Adressen pro Netzwerk-Anschluss (statisch oder DHCP, Hostname), Vorschlag der nächsten freien IP, Netzwerkliste
- Netzwerk-Prüfungen: doppelte IP, IP außerhalb des Subnetzes, Netz- oder Broadcast-Adresse, fehlende oder ungültige IP, ungültiges Netz, Gateway außerhalb
- WLAN-Netze (SSID, WPA2/WPA3/offen, versteckt, Access Point) mit QR-Code zum Verbinden (Standardformat, Sonderzeichen korrekt maskiert)
- WLAN-Passwörter liegen im geschützten Bereich des Projekts: nur mit Bearbeiten-Zugang sichtbar; der Lese-Zugang sieht SSID und QR-Code (vom Server erzeugt)

## [0.6.0] - 2026-11-01

Meilenstein M5 – Kabellängen & Logistik.

### Hinzugefügt

- Kabelverlauf im Bühnenplan mit Knickpunkten (Mitte eines Abschnitts ziehen fügt einen ein, Doppelklick entfernt ihn)
- Kabellänge wird immer frisch berechnet: Planlänge + Höhe (Standard: zum Boden und wieder hoch, pro Kabel „direkt“ möglich) + Reserve (% und je Ende, Voreinstellung im Projekt); gerundet auf die verfügbaren Längen des Kabeltyps, sonst auf ganze Meter; Warnung „Verlängerung nötig“ und bei Überschreiten der maximalen Länge; Länge von Hand, wenn ein Ende nicht platziert ist
- Multicore im Bühnenplan mit zwei Enden (A/B) und Verlauf; Länge wie bei Kabeln
- Kabelliste mit Planlänge, Höhe, benötigter und gewählter Länge und Zusammenfassung je Kabeltyp und Länge
- Packliste zum Abhaken (Hin/Zurück) in der App, gruppiert nach Kategorie, Anhänger oder Besitzer (auch verschachtelt), zusammengefasst („4 von 6 × XLR 10 m“, Antippen hakt das nächste Exemplar ab) oder einzeln; „fehlt“/„defekt“ mit Notiz; Abschnitt „Fehlt / defekt“; Gruppe „nicht zugeordnet“
- Abhaken und „fehlt/defekt“ auch mit Lese-Zugang (Name und Zeit setzt der Server); „Häkchen zurücksetzen“ nur mit Bearbeiten-Zugang
- Filter nach Kategorie, Besitzer, Anhänger und Stativ/Traverse in Signalfluss, Bühnenplan und Listen; „Einfärben nach“ Kategorie/Besitzer/Anhänger
- Kategorie, Besitzer, Anhänger und Inventarnummer auch für Kabel; Mehrfachzuweisung; Warnung bei doppelten Inventarnummern
- „Neues Projekt aus diesem“ (übernimmt Plan, Geräte, Kabel und Zuordnungen; Häkchen, Datum und Planversion werden zurückgesetzt)

## [0.5.0] - 2026-11-01

Meilenstein M4 – Bühnenplan-Ansicht.

### Hinzugefügt

- Maßstäblicher 2D-Bühnenplan (intern Millimeter) mit Raster (0,1–1 m), Fangen, Maßstabsbalken und Koordinatenanzeige; Zoom und Verschieben wie im Signalfluss
- Bühnenelemente, Traversen und Stative maßstäblich nach Vorlagenmaß, mit eigener Höhe pro Objekt (z. B. Stativ auf 3,20 m ausgefahren)
- Geräte docken automatisch an, wenn sie über einem Stativ, einer Traverse oder einem Bühnenelement abgelegt werden (Alt-Taste: nicht andocken); an Traversen sitzen sie auf der Achse; Lösen durch Wegziehen oder im Eigenschaften-Panel
- Angedockte Geräte bewegen und drehen sich mit ihrem Träger
- Höhe wird vom Stativ, von der Traverse oder vom Podest übernommen und mit Herkunft angezeigt; eigene Höhe pro Gerät möglich
- „Nicht platziert“: Geräte aus dem Signalfluss auf den Bühnenplan ziehen; im Signalfluss sind sie markiert
- Zeichnungsformen: Wand (mit Stärke), Text, Maßlinie mit Längenangabe; Punkte nachträglich verschiebbar
- Ebenen: aktive Ebene für neue Objekte, ein-/ausblenden, sperren, umbenennen, hinzufügen, leere löschen
- Hintergrund-Grundriss aus Bild (PNG/JPG) oder PDF-Seite, mit Referenzstrecke kalibrieren, verschieben, Deckkraft
- Drehen (Griff oder R), Duplizieren, Löschen, Pfeiltasten, Rückgängig/Wiederholen auch im Bühnenplan
- Prüfungen: nicht platzierte Geräte (Hinweis), zu viele Geräte an einem Stativ/einer Traverse, fehlender Träger

## [0.4.0] - 2026-11-01

Meilenstein M3 – Signalfluss-Ansicht.

### Hinzugefügt

- Signalfluss-Ansicht: Geräte aus der Bibliothek frei platzieren (ziehen oder ＋), komplett in Gerätefarbe, Eingänge links, Ausgänge rechts
- Kabel von Anschluss zu Anschluss ziehen: passende Anschlüsse werden hervorgehoben, Signal nur von Ausgang zu Eingang; Kabeltyp automatisch, wenn genau einer passt, sonst Auswahl; „direkt gesteckt“ ohne eigenes Kabel
- Multicore als Kasten mit je einem Anschluss pro Ader an beiden Enden (z. B. Bühne/FOH)
- Automatische rechtwinklige Kabelführung; Kabel folgen beim Verschieben
- Eigenschaften-Panel: Kennung, Farbe und Kategorie (pro Gerät überschreibbar, „auf Vorlage zurücksetzen“), Besitzer, Anhänger, Inventarnummer, Notiz; Kabeltyp änderbar
- Mehrfachauswahl, Auswahlrahmen, Ausrichten und Verteilen, Duplizieren, Löschen (samt angeschlossener Kabel)
- Rückgängig/Wiederholen pro Person, Tastenkürzel, Zoom per Strg/⌘ + Mausrad oder Fingergeste, Einpassen, Minikarte
- Prüfungen-Panel: falsche Richtung, unpassende Stecker (Kabel rot markiert), mehrfach belegte Anschlüsse, verwaiste Kabel, fehlende Vorlagen – Klick springt zum Objekt
- Vorlagen-Änderungen in der Bibliothek wirken sofort auf alle platzierten Geräte
- Projektansicht mit Reitern Signalfluss, Bühnenplan (folgt) und Projektdaten
- Geräte-Editor: „Mehrere Anschlüsse anlegen“ – viele Kanäle in einem Schritt (Anzahl, Bezeichnung mit laufender Nummer, z. B. „In #“ → In 1 … In 32, optional mit führenden Nullen; Stecker, Richtung, Signal und Netzwerk für alle gemeinsam, mit Vorschau)
- Geräte-Editor: „Alle Anschlüsse entfernen“ (mit Rückfrage)
- Geräte-Editor: Anschlüsse optisch getrennt nach Eingängen, Ausgängen und Ein-/Ausgängen (eigene Gruppe mit Anzahl und Farbmarkierung)
- Kabeltypen als Multicore: mehrere Adern mit eigenem Stecker an jedem Ende, Richtung und Signal, benennbare Enden (z. B. Bühne/FOH), „Mehrere Adern anlegen“, nach Richtung getrennte Anzeige

### Geändert

- Dateiformat Version 3 (Multicore-Kabeltypen, direkt gesteckte Verbindungen, Hintergrund mit Lage und Deckkraft); ältere Dateien werden beim Öffnen automatisch umgewandelt

## [0.3.0] - 2026-11-01

Meilenstein M2 – Bibliothek & Stammdaten.

### Hinzugefügt

- Bibliothek (startet leer) mit Editoren für Geräte, Kabeltypen, Bühnenelemente, Traversen und Stative: Form und Maße in Metern, Anschlüsse mit Stecker/Richtung/Signal/Netzwerk, DMX-Modi, Leistung, verfügbare Kabellängen, Standardfarbe, Kategorie, Standard-Besitzer und -Anhänger, Notiz
- Stammdaten Kategorien, Besitzer und Anhänger (projektübergreifend): anlegen, umbenennen, Farbe; löschen nur, wenn unbenutzt, sonst archivieren (rückgängig machbar)
- Vorlagen löschen nur, wenn sie in keinem bekannten Projekt verwendet werden
- Änderungen an Bibliothek und Stammdaten erscheinen sofort bei allen Verbundenen
- Gleichzeitiges Ändern derselben Vorlage: Hinweis „inzwischen geändert von X“ mit „Neu laden“ oder „Trotzdem überschreiben“
- Vorlagen-Abgleich beim Öffnen und Hochladen: fehlende Vorlagen werden übernommen, eigene Projekte automatisch aktualisiert; bei Projekten aus einer anderen Bibliothek wird pro Eintrag gefragt (eigene behalten / fremde übernehmen / als Kopie anlegen)
- Import/Export von Bibliothek und Stammdaten als JSON, mit derselben Konfliktabfrage
- Desktop: Bibliothek in eigenem Fenster (Datei → Bibliothek …)

### Geändert

- Dateiformat Version 2 (Vorlagen mit „zuletzt geändert von“ und Notiz); Dateien im Format 1 werden beim Öffnen automatisch umgewandelt
- Die Kopien der verwendeten Vorlagen und Stammdaten in der Projektdatei werden beim Speichern aus der Bibliothek erzeugt

## [0.2.0] - 2026-11-01

Meilenstein M1 – Datenmodell, Server, Sync & Anmeldung.

### Hinzugefügt

- Datenmodell (Zod-Schemas) für Projekt, Vorlagen, Stammdaten, Geräte, Kabel und Netzwerk; Dateiformat `.steckplan` mit `schemaVersion` 1 und Migrations-Gerüst
- Live-Sync per Yjs über WebSocket: mehrere Personen bearbeiten dasselbe Projekt gleichzeitig; Anzeige, wer verbunden ist
- Anmeldung im Browser mit Bearbeiten- oder Lese-Passwort plus Name; Sitzung 30 Tage, Begrenzung von Fehlversuchen
- Rechte serverseitig: Lese-Zugang kann nichts ändern, nichts löschen und keine Versionen wiederherstellen; WLAN-Passwörter erhält er nicht
- Automatische Versionen (die letzten 30, höchstens eine pro 10 Minuten) mit Vorschau und Wiederherstellen
- Docker: Projektliste, Projekt anlegen, hochladen, herunterladen, löschen mit Papierkorb (30 Tage)
- Desktop lokal: `.steckplan`-Dateien frei speichern und per Doppelklick öffnen, Autosave in die Datei, ein Fenster pro Projekt, Zuletzt geöffnet, Speichern unter
- Desktop: Sperrdatei neben der Datei (Nextcloud-tauglich) mit „Nur lesen öffnen“ und „Sperre übernehmen“ bei veralteter Sperre
- Desktop: eigener Name beim ersten Start
- Projektdaten (Name, Ort, Datum, Planer, Auftraggeber, Version, Notizen) als erstes live bearbeitbares Element
- E2E-Tests mit Playwright für Browser, Handy-Ansicht und Desktop-App

## [0.1.0] - 2026-11-01

Meilenstein M0 – Projektgerüst.

### Hinzugefügt

- Repository-Grundgerüst: Lizenz (GPL-3.0), README, Beitragsrichtlinien, Verhaltenskodex, Issue-Vorlagen
- pnpm-Monorepo mit TypeScript, ESLint und Vitest; zentrale Versionsnummer (`pnpm version:sync`)
- `core`: App-Grunddaten und Version
- `server`: Fastify-Server mit `/api/health`, Auslieferung der Oberfläche; eigenständiger Betrieb verlangt Bearbeiten- und Lese-Passwort
- `ui`: leere Startseite (React, Vite, Tailwind) mit Server-Status und Versionsanzeige
- Desktop-App (Electron) mit eingebettetem Server auf 127.0.0.1; Installer für macOS (Universal, ad-hoc signiert) und Windows
- Docker-Image mit Datenvolume `/data` und Beispiel-`docker-compose.yml`
- GitHub Actions: Tests und Smoke-Test bei jedem Push, Installer als Artefakte, Docker-Image `:develop`, Release-Workflow für Tags `vX.Y.Z`

[Unreleased]: https://github.com/rde-master/steckplan/compare/v0.13.2...develop
[0.13.2]: https://github.com/rde-master/steckplan/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/rde-master/steckplan/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/rde-master/steckplan/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/rde-master/steckplan/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/rde-master/steckplan/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/rde-master/steckplan/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/rde-master/steckplan/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/rde-master/steckplan/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rde-master/steckplan/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rde-master/steckplan/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rde-master/steckplan/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rde-master/steckplan/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rde-master/steckplan/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rde-master/steckplan/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rde-master/steckplan/releases/tag/v0.1.0
