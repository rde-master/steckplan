# Entscheidung: PDF-Bibliothek (M7)

**Ergebnis:** pdfmake 0.3 (MIT), wird im Client nur bei Bedarf geladen.

## Verglichen

| Kriterium | pdf-lib 1.17 | pdfmake 0.3 |
|---|---|---|
| Lizenz | MIT | MIT |
| Pflege | letzte Version 2021 | aktiv |
| Tabellen mit Seitenumbruch, Kopf-/Fußzeilen | selbst bauen | eingebaut |
| Vektorzeichnung | Linien/Rechtecke/Pfade, Text drehbar | SVG (Linien, Formen, gedrehter Text) als Vektor |
| Umlaute | nur mit eingebetteter Schrift sicher | Roboto eingebettet |
| Größe im Browser | ~0,5 MB + Schrift | ~0,8 MB + 0,85 MB Schrift (nur beim Export geladen) |

## Spike

Ein Testdokument mit 120 Tabellenzeilen, SVG-Zeichnung (Rechteck, Ellipse, Polylinie, gedrehter Text)
und Umlauten wurde in 0,15 s erzeugt; die Tabelle wurde automatisch auf 4 Seiten umbrochen,
Text und Umlaute ließen sich wieder auslesen.

## Folgen

- Planzeichnungen werden als SVG aus den Daten erzeugt (nicht als Bildschirmfoto) und als Vektor eingebettet.
- Der eingebetteten Schrift Roboto fehlen ✓, ☐ und →: Abhak-Kästchen werden als Rechtecke gezeichnet,
  Pfeile durch „→“-freie Schreibweise ersetzt.
- PDFs entstehen im Client – gleich in Desktop-App, Browser und auf dem Handy.
