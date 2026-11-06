# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und dieses Projekt verwendet [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Geändert

- Mitschreiben: „Nächste Zeile“ (und Leertaste) geht auch, wenn schon Zeiten da sind – es setzt die Zeile nach der, die gerade dran ist, bzw. nach der zuletzt gesetzten; nach Spulen oder Springen geht es ab dort weiter (neu mitschreiben ab Anfang oder ab einer Zeile)
- Texte (Bearbeiten, Mitlesen, Mitschreiben): der Player läuft über die ganze Breite, der Timecode steht rechts am Rand

## [0.27.2] - 2026-11-06

### Hinzugefügt

- Regie-Einstellungen → Textfenster: Farbe der aktiven Zeile (Textfarbe, Hervorhebung an/aus mit eigener Farbe, Vorschau, Zurücksetzen)

### Geändert

- Mitschreiben: Klick auf eine Zeile springt dorthin (statt die Zeit zu setzen); die Zeit vorne ist direkt bearbeitbar (z. B. 1:12.5, Enter übernimmt, leer löscht); „Auf aktuelle Zeit setzen“ als eigener Knopf je Zeile
- Mitlesen/Mitschreiben: anklickbare Zeilen zeigen den Hand-Zeiger

## [0.27.1] - 2026-11-06

### Hinzugefügt

- Regie-Einstellungen → Textfenster: „Titel des Lieds anzeigen“ (Standard an); aus = das Textfenster zeigt keinen Titel
- Audio-Versatz: Option „Versatz gilt auch für den Text“ (Ablauf, am Versatz). An: Zeitpunkte der Textzeilen zählen ab Musikbeginn – im Textfenster, in der Vorstellung (mit Countdowns und Balken), beim Mitlesen und für Szenen an einer Textzeile; beim Mitschreiben und Verschieben wird die Zeit ab Musikbeginn gespeichert. Aus (Standard): Textzeiten zählen ab Timecode 0

## [0.27.0] - 2026-11-06

### Hinzugefügt

- Ablauf: je Punkt „Im Textfenster anzeigen“ (Standard an; aus = das Textfenster zeigt bei diesem Punkt keinen Text) und „Text am Ende ausblenden“ (Standard an; ist die Dauer des Punkts erreicht, blendet das Textfenster den Text weich aus)
- Bearbeiter können verbundene Geräte trennen (✕ in der Liste „Verbunden“, mit Rückfrage; nicht die eigene Verbindung). Das getrennte Gerät verbindet sich nicht von selbst wieder, sondern zeigt „Die Verbindung wurde von … getrennt“ mit „Neu verbinden“ – auch in Vorstellung und Textfenster. Dauerhaft aussperren weiterhin über Passwörter, Desktop- bzw. QR-Schlüssel
- Vorstellung: Tastenkürzel, vor allem zum Spulen – `,`/`.` 0,5 s, Umschalt+←/→ 1 s, `J`/`L` 5 s, `[`/`]` nur Timecode 0,1 s, `K` Start/Pause, `S`/Pos1 Stopp, `Z` Liedliste; Übersicht über das Tastatur-Symbol im Kopf oder `?`. Beim Folgen übernimmt das Bedienen per Taste
- Audio-Versatz je Punkt (Ablauf, bei Punkten mit Audio): Die Musik setzt erst bei dieser Zeit des Punkts ein – davor läuft der Timecode, die Musik wartet am Anfang
- Player: zeigt die Werte der Audiodatei (Position, Länge, Restzeit der Datei); der Zeitstrahl umfasst den ganzen Punkt, ein Balken darunter zeigt, wo die Audiodatei liegt. Timecode, Restzeit am Timecode, Text und Szenen bleiben auf der geplanten Zeit des Punkts

## [0.26.2] - 2026-11-06

### Hinzugefügt

- OSC: Lied bzw. Ablaufpunkt über die Nummer in der Adresse wählen – `/steckplan/lied/13` (auch `/steckplan/item/13`), für Pulte, die ohne Wert senden
- Timecode: Feinschritt ±0,1 Sekunden (Knöpfe am Timecode-Feld) und per OSC `/steckplan/tc/forward [s]` bzw. `/steckplan/tc/back [s]` (ohne Wert 0,1 s) – verschiebt nur den Timecode (mit „Mit Musik“ auch die Musik)
- Seite „OSC-Befehle“: Spalte mit dem passenden grandMA3-Befehl (z. B. `SendOSC 1 "/steckplan/play,,"`) und Anleitung zum Einrichten der OSC-Zeile im Pult

## [0.26.1] - 2026-11-06

### Hinzugefügt

- Desktop: Projekte mit Medien (.steckplan.zip aus „Mit Medien herunterladen“) direkt öffnen – über „Projekt öffnen …“, per Doppelklick bzw. Kommandozeile oder durch Ziehen aufs Programmsymbol (macOS). Die App fragt, wo das Projekt gespeichert wird, legt Projektdatei und Medien-Ordner (<Name>.medien) dort ab und öffnet es; entpackt wird stückweise, auch große Audiodateien
- Textfenster: Hintergrundbild je Textabschnitt (Bereich „Texte“, am Abschnitt). Ohne eigenes Bild gilt das Bild des letzten früheren Abschnitts im selben Lied (je Abschnitt abschaltbar: „Bild vom vorigen Abschnitt übernehmen“), sonst das Standardbild aus den Regie-Einstellungen; beim Wechsel wird weich überblendet. Kopieren von Abschnitt oder Eintrag übernimmt die Bilder, nicht mehr verwendete Bilder verlieren ihren Verweis

## [0.26.0] - 2026-11-06

### Hinzugefügt

- OSC-Fernsteuerung der Vorstellung (UDP, in den Einstellungen ein- und Port einstellbar, Standard 8000): `/steckplan/play`, `/pause`, `/toggle`, `/stop`, `/forward [s]`, `/back [s]`, `/seek s`, `/item n` (Punkt mit Nummer n), `/next`, `/prev`, `/scene/next`, `/scene/prev`; Werte als int, float oder string, Bundles werden aufgelöst, das Loslassen eines Tasters (0) löst nichts aus. Ausgeführt wird in der Vorstellung, die führt – führt niemand, in jeder geöffneten, die nicht folgt; die Vorstellung zeigt kurz, welcher Befehl ankam. Die Einstellungen zeigen, ob empfangen wird, und den zuletzt erkannten Befehl
- Dieselben Befehle per HTTP: `POST /api/remote` mit `{ "action": "play" }` bzw. `{ "action": "item", "value": 3 }` (Bearbeiten- oder Regie-Zugang), optional `projectId`
- Seite „OSC-Befehle“ (`/osc`, im Menü „OSC“, verlinkt aus den Einstellungen und den Regie-Einstellungen): alle Befehle mit Adresse, Wert, Wirkung und HTTP-Gegenstück, Zustand des Empfangs (Adresse, Port, zuletzt erkannter Befehl) und je Befehl „Senden“ zum Ausprobieren an der offenen Vorstellung (Bearbeiten- oder Regie-Zugang)
- Vorstellung: Vorschau auf die nächste Szene – im Ton unten zuschaltbar („Vorschau anzeigen“, mit Name und Notiz der nächsten Tonszene), im Licht umschaltbar „Bild: Aktuell | Nächste“ (Lichtplan der nächsten Szene, als Vorschau markiert); beides je Gerät gemerkt

### Geändert

- Vorstellung „Folgen“: keine eigenen Bedienknöpfe mehr (Audio-Player, Szene/Eintrag zurück/weiter, Timecode-Knöpfe, Liedliste); Timecode und Restzeit bleiben sichtbar. Selbst bedienen: „Frei“ wählen (oder Pfeiltasten)
- Vorstellung öffnet sich als eigener Tab (Desktop-App: eigenes Fenster) unter `/projekt/<id>/vorstellung` statt über der Seite; ist sie schon offen, holt der Knopf sie nach vorn. Esc schließt nur noch die Liedliste, ✕ schließt den Tab

### Behoben

- Vorstellung „Folgen“: Timecode, mitlaufender Text, Countdowns, Balken und Szenen-Timer standen still – jetzt laufen sie mit der Zeit der führenden Vorstellung mit (ohne eigenen Ton); die Timecode-Knöpfe sind beim Folgen ausgeblendet
- Vorstellung: Lichtplan mittig (Kacheln werden bei breiten Rastern schmaler statt nach rechts überzulaufen); rechts Abstand zum Bildschirmrand; Szenen-Zeiten (Start, „läuft“, Countdown) immer mit Zehntelsekunde, damit die Anzeige nicht springt

## [0.25.0] - 2026-11-06

### Hinzugefügt

- Tonszenen: Szenen wie beim Licht (Name, Auslöser per Zeitpunkt/„Jetzt“/Textzeile, sortieren, löschen) mit formatierter Notiz je Szene; „Szenen vom Licht übernehmen“ legt die Lichtszenen als Tonszenen an bzw. gleicht Name und Auslöser an (Notizen bleiben); Player mit Timecode und Szenen-Marken; der bisherige Text je Punkt bleibt als „Allgemein“
- Vorstellung (Licht und Ton): aktuelle Szene mit Startpunkt und wie lange sie schon läuft, rechtsbündig die nächste Szene mit Startpunkt und Countdown, darunter ein grüner Balken bis zur nächsten Szene
- Vorstellung: Notizen wechseln mit der Szene; hat eine Szene keine, bleibt die letzte stehen, bis eine neue kommt (Licht und Ton)

### Geändert

- Vorstellung: Gesamtdauer in Klammern neben dem Namen im Kopf statt unten; Lichtplan zentriert
- Vorstellung: Auch angehalten folgt die Szene der Position (z. B. nach dem Spulen); eine von Hand gewählte Szene gilt, bis sich die Position ändert

### Hinzugefügt

- Timecode-Feld (Vorstellung unten rechts, sonst im Player): unter der grünen Uhr rot die Restzeit bis zur geplanten Dauer (rückwärts, gleiches Format); darüber eigene Knöpfe – Stopp (zurück auf 0), Start/Pause, ±1 und ±5 Sekunden
- „Mit Musik“ (je Gerät gemerkt): an – Timecode und Musik laufen gemeinsam, Stopp/Pause/Spulen wirken auf beides; aus – der Timecode läuft für sich, die Musik unabhängig davon. Text und Szenen folgen der Musik, Art-Net dem Timecode (beim Führen werden beide Positionen gesendet)

### Geändert

- Timecode: Die Länge kommt allein aus der Dauer im Projekt (nicht mehr aus der Länge des Audios); ist das Audio länger, hält „Mit Musik“ es am Ende der Dauer mit an. Ohne Dauer läuft der Timecode bis Stopp
- Player: Die Restzeit blinkt nur noch, solange abgespielt wird

## [0.24.0] - 2026-11-06

### Hinzugefügt

- Regie: neuer Bereich „Tonszenen“ – je Ablaufpunkt ein großes Textfeld mit Formatierung (fett, kursiv, unterstrichen, durchgestrichen, Überschrift, Listen) und Textfarbe; gespeichert als HTML, angezeigt nur mit erlaubten Elementen (keine Skripte, Links oder Bilder)
- Vorstellung: rechte Seite umschaltbar „Licht | Ton“ (je Gerät gemerkt), links bleibt der Text; im Kopf das nächste Lied („Als Nächstes: …“) und die „Liedliste“ zum direkten Wählen eines Punkts
- Regie: Timecode je Ablaufpunkt (25 fps) als große grüne Uhr unten rechts – in der Vorstellung und im Player von Ablauf, Texte und Lichtszenen. Jeder Punkt beginnt bei 00:00:00:00
- Regie: Jeder Ablaufpunkt hat einen eigenen Transport (Start, Pause, Spulen); das Lied hängt daran. Der Timecode läuft bis zur Dauer des Punkts weiter (auch nach dem Ende des Audios und bei Punkten ohne Audio) und hält dort an
- Timecode per Art-Net (ArtTimeCode, EBU 25 fps, UDP 6454): in den Regie-Einstellungen ein- und Zieladresse (IP oder Broadcast) einstellbar; der Server sendet, solange in der Vorstellung jemand führt – 25 Pakete pro Sekunde, angehalten einmal die Position. Die Vorstellung zeigt an der Uhr, ob gesendet wird
- Ablauf: feste Nummern je Punkt (bleiben beim Umsortieren, neue Punkte bekommen die nächste freie, von Hand änderbar, „Neu nummerieren“ zählt in der aktuellen Reihenfolge); Nummern auch in Texte, Lichtszenen und Vorstellung

## [0.23.4] - 2026-11-05

### Hinzugefügt

- Textfenster: einstellbar, wie viele Zeilen vor (0–5) und nach (0–10) der aktuellen Zeile stehen (Zahnrad „Regie-Einstellungen“); Schrift und Zeilenhöhe passen sich an
- Textfenster: Hintergrundbild (Zahnrad neben „Textfenster“ im Regie-Menü) mit einstellbarem Abdunkeln; das Bild liegt im Medienspeicher und kommt beim Herunterladen mit Medien mit
- Player: Spulen auch um ±0,5 Sekunden
- Player: Restzeit des Titels als größerer Countdown rechts; in den letzten 30 Sekunden färbt er sich allmählich rot, in den letzten 5 blinkt er – beide Werte in den Regie-Einstellungen (Zahnrad im Regie-Menü, bisher „Textfenster einrichten“)
- Vorstellung: kleiner grüner Balken über der aktuellen Zeile, der bis zur nächsten Zeile von links nach rechts vollläuft, und ein roter über der nächsten Zeile, der bis zu ihrem Einsatz von rechts nach links abläuft (nur in der Vorstellung, nicht im Textfenster)

### Geändert

- Textfenster: Zeilenwechsel animiert – der Text gleitet weich nach oben, die aktuelle Zeile wächst und wird hervorgehoben, Zeilen blenden weich ein und aus

### Behoben

- Vorstellung: Beim Schließen der Vorstellung wurde die Seite leer (Fehler aus 0.23.3, Meldung an das Textfenster im selben Browser)

## [0.23.3] - 2026-11-05

### Hinzugefügt

- Regie: „Textfenster“ – eigene Seite mit eigenem Link (`/projekt/<id>/text`, Knopf im Regie-Menü, Link kopieren): Text zentriert, vorige Zeile ausgegraut, aktuelle hervorgehoben, drei nächste; Antippen schaltet Vollbild. Läuft auf jedem Gerät mit (auch Lese-Zugang), wenn in der Vorstellung jemand führt – im selben Browser auch ohne Führen
- Vorstellung: „Führen“ sendet jetzt auch die Abspielposition (bei Start, Pause, Spulen und alle zwei Sekunden); folgende Geräte zählen selbst weiter, Nachzügler bekommen die aktuelle Position
- Vorstellung: Zeitpunkt jeder Textzeile; für die nächsten fünf Zeilen ein live herunterlaufender Countdown auf die Zehntelsekunde
- Player: Spulen um −5, −1, +1 und +5 Sekunden, in der Vorstellung auch Umschalt+←/→ (±1 s) – zum Anpassen an den Live-Gesang

### Geändert

- Vorstellung: Mit Audio richtet sich die aktuelle Textzeile auch bei angehaltener Wiedergabe nach der Abspielposition (z. B. nach dem Spulen)

### Behoben

- Lichtszenen: Beim Wechsel zu einem anderen Lied mit Audiodatei blieben die Szenen des vorigen Lieds stehen (nur die Überschrift wechselte)

## [0.23.2] - 2026-11-05

### Hinzugefügt

- Signalfluss: Kabel umstecken – ein bestehendes Kabel nahe einem Ende anfassen und auf einen anderen Anschluss ziehen; Kabeltyp, Besitzer, Case und Notizen bleiben, Rückgängig geht. Loslassen im Leeren ändert nichts, ein einfacher Klick wählt das Kabel wie bisher aus
- Regie: Leertaste startet und stoppt die Wiedergabe (Ablauf, Texte, Lichtszenen, Vorstellung) – nicht beim Tippen in Feldern, beim Mitschreiben setzt sie wie bisher die nächste Zeile

## [0.23.1] - 2026-11-05

### Hinzugefügt

- Lichtszenen: „+ Szene jetzt“ (Taste J) legt beim Abspielen eine neue Szene an der aktuellen Abspielzeit an – eingereiht nach der Szene davor und mit deren Werten

### Geändert

- Lichtszenen: Gerätearten stehen links neben dem Raster (auf dem Handy als Leiste darüber); die Werte rechts erscheinen erst, wenn ein Gerät gewählt ist – sonst hat das Raster die ganze Breite

## [0.23.0] - 2026-11-05

### Hinzugefügt

- Lichtszenen: „Kopieren nach …“ übernimmt alle Werte einer Szene in beliebige andere Szenen – auch in andere Lieder und Stücke (Werte der Ziele werden vollständig ersetzt); „Werte kopieren“ und „Einfügen“ (Strg/⌘+C, Strg/⌘+V) über Stücke hinweg
- Lichtszenen: Tastenkürzel – ←/→ Szene wechseln, Alt+←/→ Szene verschieben, N neue Szene, Umschalt+N leere Szene, Strg/⌘+D duplizieren, Strg/⌘+A alle Geräte, Esc Auswahl aufheben, 1–9/0 Helligkeit 10–100 %, „−“ aus, Entf Werte löschen; Kürzel stehen beim Überfahren an den Knöpfen, die Übersicht am Tastatur-Symbol
- Lichtszenen: Liste der Gerätearten mit Anzahl (z. B. „Moving Head (4)“) – Antippen wählt alle Geräte dieser Art, mit Strg/⌘ dazu bzw. weg; auf schmalen Bildschirmen als Leiste über dem Raster

### Geändert

- Lichtszenen: breitere Ansicht, ein Raster mit 8×8 Feldern passt neben die Werte

### Behoben

- Handy und Tablet: Zwei-Finger-Zoom in Signalfluss und Bühnenplan funktioniert – vorher übernahm der erste Finger das Verschieben, und der zweite wurde nicht mehr bemerkt

## [0.22.0] - 2026-11-05

### Geändert

- Regie: Texte in einem eigenen Bereich (Ablauf | Texte | Lichtszenen | Lichtaufbau) – links Lieder, Schauspielstücke und Ansagen mit der Zahl ihrer Zeilen, rechts Text, Rollen und „Text einfügen“, bei Liedern mit Audio Mitlesen und Mitschreiben mit Player; im Ablauf bleiben Angaben, Personen, Notiz und Audio
- Regie: Lichtszenen in einem eigenen Bereich (Ablauf | Lichtszenen | Lichtaufbau) – links die Lieder und Schauspielstücke mit der Zahl ihrer Szenen, rechts die Szenen des gewählten Stücks, unten der Player für seine Musik (Szenen als Marken auf der Zeitleiste, „Jetzt“ übernimmt die Abspielzeit)
- Regie: „Beteiligte Personen“ und „Notiz“ eines Ablauf-Eintrags sind eingeklappt und öffnen sich bei Bedarf; geschlossen zeigt die Zeile die Namen bzw. den Anfang der Notiz

### Behoben

- Desktop: Beenden kann nicht mehr hängen bleiben – jeder Aufräumschritt hat eine Frist (Projekte speichern 15 s, sonst wenige Sekunden), überschrittene Fristen werden protokolliert

## [0.21.0] - 2026-11-05

### Hinzugefügt

- Regie (M11a): neuer Reiter „Regie“ mit dem Ablauf aus Liedern, Schauspielstücken, Pausen und Ansagen – sortieren per Ziehen oder Pfeilen, kopieren, Dauer („3:40“ oder „15“ für Minuten), Beginn und laufende Startzeiten, Gesamtdauer, beteiligte Personen, Notiz
- Regie: Texte je Abschnitt (Strophe, Refrain, Bridge, Szene …) als Textfeld; Abschnitte verschieben, kopieren (Refrain wiederholen), ganzen Text einfügen (Leerzeilen trennen Abschnitte, Überschriften wie „[Refrain]“ werden erkannt). Schauspiel: „Rolle: Text“, Zeilen ohne Rolle setzen die Rede fort, Regieanweisungen in Klammern; Rollen werden angelegt und lassen sich Personen zuordnen. Jede Zeile behält beim Bearbeiten ihre Kennung (für Zeitpunkte und Lichtszenen in den nächsten Schritten)
- Zugang „Regie“ (drittes, optionales Passwort): Regie bearbeiten, alles andere nur lesen, keine Häkchen; Docker `STECKPLAN_DIRECTION_PASSWORD`, Desktop-Weboberfläche drittes Passwortfeld, Desktop-Zugangsschlüssel mit Stufe „Regie“. Der Server übernimmt von Regie-Clients nur Änderungen an der Regie
- Dateiformat 9 (ältere Dateien werden beim Öffnen angehoben)
- Regie (M11b): Audiodateien je Lied (mehrere, eine als Standard, Bezeichnung; Dauer wird beim Hochladen erkannt) – ohne Größengrenze, unverändert gespeichert, Hochladen in Teilen mit Fortschritt und Fortsetzen nach Abbruch. Player fest unten im Lied (Abspielen, Zeitleiste, Lautstärke, Wechsel der Datei an derselben Stelle)
- Regie: Textansicht „Mitlesen“ (aktuelle Zeile hervorgehoben, scrollt mit, Antippen springt dorthin) und „Mitschreiben“ (beim Abspielen „Nächste Zeile“ oder Leertaste setzt die Zeitpunkte; ±0,5 s, löschen, Antippen setzt auf die aktuelle Zeit)
- Medien: Docker unter `/data/media`, Desktop im Ordner `<Name>.medien` neben der Datei; nicht mehr verwendete Dateien 30 Tage im Papierkorb; „Neues Projekt aus diesem“ und „Speichern unter“ nehmen die Medien mit. Im Browser „Mit Medien herunterladen“ als `.steckplan.zip`, das sich in der Projektliste wieder hochladen lässt
- Regie (M11c): Lichtfähigkeiten an Gerätevorlagen (Bibliothek → Licht): „In Lichtszenen anzeigen“, Dimmer, Strobe, Farbmischung (RGB/RGBW/RGBA/CMY), Farbräder mit benannten Farben, CTO/CTB, Gobo-Räder (Gobos mit Namen, drehbar), Prisma, Zoom, Fokus, Iris, Frost, beweglich mit Schwenk-/Neigebereich
- Regie → Lichtaufbau: Raster je Projekt mit allen Lichtgeräten – per Ziehen oder Antippen platzieren (belegtes Feld = tauschen), Zeilen benennen, Größe ändern, „Aus dem Bühnenplan anordnen“ (je Traverse/Stativ eine Zeile), Geräte ausblenden; benannte Ziele (z. B. Sängerin, Publikum) mit Farbe und Punkt auf einer Draufsicht der Bühne
- Regie (M11d): Lichtszenen je Lied und Schauspiel – im Raster die Geräte antippen (mehrere möglich) und Helligkeit, Farbe (Farbrad oder frei), Gobo mit Drehung, Ziel, Bewegung mit Tempo, Prisma, Zoom, Fokus, Iris, Frost, Strobe und Notiz setzen; das Raster zeigt jede Szene in ihren Farben. „+ Szene“ übernimmt die Werte der gewählten Szene, „+ leere Szene“ beginnt leer; Szenen sortieren, kopieren, löschen
- Regie: Auslöser je Szene per Zeitpunkt („Jetzt“ übernimmt die Abspielzeit) oder Textzeile; Szenen als Marken auf der Zeitleiste des Players, „Beim Abspielen mitgehen“ zeigt die laufende Szene
- Regie (M11e): Vorstellungs-Ansicht im Vollbild (dunkel) – aktueller Eintrag mit mitlaufendem Text, aktuelle Lichtszene als Raster, was als Nächstes kommt, Player, große Knöpfe „Szene/Eintrag zurück/weiter“ und Pfeiltasten
- Vorstellung: „Führen“ (Regie- oder Bearbeiten-Zugang) überträgt die Stelle live an alle, die „Folgen“ eingeschaltet haben – Nachzügler springen direkt an die aktuelle Stelle, eigenes Bedienen verlässt das Folgen; wer führt, ist sichtbar
- Export: Ablaufplan, Lichtszenen (je Szene das Raster in Farbe und eine Tabelle der Werte) und Textbuch (Rollen, Regieanweisungen, Szenenwechsel am Rand) als PDF
- Geräte-Etiketten: Fußzeile mit Logo und Projektname und einem QR-Code mit dem Hinweis „Aktuelle Informationen finden Sie hier.“ – Scannen öffnet ohne Passwort die Leseansicht des Projekts beim Gerät des Etiketts (nur dieses Projekt, nur lesen)
- Einstellungen (Docker: Einstellungsseite, Desktop: Startfenster): QR-Code auf Etiketten an/aus, Adresse, Hinweistext; Lese-Schlüssel je Projekt erneuern oder sperren (alte Etiketten öffnen dann nichts mehr)

### Behoben

- Regie → Lichtaufbau: Die Draufsicht der Bühne hatte viel leeren Rand; jetzt eng zugeschnitten
- Test „Signalfluss“ wartet nach „Rückgängig“, bis das Gerät wieder gezeichnet ist (schlug unter Last gelegentlich fehl)

## [0.20.0] - 2026-11-05

### Hinzugefügt

- Listen → DMX-Patch: Umschalter „Liste | Universum“. Die grafische Ansicht zeigt je Universum die 512 Kanäle als Raster (32 je Zeile, auf dem Handy 16), die Geräte als farbige, beschriftete Balken, doppelt belegte Kanäle rot gerahmt (überlappende Geräte übereinander), Auslastung, größte freie Bereiche und Geräte ohne Adresse; Klick auf ein Gerät zeigt Modus, Bereich, Stativ/Traverse und Konflikte. Die Wahl bleibt im Browser gespeichert, der Filter gilt auch hier
- Handy-Ansicht (bis 900 px Breite): Zeichenfläche in Signalfluss und Bühnenplan nimmt fast den ganzen Bildschirm ein. Oben eine Kopfzeile mit Burgermenü (Ansichten, Bibliothek, Exportieren, Versionen, Herunterladen, Werkzeuge, Seiten, Anzeige und Filter, Verbundene, Abmelden), unten eine Fußzeile mit Rückgängig, Wiederholen, Hinzufügen, Einpassen, Prüfungen und Eigenschaften
- Handy: Antippen eines Objekts öffnet die Eigenschaften als unteres Blatt (halbe Höhe); es bleibt offen, bis man es über ✕ schließt. Bibliothek und Prüfungen erscheinen ebenfalls als unteres Blatt
- Plan: Regie (Ablauf, Texte, Audio, Lichtszenen) als M11, Release 1.0 als M12

### Geändert

- Ton-Patch: Kanalname-Vorschlag bei Geräten mit Person ist jetzt „Vorname Name (Art)“, z. B. „Anna Muster (Sängerin)“; die Art steht auch neben der Person in der Spalte Quelle/Ziel und im PDF
- Ton-Patch: Gruppen sind farbig zu erkennen – aufeinanderfolgende Kanäle derselben Gruppe bekommen einen Rahmen in der Gruppenfarbe mit dem Gruppennamen als Etikett, die Zeilen sind leicht in der Gruppenfarbe eingefärbt; im PDF steht die Gruppe als farbiges Etikett in der Spalte Quelle/Ziel, die Zeile ist ebenfalls leicht eingefärbt
- Geräte-Etiketten grafisch: farbiger Kopf mit Gerät und Vorlage, Person mit Symbol, je Verbindung ein farbiges Symbol der Signalart (Audio, DMX, Netzwerk, Strom, Video), Anschluss, Richtungspfeil, Gegenstelle und Kabel. Sicherheitsabstand 3 mm zum Etikettenrand und 5 mm zum Blattrand; zu lange Texte werden mit „…“ gekürzt, zu viele Verbindungen als „… und n weitere“

### Behoben

- PDF Bühnenplan/Signalfluss: Die Legende im Planköpfchen lief bei vielen Kategorien über den Rand; jetzt bricht sie über die ganze Breite um (höchstens 3 Zeilen, der Rest als „+ n weitere“), die Zeichenfläche wird entsprechend kleiner. Im Hochformat ragt das Köpfchen nicht mehr über den rechten Rand
- PDF-Fußzeile: höchstens zwei Zeilen, längere Angaben werden gekürzt
- Server-Tests warten auf das Speichern statt fester Pausen (schlugen auf langsamen CI-Rechnern gelegentlich fehl)

## [0.19.0] - 2026-11-03

### Hinzugefügt

- Strom: Hinweis in „Prüfungen“, wenn in einem Stromkreis (ab einem abgesicherten Abgang bzw. der Einspeisung) mehr als 3 Mehrfachsteckdosen stecken – hintereinander oder nebeneinander
- Signalfluss: Strom in den Kästen (eingestellte Maximalwerte, nicht live) – an Verteilern und Mehrfachsteckdosen die Summe („⚡ 10,0 A · 2,3 kW · 63 %“), an jedem belegten Strom-Abgang der Strom („A1 · 10,0 A (63 %)“), an Verbrauchern die Leistung („⚡ 1,15 kW“); ab 80 % Auslastung orange, ab 100 % rot; ein-/ausblendbar über „In Kästen: Strom“

### Behoben

- Stromliste: Die Phasenbalken blieben leer, wenn an der Zuleitung keine Absicherung eingetragen war (z. B. Wandsteckdose, Mehrfachsteckdose); jetzt gilt sonst die Absicherung des Abgangs davor, die größte der eigenen Abgänge oder 16 A als Richtwert (jeweils angezeigt)
- Strom: Hauptverteiler ohne Phasenangabe an der Zuleitung (z. B. Wandsteckdose ohne Zuleitung) galten als Drehstrom und lösten eine Schieflast-Warnung aus; jetzt gilt Drehstrom nur, wenn er erkennbar ist (Zuleitung oder Abgang mit „3P“ bzw. Abgänge auf mehreren Phasen), sonst einphasig
- Signalfluss und Bühnenplan: Beim Ziehen eines Kastens, Objekts oder Kabels an den Rand scrollt die Ansicht jetzt mit (bisher nur beim Markieren); das Gezogene bleibt unter dem Mauszeiger

## [0.18.0] - 2026-11-03

### Hinzugefügt

- Bühnenplan: Reiter „Im Plan“ – alles, was im Bühnenplan steht, mit Suche, nach Kategorien, Person, Besitzer, Gegenstellen und Ebene; Klick wählt aus und holt es ins Bild
- Signalfluss: Seitenleiste mit „Bibliothek“ und „Im Plan“ – alle Geräte im Signalfluss (alle Seiten) mit denselben Angaben und der Seite; Klick wechselt bei Bedarf die Seite, wählt aus und holt es ins Bild
- Bühnenplan: Beim Einfügen (aus der Bibliothek oder „Nicht platziert“) fragt ein Fenster, auf welche Ebene – bei mehr als einer Ebene; vorausgewählt ist die aktive Ebene, gesperrte Ebenen sind nicht wählbar, eine ausgeblendete wird eingeblendet

### Behoben

- Bühnenplan: Ein aus „Nicht platziert“ eingefügtes Gerät landete auf seiner bisherigen Ebene statt auf der gewählten und war dadurch evtl. nicht zu sehen; außerdem werden Geräte auf einem Podest, an einem Stativ oder einer Traverse jetzt immer über ihrem Träger gezeichnet, auch wenn der Träger auf einer höheren Ebene liegt

## [0.17.0] - 2026-11-03

### Hinzugefügt

- Bühnenplan und Signalfluss: Umschalter „Fläche: Auto · Hell · Dunkel“ für die Zeichenfläche (je Ansicht, je Browser bzw. App gemerkt; „Auto“ folgt dem Systemdesign); die Schrift passt sich an

- Bühnenplan: Ebenen sortierbar („Nach oben“/„Nach unten“ in der Ebenen-Liste); oben in der Liste = oben im Plan. Objekte werden nach Ebenen gezeichnet, Gruppenrahmen direkt unter den Objekten der untersten Ebene ihrer Mitglieder (auch im PDF)

- Bühnenplan, „Nicht platziert“: Suche (Kennung, Vorlage, Person, Besitzer, Gegenstelle), nach Kategorien gruppiert, und je Gerät, wo es eingesteckt ist („→ Stagebox · In 3“ / „← Pult · Aux 1“)
- Bühnenplan: Texte am Plan einzeln ein-/ausblendbar – Kennung, Person, Meter (Höhe am Objekt und Länge an jedem Kabel) und Kabelname (neu: Kabeltyp bzw. Bezeichnung am Kabel); Auswahl und der gewählte Reiter links bleiben beim Neuladen erhalten (je Browser bzw. App)

- Defekte Anschlüsse: Im Signalfluss lassen sich Anschlüsse eines Geräts (bei Multicores ganze Adern) als defekt markieren – in den Eigenschaften unter „Defekte Anschlüsse“ (mit Notiz) oder per Rechtsklick auf den Anschluss; gilt nur für dieses Gerät im Projekt, nicht für die Vorlage. Defekte Anschlüsse bekommen ein rotes X (auch im PDF), neue Kabel lassen sich dort nicht stecken, bestehende erscheinen als Warnung in „Prüfungen“; der Ton-Patch nennt defekte Anschlüsse/Adern auf dem Weg

### Geändert

- Dunkles Systemdesign: Beschriftungen auf der Zeichenfläche werden auf dunklem Hintergrund hell, auf hellem dunkel (Bühnenplan: Kennung/Person/Höhe außerhalb von Objekten, Multicore-Enden, Wände, Texte, Maßlinien; Signalfluss: „nicht im Bühnenplan“, Seitenverweise); Beschriftungen in Objekten richten sich nach der Objektfarbe
- Bühnenplan: direkt gesteckte Verbindungen (ohne Kabel) erscheinen jetzt gestrichelt (vorher gar nicht), auch im PDF
- Projektformat 8 (defekte Anschlüsse); ältere Steckplan-Versionen können Projekte im Format 8 nicht öffnen

### Behoben

- Server/Docker: Hinter einem Reverse-Proxy (z. B. nginx, Nginx Proxy Manager) wurden ruhende Live-Verbindungen nach kurzer Zeit getrennt und neu aufgebaut – die Oberfläche flackerte dabei kurz. Der Server sendet jetzt alle 25 s ein Lebenszeichen (Ping) und beendet tote Verbindungen; bei kurzen Unterbrechungen bleibt die Oberfläche bedienbar (Abgleich beim Neuverbinden)

## [0.16.0] - 2026-11-02

### Hinzugefügt

- Bühnenplan, „Nicht platziert“: je Gerät die Person (wenn es von einem Menschen benutzt wird) und der Besitzer
- Signalfluss: Kästen lassen sich am schraffierten Griff rechts unten breiter und höher ziehen (Anschlüsse verteilen sich mit mehr Abstand; nie kleiner als automatisch; Doppelklick auf den Griff = automatische Größe); die Größe gilt auch im PDF
- Signalfluss: Kabellinien „eckig“ oder „geschwungen“ (Umschalter „Kabel“ in der Leiste, gilt für das ganze Projekt und im PDF)

### Geändert

- Ton-Patch: Spalte „Stativ“ entfernt (Liste, PDF und CSV)
- Ton-Patch, Spalte „Über“: der Weg reicht jetzt bis zum Mischpult und nennt die Anschlüsse je Gerät (Eingang / Ausgang), z. B. „MC · Send 1 (FOH) → SB1 · In 1 / Dante → SB2 · Dante A / Dante B → Wing · Dante“; bei Ausgängen beginnt der Weg am Pult (gilt auch für PDF und CSV)
- Signalfluss-Seiten: „Neue Seite“ liegt jetzt im Dialog „Seiten verwalten“ (die Leiste zeigt nur noch die Seiten und „Seiten verwalten“)
- Projektformat 7 (Kastengröße, Kabellinien); ältere Steckplan-Versionen können Projekte im Format 7 nicht öffnen

### Behoben

- Signalfluss: Beim Verschieben eines Kastens ging seine Seitenzuordnung verloren (er landete auf der ersten Seite)
- Server: Wurde ein Projekt direkt nach dem Schließen wegen Leerlaufs wieder geöffnet, konnte es den Stand vor dem letzten Speichern laden; jetzt wird erst nach dem Speichern neu geladen

## [0.15.0] - 2026-11-02

### Hinzugefügt

- Netzwerk-Kanäle je Ausgang: Geräte mit mehreren Ausgängen (z. B. Keyboard L/R, Funkempfänger) lassen sich mit jedem Ausgang einem eigenen Pult-Kanal zuordnen („Out L → Pult-Kanal (Netzwerk)“); Stagebox, Pult und Input-Liste zeigen den Anschluss („Keys · Out L“)
- Ton-Patch: „Nur belegte Kanäle“ (Vorgabe an) blendet freie Kanäle aus; ohne belegte Kanäle erklärt ein Hinweis, wie Kanäle auf das Pult kommen

### Geändert

- Ton-Patch: Netzwerk-Kanäle stehen oben, die Anschlüsse am Pult darunter
- Projektformat 6: Zuordnungen zum Pult-Kanal gelten je Ausgang; bestehende Projekte werden beim Öffnen umgestellt (die bisherige Zuordnung gilt für den ersten Ausgang mit durchgehender Kette). Ältere Steckplan-Versionen können Projekte im Format 6 nicht öffnen

## [0.14.2] - 2026-11-02

### Hinzugefügt

- Docker-Compose-Beispiele: `docker-compose.yml` (eigenes Netz) und `docker-compose.https.yml` mit Caddy (HTTPS mit automatischem Zertifikat), Passwörter aus `.env` (Vorlage `.env.example`); Docker-Anleitung um Compose, HTTPS, Sichern/Wiederherstellen und Desktop-Verbindung ergänzt

### Geändert

- Signalfluss, Netzwerk-Kanäle: An der Stagebox steht je Eingang die Quelle mit Person und der Pult-Kanal („In 1 · Mikro 1 (Anna Muster) → 7“); am Mischpult stehen rechts die belegten Netzwerk-Kanäle mit Name, Gerät und Stagebox-Eingang („7 · Mikro 1 (Anna Muster) ← S16 · In 1“); ein-/ausblendbar über „In Kästen: Kanäle“; Kästen dürfen breiter werden, damit weniger abgeschnitten wird

## [0.14.1] - 2026-11-02

### Hinzugefügt

- Export: Tabellen sortierbar – „Sortieren nach … dann nach … dann nach …“ (bis zu drei Spalten, je auf- oder absteigend) für Kabelliste, Stückliste, DMX-Patch, Geräteliste, Netzwerkliste, Personenliste, Input-/Output-Liste und Stromliste; gilt für PDF, CSV und Vorschau; „natürliche“ Reihenfolge (Spot 2 vor Spot 10), leere Zellen am Ende

### Geändert

- Netzwerk-Kanäle: Die Kette wird jetzt auch durch Multicore-Adern vor der Stagebox und über weitere Geräte im Netzwerk (z. B. zweite Stagebox, Switch) erkannt – z. B. Mikrofon → Multicore → Stagebox 1 → Stagebox 2 → Pult; die Input-Liste zeigt den ganzen Weg

## [0.14.0] - 2026-11-02

Netzwerk-Kanäle, Seiten im Signalfluss, Export-Vorschau (Dateiformat 5).

### Hinzugefügt

- Seiten im Signalfluss (z. B. Licht und Ton): Reiter über der Zeichenfläche, „Seite“ anlegen (beim ersten Mal bekommen die vorhandenen Geräte eine eigene Seite), „Seiten verwalten“ (umbenennen, Reihenfolge, löschen mit Umzug der Geräte); Geräte in den Eigenschaften auf eine andere Seite verschieben (auch mehrere); neue Geräte landen auf der aktuellen Seite; Kabel zu Geräten auf anderen Seiten als Verweis am Anschluss („→ Ton: Vox“) – ein Klick wechselt dorthin; im PDF je Seite ein Blatt, Seiten wählbar
- Export-Vorschau: der Export-Dialog zeigt das PDF live neben den Optionen (blättern, vergrößern), bei Listen wahlweise die CSV als Tabelle
- Netzwerk-Kanäle für digitale Stageboxen: Anzahl in der Mischpult-Vorlage (je Pult änderbar); in den Eigenschaften einer Quelle „Pult-Kanal (Netzwerk)“ zuordnen – nur bei durchgehender Kette (Quelle → Stagebox → Netzwerkkabel direkt zum Pult), belegte Kanäle sind gekennzeichnet; Anzeige „In 1 → FOH 12“ am Stagebox-Eingang im Signalfluss (ein-/ausblendbar unter „In Kästen: Kanäle“); eigener Abschnitt in der Input-Liste (Bildschirm, PDF, CSV); Prüfungen für unterbrochene Ketten, fehlende und doppelt belegte Kanäle

### Geändert

- Dateiformat 5 (ältere Dateien werden beim Öffnen automatisch angehoben)

## [0.13.4] - 2026-11-02

### Geändert

- Bibliothek: Die Liste links ist nach Kategorien gegliedert (einklappbar, mit Anzahl; „ohne Kategorie“ am Ende) – in allen Bereichen, auch beim Suchen

## [0.13.3] - 2026-11-02

### Hinzugefügt

- Übersicht „Personen ohne Gerät“: oben in Listen → Personen (mit Umschalter „nur Personen ohne Gerät“), hervorgehobene Gerätezahl unter Projektdaten → Personen, Hinweis in den Prüfungen; Personenliste als PDF/CSV enthält jetzt auch Personen ohne Gerät
- Markieren: Wird der Rahmen an den Rand der Zeichenfläche gezogen (oder darüber hinaus), scrollt die Ansicht in diese Richtung – je näher am Rand, desto schneller; der Rahmen wächst mit (Signalfluss und Bühnenplan). Loslassen außerhalb der Zeichenfläche schließt den Rahmen ab
- Knopf „Bibliothek“ im Projekt (vor „Exportieren“): öffnet am Desktop das Bibliotheksfenster, im Browser einen neuen Tab – das Projekt bleibt offen

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

[Unreleased]: https://github.com/rde-master/steckplan/compare/v0.27.2...develop
[0.27.2]: https://github.com/rde-master/steckplan/compare/v0.27.1...v0.27.2
[0.27.1]: https://github.com/rde-master/steckplan/compare/v0.27.0...v0.27.1
[0.27.0]: https://github.com/rde-master/steckplan/compare/v0.26.2...v0.27.0
[0.26.2]: https://github.com/rde-master/steckplan/compare/v0.26.1...v0.26.2
[0.26.1]: https://github.com/rde-master/steckplan/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/rde-master/steckplan/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/rde-master/steckplan/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/rde-master/steckplan/compare/v0.23.4...v0.24.0
[0.23.4]: https://github.com/rde-master/steckplan/compare/v0.23.3...v0.23.4
[0.23.3]: https://github.com/rde-master/steckplan/compare/v0.23.2...v0.23.3
[0.23.2]: https://github.com/rde-master/steckplan/compare/v0.23.1...v0.23.2
[0.23.1]: https://github.com/rde-master/steckplan/compare/v0.23.0...v0.23.1
[0.23.0]: https://github.com/rde-master/steckplan/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/rde-master/steckplan/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/rde-master/steckplan/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/rde-master/steckplan/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/rde-master/steckplan/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/rde-master/steckplan/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/rde-master/steckplan/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/rde-master/steckplan/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/rde-master/steckplan/compare/v0.14.2...v0.15.0
[0.14.2]: https://github.com/rde-master/steckplan/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/rde-master/steckplan/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/rde-master/steckplan/compare/v0.13.4...v0.14.0
[0.13.4]: https://github.com/rde-master/steckplan/compare/v0.13.3...v0.13.4
[0.13.3]: https://github.com/rde-master/steckplan/compare/v0.13.2...v0.13.3
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
