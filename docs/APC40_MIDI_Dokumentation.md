# Akai APC40 (Original, 2009) – MIDI-Dokumentation

Vollständige Referenz, um **jedes Bedienelement** des originalen Akai Professional APC40 in einer beliebigen Software (eigene App, Bome MIDI Translator, Max/MSP, Python, Node, QLC+, grandMA3 via MIDI usw.) zu nutzen – **inklusive farbiger LED-Steuerung**.

> **Gilt nur für das originale APC40.** Das APC40 **mkII** hat eine komplett andere Belegung (RGB, andere Notennummern) und ist hier **nicht** beschrieben.

Quelle: *Akai – Communications Protocol for Akai APC40 Controller, Rev 1 (Mai 2009)*. Stellen, die im Protokoll nicht eindeutig sind, sind mit ⚠️ markiert – dort bitte mit einem MIDI-Monitor gegenprüfen.

---

## Inhaltsverzeichnis

1. [Wichtig vorab: Was kann „bunt“ beim APC40?](#1-wichtig-vorab-was-kann-bunt-beim-apc40)
2. [Grundlagen & Schreibweise](#2-grundlagen--schreibweise)
3. [Betriebsmodi & Initialisierung (SysEx)](#3-betriebsmodi--initialisierung-sysex)
4. [Layout-Übersicht](#4-layout-übersicht)
5. [Buttons – eingehende Nachrichten (APC40 → Software)](#5-buttons--eingehende-nachrichten-apc40--software)
6. [Fader, Knöpfe, Crossfader, Fußschalter](#6-fader-knöpfe-crossfader-fußschalter)
7. [LED-Steuerung (Software → APC40)](#7-led-steuerung-software--apc40)
8. [LED-Ringe der Drehregler](#8-led-ringe-der-drehregler)
9. [Device Inquiry](#9-device-inquiry)
10. [Komplette Belegungstabelle (Spickzettel)](#10-komplette-belegungstabelle-spickzettel)
11. [Code-Beispiele](#11-code-beispiele)
12. [Typische Stolperfallen](#12-typische-stolperfallen)

---

## 1. Wichtig vorab: Was kann „bunt“ beim APC40?

| Bereich | Anzahl | Farben / Zustände |
|---|---|---|
| **Clip-Launch-Matrix** (8 × 5) | 40 | **Aus, Grün, Rot, Gelb** – jeweils **dauerhaft oder blinkend** |
| Clip Stop (unter der Matrix) | 8 | Aus / An / Blinken (einfarbig) |
| Scene Launch (rechts) | 5 | Aus / An / Blinken (einfarbig) |
| Alle anderen Buttons mit LED | – | Nur Aus / An (einfarbig) |
| LED-Ringe um die 16 Drehregler | 16 | 15 LEDs, 4 Anzeigestile |

**Nur die 40 Clip-Launch-Buttons sind mehrfarbig.** Sie haben je eine rote und eine grüne LED; „Gelb“ (Amber) entsteht, wenn beide leuchten. Mehr Farben gibt das Gerät hardwareseitig nicht her.

Damit die Software die Farben **vollständig selbst bestimmt**, das Gerät in **Modus 2** schalten (Kapitel 3).

---

## 2. Grundlagen & Schreibweise

- Zahlen mit `0x` sind hexadezimal, sonst dezimal.
- **MIDI-Kanal** wird hier **0-basiert** angegeben (Kanal 0 = „Kanal 1“ in den meisten Programmen).
- Note-On = Statusbyte `0x90 + Kanal`, Note-Off = `0x80 + Kanal`, Control Change = `0xB0 + Kanal`.
- Spalten der Matrix / Kanalzüge = **Track 1–8 = MIDI-Kanal 0–7**. Die Track-Zuordnung steckt also im **Kanal**, nicht in der Notennummer.

Beispiel: Clip-Button in Spalte 3, oberste Reihe = Note `0x35` (53) auf Kanal 2 → Statusbyte `0x92`.

---

## 3. Betriebsmodi & Initialisierung (SysEx)

Nach dem Einschalten startet das APC40 immer im **Modus 0 (Generic)**. Der Modus wird mit der **Introduction-Message** gewechselt.

### 3.1 Introduction-Message

```
F0 47 7F 73 60 00 04 <Modus> <Version Major> <Version Minor> <Bugfix> F7
```

| Byte | Bedeutung |
|---|---|
| `F0` | SysEx-Start |
| `47` | Hersteller-ID Akai |
| `7F` | Device-ID (Broadcast) |
| `73` | Produkt-ID APC40 |
| `60` | Message-Typ „Introduction“ |
| `00 04` | Länge der Nutzdaten = 4 Bytes |
| `<Modus>` | `40` = Modus 0, `41` = Modus 1, `42` = Modus 2 |
| 3 × Version | Beliebige Versionsnummer deiner Software (z. B. `01 00 00`) |
| `F7` | SysEx-Ende |

**Fertige Strings zum Kopieren:**

| Modus | SysEx |
|---|---|
| Modus 0 – Generic | `F0 47 7F 73 60 00 04 40 01 00 00 F7` |
| Modus 1 – Ableton Live | `F0 47 7F 73 60 00 04 41 01 00 00 F7` |
| **Modus 2 – Alternate Ableton Live (empfohlen)** | `F0 47 7F 73 60 00 04 42 01 00 00 F7` |

> Die Message muss **bei jedem Verbinden / Einschalten** erneut gesendet werden – das Gerät merkt sich den Modus nicht.

### 3.2 Unterschiede der Modi

| Eigenschaft | Modus 0 – Generic | Modus 1 – Ableton | **Modus 2 – Alternate** |
|---|---|---|---|
| Button-Verhalten | gemischt (Toggle / Momentary / Radio, s. Kap. 5) | alle **momentary** | alle **momentary** |
| LEDs | teilweise vom Gerät selbst gesteuert | Host steuert, außer Device-Ringe (Gerät, überschreibbar) | **Host steuert alle LEDs** |
| Track-Selection-Buttons | senden **kein MIDI**, wählen intern die Bank der Device-Regler | senden MIDI | senden MIDI |
| Device-Regler (rechts oben 8×) | 9 Bänke (Kanal 0–8) | nicht gebankt | nicht gebankt |
| LED-Ringe | immer Stil „Single“ | per Host einstellbar | per Host einstellbar |

**Empfehlung:** Für eigene Software **Modus 2** – jeder Button sendet Druck *und* Loslassen, und jede LED (inkl. Farbe) wird ausschließlich von deiner Software gesetzt. Toggle-Logik, Farbwechsel, Blinken usw. baust du selbst.

Modus 0 ist nur sinnvoll, wenn die Software **keine** Rückmeldung senden kann (dann leuchten Toggle-Buttons selbstständig, Clip-Buttons aber nur, solange sie gedrückt sind).

---

## 4. Layout-Übersicht

```
 ┌──────────────────────────────────────────────────────┬───────────────────────────────┐
 │  CLIP-LAUNCH-MATRIX  (Note 53–57, Kanal = Spalte)     │ SCENE   │  TRACK CONTROL       │
 │                                                       │ LAUNCH  │  8 Regler CC 48–55   │
 │  Sp.1 Sp.2 Sp.3 Sp.4 Sp.5 Sp.6 Sp.7 Sp.8              │         │  Pan/SendA/B/C 87–90 │
 │ [53] [53] [53] [53] [53] [53] [53] [53]  Reihe 1      │  [82]   │                      │
 │ [54] [54] [54] [54] [54] [54] [54] [54]  Reihe 2      │  [83]   │                      │
 │ [55] [55] [55] [55] [55] [55] [55] [55]  Reihe 3      │  [84]   │                      │
 │ [56] [56] [56] [56] [56] [56] [56] [56]  Reihe 4      │  [85]   │                      │
 │ [57] [57] [57] [57] [57] [57] [57] [57]  Reihe 5      │  [86]   │                      │
 │ [52] [52] [52] [52] [52] [52] [52] [52]  Clip Stop    │  [81] Stop All Clips           │
 ├──────────────────────────────────────────────────────┼───────────────────────────────┤
 │ [51] Track Select je Spalte              [80] Master  │  DEVICE CONTROL              │
 │ [50] Activator   je Spalte                            │  8 Regler CC 16–23           │
 │ [49] Solo/Cue    je Spalte                            │  Buttons 58–65               │
 │ [48] Rec Arm     je Spalte                            │  Transport 91–93             │
 │                                                       │  Bank ▲▼▶◀ 94–97, Shift 98   │
 │ Fader CC 7 (Kanal 0–7)        Master CC 14            │  Tap 99, Nudge+ 100, − 101   │
 │                                                       │  Cue Level CC 47 (relativ)   │
 │                     Crossfader CC 15                  │                              │
 └──────────────────────────────────────────────────────┴───────────────────────────────┘
   Alle Werte dezimal. Kanal 0–7 = Spalte/Track 1–8.
```

---

## 5. Buttons – eingehende Nachrichten (APC40 → Software)

- **Drücken:** Note-On, Velocity `127` (`0x7F`)
- **Loslassen:** Note-Off (`0x80 + Kanal`), Velocity `127`
- Bei „Kanal: –“ spielt der Kanal keine Rolle (das Gerät sendet auf Kanal 0).

### 5.1 Pro-Spur-Buttons (Kanal = Track 0–7)

| Button | Note dez | Note hex | Kanal | Typ in Modus 0 | LED |
|---|---|---|---|---|---|
| Record Arm | 48 | `0x30` | 0–7 | Toggle | an/aus |
| Solo / Cue | 49 | `0x31` | 0–7 | Toggle | an/aus |
| Activator (Track On) | 50 | `0x32` | 0–7 | Toggle | an/aus |
| Track Selection | 51 | `0x33` | 0–7 | Radio, **sendet kein MIDI** | an/aus |
| Clip Stop | 52 | `0x34` | 0–7 | Momentary | an/aus/**blink** |
| Clip Launch Reihe 1 (oben) | 53 | `0x35` | 0–7 | Momentary | **mehrfarbig** |
| Clip Launch Reihe 2 | 54 | `0x36` | 0–7 | Momentary | **mehrfarbig** |
| Clip Launch Reihe 3 | 55 | `0x37` | 0–7 | Momentary | **mehrfarbig** |
| Clip Launch Reihe 4 | 56 | `0x38` | 0–7 | Momentary | **mehrfarbig** |
| Clip Launch Reihe 5 (unten) | 57 | `0x39` | 0–7 | Momentary | **mehrfarbig** |

In Modus 1/2 sind **alle** Buttons momentary.

### 5.2 Device-Control-Buttons (rechts, unter den Device-Reglern)

| Nr. | Beschriftung | Note dez | Note hex | Typ in Modus 0 | LED |
|---|---|---|---|---|---|
| 1 | Clip/Track | 58 | `0x3A` | Toggle | an/aus |
| 2 | Device On/Off | 59 | `0x3B` | Toggle | an/aus |
| 3 | ◀ (Device links) | 60 | `0x3C` | Toggle | an/aus |
| 4 | ▶ (Device rechts) | 61 | `0x3D` | Toggle | an/aus |
| 5 | Detail View | 62 | `0x3E` | Momentary | an/aus |
| 6 | Rec Quantization | 63 | `0x3F` | Momentary | an/aus |
| 7 | MIDI Overdub | 64 | `0x40` | Momentary | an/aus |
| 8 | Metronome | 65 | `0x41` | Momentary | an/aus |

**Kanal:** In Modus 0 = gewählte Track-Bank (0–7, Master = 8). ⚠️ In Modus 1/2 sind die Device-Controls nicht gebankt – den tatsächlich gesendeten Kanal einmal mit einem MIDI-Monitor prüfen (erwartet: Kanal 0).

### 5.3 Globale Buttons (Kanal egal)

| Button | Note dez | Note hex | Typ in Modus 0 | LED |
|---|---|---|---|---|
| Master Track Select | 80 | `0x50` | Radio (kein MIDI) | an/aus |
| Stop All Clips | 81 | `0x51` | Momentary | – |
| Scene Launch 1 | 82 | `0x52` | Momentary | an/aus/**blink** |
| Scene Launch 2 | 83 | `0x53` | Momentary | an/aus/**blink** |
| Scene Launch 3 | 84 | `0x54` | Momentary | an/aus/**blink** |
| Scene Launch 4 | 85 | `0x55` | Momentary | an/aus/**blink** |
| Scene Launch 5 | 86 | `0x56` | Momentary | an/aus/**blink** |
| Pan | 87 | `0x57` | Toggle | an/aus |
| Send A | 88 | `0x58` | Toggle | an/aus |
| Send B | 89 | `0x59` | Toggle | an/aus |
| Send C | 90 | `0x5A` | Toggle | an/aus |
| Play | 91 | `0x5B` | Momentary | – |
| Stop | 92 | `0x5C` | Momentary | – |
| Record | 93 | `0x5D` | Momentary | – |
| Bank Select ▲ Up | 94 | `0x5E` | Momentary | – |
| Bank Select ▼ Down | 95 | `0x5F` | Momentary | – |
| Bank Select ▶ Right | 96 | `0x60` | Momentary | – |
| Bank Select ◀ Left | 97 | `0x61` | Momentary | – |
| Shift | 98 | `0x62` | Momentary | – |
| Tap Tempo | 99 | `0x63` | Momentary | – |
| Nudge + | 100 | `0x64` | Momentary | – |
| Nudge − | 101 | `0x65` | Momentary | – |

> Buttons mit „–“ in der LED-Spalte haben laut Protokoll keine ansteuerbare LED.

**Shift** sendet einfach eigene Note-On/Off-Nachrichten. Shift-Kombinationen (z. B. Shift + Clip = andere Funktion) baust du in deiner Software, indem du den Shift-Zustand mitführst.

---

## 6. Fader, Knöpfe, Crossfader, Fußschalter

### 6.1 Absolute Regler (Wert 0–127)

| Element | CC dez | CC hex | Kanal |
|---|---|---|---|
| Kanalfader Track 1–8 | 7 | `0x07` | 0–7 |
| Master-Fader | 14 | `0x0E` | 0 |
| Crossfader | 15 | `0x0F` | 0 |
| Device Control Regler 1–8 | 16–23 | `0x10–0x17` | Modus 0: Bank 0–8 · Modus 1/2: ⚠️ s. 5.2 |
| Track Control Regler 1–8 | 48–55 | `0x30–0x37` | 0 |
| Fußschalter 1 | 64 | `0x40` | 0 – `127` gedrückt, `0` losgelassen |
| Fußschalter 2 | 67 | `0x43` | 0 – `127` gedrückt, `0` losgelassen |

Die Drehregler sind Endlos-Encoder, senden aber **absolute** Werte (0–127). Die Software kann die interne Position per CC zurücksetzen (Kapitel 8), z. B. beim Seiten-/Bankwechsel.

**Bank-Verhalten Modus 0:** Wählt man mit Track Selection eine Spur, senden die 8 Device-Regler (und Device-Buttons) auf deren Kanal (0–7, Master = 8). Beim Bankwechsel sendet das Gerät sofort die aktuellen Positionen aller 8 Device-Regler.

### 6.2 Relativer Regler: Cue Level

| Element | CC dez | CC hex | Kanal |
|---|---|---|---|
| Cue Level | 47 | `0x2F` | 0 |

Wert-Dekodierung (Zweierkomplement, 7 Bit):

| Wert | Bedeutung |
|---|---|
| `0` | keine Änderung |
| `1–63` | +1 … +63 (im Uhrzeigersinn) |
| `64–127` | −64 … −1 (gegen den Uhrzeigersinn) |

```text
delta = (wert < 64) ? wert : wert - 128
```

---

## 7. LED-Steuerung (Software → APC40)

### 7.1 Prinzip

| Aktion | Nachricht |
|---|---|
| LED einschalten / Farbe setzen | **Note-On** `0x90 + Kanal`, Note, **Velocity = Farbe/Zustand** |
| LED ausschalten | **Note-Off** `0x80 + Kanal`, Note, beliebige Velocity (bevorzugt) – oder Note-On mit Velocity 0 |

Die Kanalangabe zählt nur bei den Pro-Spur-Noten `0x30–0x41` (48–65). Bei allen anderen Noten wird sie ignoriert.

### 7.2 Farben der Clip-Launch-Matrix (Note 53–57)

| Velocity | Farbe / Zustand |
|---|---|
| `0` | Aus |
| `1` | 🟩 Grün |
| `2` | 🟩 Grün **blinkend** |
| `3` | 🟥 Rot |
| `4` | 🟥 Rot **blinkend** |
| `5` | 🟨 Gelb (Amber) |
| `6` | 🟨 Gelb **blinkend** |
| `7–127` | 🟩 Grün |

Das Blinken übernimmt das Gerät selbst (die Software muss nicht takten).

### 7.3 Clip Stop & Scene Launch (Note 52, 82–86)

| Velocity | Zustand |
|---|---|
| `0` | Aus |
| `1` | An |
| `2` | **Blinkend** |
| `3–127` | An |

### 7.4 Alle übrigen LED-Buttons (48–51, 58–65, 80, 87–90)

| Velocity | Zustand |
|---|---|
| `0` | Aus |
| `1–127` | An |

### 7.5 Beispiele (Hex)

| Ziel | Bytes |
|---|---|
| Spalte 1, Reihe 1 grün | `90 35 01` |
| Spalte 4, Reihe 3 rot blinkend | `93 37 04` |
| Spalte 8, Reihe 5 gelb | `97 39 05` |
| Spalte 8, Reihe 5 aus | `87 39 00` |
| Scene 2 blinkend | `90 53 02` |
| Record Arm Spur 3 an | `92 30 01` |
| Solo Spur 6 aus | `85 31 00` |
| Metronom-LED an | `90 41 01` |

---

## 8. LED-Ringe der Drehregler

Jeder der 16 Regler hat einen Ring aus 15 LEDs. Gesteuert wird mit **zwei** CC-Nachrichten:

1. **Ring-Stil** setzen (einmalig nach dem Init)
2. **Wert** setzen (= gleiche CC wie der Regler selbst) – das bewegt Ring **und** interne Position

### 8.1 CC-Nummern

| Regler | Wert-CC | Stil-CC | Kanal |
|---|---|---|---|
| Track Control 1–8 | 48–55 (`0x30–0x37`) | **56–63** (`0x38–0x3F`) | 0 |
| Device Control 1–8 | 16–23 (`0x10–0x17`) | **24–31** (`0x18–0x1F`) | Modus 0: Bank 0–8 |

Merkregel: **Stil-CC = Wert-CC + 8**.

### 8.2 Ring-Stile

| Wert | Stil | Darstellung |
|---|---|---|
| `0` | Aus | Ring dunkel |
| `1` | Single | ein Punkt wandert mit dem Wert |
| `2` | Volume | Balken von links, 0 = alles aus, 127 = alle 15 an |
| `3` | Pan | wächst von der Mitte nach links/rechts, 63–64 = nur Mitte |
| `4–127` | Single | wie 1 |

In Modus 0 sind alle Ringe fest auf „Single“.

### 8.3 Beispiele

| Ziel | Bytes |
|---|---|
| Track-Regler 1 als Pan-Ring | `B0 38 03` |
| Track-Regler 1 auf Mitte | `B0 30 40` |
| Device-Regler 3 als Volume-Ring | `B0 1A 02` |
| Device-Regler 3 auf 75 % | `B0 12 5F` |
| Fader-Position setzen (Track 2) | `B1 07 64` (motorlos – setzt nur den internen Wert) |

---

## 9. Device Inquiry

Zum Erkennen des Geräts (Universal SysEx):

```
Anfrage:  F0 7E 00 06 01 F7
```

Die Antwort enthält Akai-ID `47`, Produkt-ID `73`, Firmware-Version, Device-ID, Seriennummer und Herstellungsdaten. Prüfe in der Antwort auf `47` und `73`, um sicher ein APC40 (Original) zu erkennen.

---

## 10. Komplette Belegungstabelle (Spickzettel)

### Notes (Buttons & LEDs)

| Note | Hex | Element | Kanal | LED |
|---|---|---|---|---|
| 48 | 30 | Record Arm | 0–7 | an/aus |
| 49 | 31 | Solo/Cue | 0–7 | an/aus |
| 50 | 32 | Activator | 0–7 | an/aus |
| 51 | 33 | Track Select | 0–7 | an/aus |
| 52 | 34 | Clip Stop | 0–7 | an/aus/blink |
| 53–57 | 35–39 | Clip Launch Reihe 1–5 | 0–7 | **Grün/Rot/Gelb (+blink)** |
| 58–65 | 3A–41 | Device-Buttons 1–8 | s. 5.2 | an/aus |
| 80 | 50 | Master Select | – | an/aus |
| 81 | 51 | Stop All Clips | – | – |
| 82–86 | 52–56 | Scene Launch 1–5 | – | an/aus/blink |
| 87–90 | 57–5A | Pan, Send A, B, C | – | an/aus |
| 91–93 | 5B–5D | Play, Stop, Record | – | – |
| 94–97 | 5E–61 | Bank ▲ ▼ ▶ ◀ | – | – |
| 98 | 62 | Shift | – | – |
| 99 | 63 | Tap Tempo | – | – |
| 100, 101 | 64, 65 | Nudge +, Nudge − | – | – |

### Control Changes

| CC | Hex | Element | Kanal |
|---|---|---|---|
| 7 | 07 | Kanalfader | 0–7 |
| 14 | 0E | Master-Fader | 0 |
| 15 | 0F | Crossfader | 0 |
| 16–23 | 10–17 | Device-Regler 1–8 (Wert) | s. 6.1 |
| 24–31 | 18–1F | Device-Regler 1–8 (Ring-Stil, nur senden) | s. 6.1 |
| 47 | 2F | Cue Level (relativ) | 0 |
| 48–55 | 30–37 | Track-Control-Regler 1–8 (Wert) | 0 |
| 56–63 | 38–3F | Track-Control-Regler 1–8 (Ring-Stil, nur senden) | 0 |
| 64 | 40 | Fußschalter 1 | 0 |
| 67 | 43 | Fußschalter 2 | 0 |

---

## 11. Code-Beispiele

### 11.1 Python (mido + python-rtmidi)

```python
"""
APC40 (Original) – Modus 2 setzen, Matrix bunt füllen,
Klick auf Clip-Button schaltet Farbe weiter.
pip install mido python-rtmidi
"""
import mido

# Port-Namen ggf. anpassen: print(mido.get_input_names())
IN_NAME  = next(n for n in mido.get_input_names()  if "APC40" in n)
OUT_NAME = next(n for n in mido.get_output_names() if "APC40" in n)

OFF, GREEN, GREEN_BLINK, RED, RED_BLINK, YELLOW, YELLOW_BLINK = range(7)
FARBZYKLUS = [OFF, GREEN, RED, YELLOW, GREEN_BLINK, RED_BLINK, YELLOW_BLINK]

out = mido.open_output(OUT_NAME)

# 1) Modus 2 (mido erwartet SysEx ohne F0/F7)
out.send(mido.Message("sysex", data=[0x47, 0x7F, 0x73, 0x60, 0x00, 0x04,
                                     0x42, 0x01, 0x00, 0x00]))

def clip_led(spalte, reihe, farbe):
    """spalte 0-7, reihe 0-4 (0 = oben)"""
    note = 0x35 + reihe
    if farbe == OFF:
        out.send(mido.Message("note_off", channel=spalte, note=note, velocity=0))
    else:
        out.send(mido.Message("note_on", channel=spalte, note=note, velocity=farbe))

def ring_stil(regler, stil):          # Track-Control-Regler 0-7
    out.send(mido.Message("control_change", channel=0, control=0x38 + regler, value=stil))

def ring_wert(regler, wert):
    out.send(mido.Message("control_change", channel=0, control=0x30 + regler, value=wert))

# 2) Startbild: Regenbogen-Matrix, Ringe als Pan in der Mitte
zustand = {}
for s in range(8):
    for r in range(5):
        farbe = [GREEN, YELLOW, RED, YELLOW, GREEN][r]
        zustand[(s, r)] = farbe
        clip_led(s, r, farbe)
for k in range(8):
    ring_stil(k, 3)
    ring_wert(k, 64)

# 3) Eingaben verarbeiten
with mido.open_input(IN_NAME) as inp:
    for msg in inp:
        if msg.type == "note_on" and 0x35 <= msg.note <= 0x39:
            key = (msg.channel, msg.note - 0x35)
            i = FARBZYKLUS.index(zustand.get(key, OFF))
            zustand[key] = FARBZYKLUS[(i + 1) % len(FARBZYKLUS)]
            clip_led(*key, zustand[key])
        elif msg.type == "control_change" and msg.control == 0x2F:
            delta = msg.value if msg.value < 64 else msg.value - 128
            print("Cue Level Δ", delta)
        elif msg.type in ("note_on", "note_off", "control_change"):
            print(msg)
```

### 11.2 JavaScript (Web MIDI / Electron)

```js
const access = await navigator.requestMIDIAccess({ sysex: true });
const output = [...access.outputs.values()].find(o => o.name.includes("APC40"));
const input  = [...access.inputs.values()].find(i => i.name.includes("APC40"));

// Modus 2
output.send([0xF0, 0x47, 0x7F, 0x73, 0x60, 0x00, 0x04, 0x42, 0x01, 0x00, 0x00, 0xF7]);

const COLOR = { off: 0, green: 1, greenBlink: 2, red: 3, redBlink: 4, yellow: 5, yellowBlink: 6 };

function clipLed(col, row, color) {          // col 0-7, row 0-4
  const note = 0x35 + row;
  color === 0 ? output.send([0x80 | col, note, 0])
              : output.send([0x90 | col, note, color]);
}

function buttonLed(note, on, channel = 0) {   // einfarbige Buttons
  on ? output.send([0x90 | channel, note, 1]) : output.send([0x80 | channel, note, 0]);
}

input.onmidimessage = ({ data: [status, d1, d2] }) => {
  const type = status & 0xF0, ch = status & 0x0F;
  if (type === 0x90) console.log("Button gedrückt", { note: d1, kanal: ch });
  if (type === 0x80) console.log("Button losgelassen", { note: d1, kanal: ch });
  if (type === 0xB0) console.log("Regler", { cc: d1, kanal: ch, wert: d2 });
};

// Beispiel: komplette Matrix rot blinkend
for (let c = 0; c < 8; c++) for (let r = 0; r < 5; r++) clipLed(c, r, COLOR.redBlink);
```

### 11.3 Bome MIDI Translator – Kurzrezept

1. **Init-Preset** (Trigger „Project opened“ / „MIDI port opened“): Ausgabe `F0 47 7F 73 60 00 04 42 01 00 00 F7` an APC40.
2. **Feedback-Translator:** Eingang `9pp qq 7F` → Ausgabe `9pp qq <Farbe>` an APC40 (`pp` = Kanal, `qq` = Note).
3. Note-Off vom Gerät (`8pp qq 7F`) **nicht** an die LED weiterleiten, sonst erlischt sie beim Loslassen.

---

## 12. Typische Stolperfallen

| Problem | Ursache / Lösung |
|---|---|
| LEDs reagieren nicht / Buttons toggeln selbst | Gerät ist noch in Modus 0 → Introduction-Message (Modus 2) senden, **nach jedem Einstecken** |
| LED geht beim Loslassen wieder aus | Software spiegelt das Note-Off des Geräts zurück → nur Note-On auswerten bzw. LED-Zustand separat verwalten |
| Alle Clip-Buttons nur grün | Velocity ≥ 7 gesendet (z. B. 127) → Werte **1–6** verwenden |
| Falsche Spalte leuchtet | Spalte steckt im **MIDI-Kanal**, nicht in der Note; Kanal 0-basiert vs. 1-basiert prüfen |
| SysEx kommt nicht an | In der Software SysEx-Ausgabe aktivieren (Web MIDI: `{ sysex: true }`, manche DAWs filtern SysEx) |
| Track-Select-Buttons senden nichts | Normal in Modus 0 – sie wählen nur die interne Bank. In Modus 1/2 senden sie Note 51 |
| Regler-Ring passt nach Seitenwechsel nicht | Nach Bankwechsel alle Ringwerte per CC neu senden (Wert-CC = setzt Ring + interne Position) |
| Mehrere Farben gleichzeitig / Farbmischung | Nicht möglich – pro Button genau ein Zustand aus der Tabelle 7.2 |
| Ableton belegt das Gerät | In Ableton die Control Surface „APC40“ deaktivieren bzw. Ableton schließen, wenn eine andere Software den Port nutzen soll |

---

*Erstellt nach dem offiziellen „Communications Protocol for Akai APC40 Controller“, Rev 1 (Akai Professional, 2009).*
