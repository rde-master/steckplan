# Steckplan mit Docker betreiben

Steckplan läuft als Docker-Container und wird im Webbrowser benutzt – von mehreren Personen gleichzeitig.

## Schnellstart

```bash
docker run -d --name steckplan \
  -p 8080:8080 \
  -e STECKPLAN_EDIT_PASSWORD='geheim-bearbeiten' \
  -e STECKPLAN_READ_PASSWORD='geheim-lesen' \
  -e TZ=Europe/Berlin \
  -v steckplan-data:/data \
  ghcr.io/rde-master/steckplan:latest
```

Danach im Browser `http://<server>:8080` öffnen.

## Mit Docker Compose (empfohlen)

Im Ordner [`apps/docker`](../apps/docker) liegen fertige Beispiele:

| Datei | Wofür |
|---|---|
| [`docker-compose.yml`](../apps/docker/docker-compose.yml) | Betrieb im eigenen Netz, erreichbar unter `http://<server>:8080` |
| [`docker-compose.https.yml`](../apps/docker/docker-compose.https.yml) + [`Caddyfile`](../apps/docker/Caddyfile) | Zugriff aus dem Internet mit HTTPS (Caddy holt das Zertifikat automatisch) |
| [`.env.example`](../apps/docker/.env.example) | Vorlage für Passwörter und Einstellungen |

**Im eigenen Netz:**

```bash
mkdir steckplan && cd steckplan
# docker-compose.yml und .env.example aus apps/docker hierher kopieren
cp .env.example .env
nano .env                      # beide Passwörter eintragen
docker compose up -d
```

Danach `http://<server>:8080` öffnen. Die Passwörter stehen nur in `.env` – diese Datei nicht weitergeben und nicht in ein Git-Repository einchecken.

**Mit HTTPS aus dem Internet:** Eine Domain (z. B. `steckplan.example.de`) muss per DNS auf den Server zeigen, Ports 80 und 443 müssen offen sein.

```bash
# docker-compose.https.yml, Caddyfile und .env.example in einen Ordner kopieren
cp .env.example .env
nano .env                      # Passwörter und STECKPLAN_DOMAIN eintragen
docker compose -f docker-compose.https.yml up -d
```

Danach `https://<STECKPLAN_DOMAIN>` öffnen. Steckplan selbst ist dabei nur über Caddy erreichbar; `STECKPLAN_TRUST_PROXY` ist schon gesetzt.

**Sichern** (Container muss nicht gestoppt werden, für eine konsistente Sicherung aber besser kurz stoppen):

```bash
docker run --rm --volumes-from steckplan -v "$PWD":/backup alpine \
  tar czf /backup/steckplan-$(date +%F).tar.gz -C /data .
```

**Wiederherstellen:** Container stoppen, Archiv ins Volume entpacken, Container starten:

```bash
docker compose stop
docker run --rm --volumes-from steckplan -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/steckplan-2026-11-02.tar.gz -C /data"
docker compose start
```

## Konfiguration

| Variable | Pflicht | Standard | Bedeutung |
|---|---|---|---|
| `STECKPLAN_EDIT_PASSWORD` | ja | – | Bearbeiten-Passwort (volle Bearbeitung) |
| `STECKPLAN_READ_PASSWORD` | ja | – | Lese-Passwort (ansehen, Packliste abhaken) – muss sich vom Bearbeiten-Passwort unterscheiden |
| `STECKPLAN_DIRECTION_PASSWORD` | nein | – | Regie-Passwort: Regie (Ablauf, Texte) bearbeiten, alles andere nur lesen, keine Häkchen. Ohne = kein Regie-Zugang. Muss sich von den anderen Passwörtern unterscheiden |
| `PORT` | nein | `8080` | Port im Container |
| `TZ` | nein | UTC | Zeitzone, z. B. `Europe/Berlin` |
| `STECKPLAN_TRUST_PROXY` | nein | `false` | `true` nur hinter einem Reverse-Proxy: dann werden `X-Forwarded-For`/`-Proto` ausgewertet (richtige IP für die Begrenzung von Fehlversuchen, sichere Cookies bei HTTPS) |

Ohne die beiden Passwörter startet der Container nicht und meldet, was fehlt.

## Anmelden

Im Browser gibt man **Name** und **Passwort** ein:

- **Bearbeiten-Passwort:** alles bearbeiten, Projekte anlegen, hochladen, löschen, Versionen wiederherstellen, Bibliothek und Stammdaten pflegen
- **Lese-Passwort:** alles ansehen und herunterladen (ohne WLAN-Passwörter), Packliste abhaken – sonst keine Änderungen

Die Anmeldung bleibt 30 Tage gültig und verlängert sich bei Benutzung. Werden die Passwörter geändert (Container mit neuen Werten neu starten), sind alle bestehenden Anmeldungen beendet. Nach 10 Fehlversuchen innerhalb von 15 Minuten wird die IP-Adresse vorübergehend gesperrt.

## Daten

Alles liegt im Volume `/data`:

| Ordner/Datei | Inhalt |
|---|---|
| `projects/` | Projekte als `.steckplan`-Dateien (JSON) |
| `versions/` | automatische Versionen (die letzten 30 pro Projekt) |
| `trash/` | gelöschte Projekte (30 Tage wiederherstellbar) |
| `label-qr.json` | QR-Code auf den Geräte-Etiketten: Einstellungen und Lese-Schlüssel je Projekt (ein Schlüssel öffnet ohne Passwort die Leseansicht genau eines Projekts – in den Einstellungen erneuern oder sperren) |
| `media/` | Audiodateien der Regie je Projekt, unverändert und ohne Größengrenze (`media/<Projekt>/`); nicht mehr verwendete Dateien 30 Tage in `.papierkorb/`, unfertige Uploads in `.uploads/`. Kann groß werden – bei Datensicherungen mit einplanen |
| `library.json` | Bibliothek: Vorlagen (Geräte, Kabeltypen, Bühnenelemente, Traversen, Stative) und Stammdaten (Kategorien, Besitzer, Anhänger, Cases) |
| `changelog/` | Änderungsprotokoll je Projekt (nicht in der Projektdatei) |
| `desktop-keys.json` | Desktop-Zugangsschlüssel (nur Prüfsummen, keine Schlüssel im Klartext) |
| `usage.json` | welche Projekte welche Vorlagen verwenden (für „Löschen nur, wenn unbenutzt“; wird beim Start neu aufgebaut) |
| `sessions.json` | Anmeldungen (nur Prüfsummen, keine Passwörter) |

## Image-Tags

| Tag | Inhalt |
|---|---|
| `latest` | neueste stabile Version |
| `X.Y.Z` | eine bestimmte Version, z. B. `1.0.0` |
| `develop` | aktueller Entwicklungsstand (zum Testen, nicht für den Einsatz) |

Die Images gibt es für `amd64` und `arm64` (z. B. Raspberry Pi 4/5, Apple Silicon).

## Aktualisieren

Die App selbst zeigt im Docker-Betrieb keinen Update-Hinweis. Aktualisiert wird über das Image:

```bash
docker compose pull && docker compose up -d
# mit HTTPS:
docker compose -f docker-compose.https.yml pull && docker compose -f docker-compose.https.yml up -d
# oder ohne Compose:
docker pull ghcr.io/rde-master/steckplan:latest
docker stop steckplan && docker rm steckplan
# … dann den docker-run-Befehl von oben erneut ausführen
```

Die Daten im Volume bleiben dabei erhalten. Vorher eine Sicherung des Volumes anzulegen schadet nie.

## Zugriff von außen

Für Zugriff außerhalb des eigenen Netzes den Container **nur hinter einem Reverse-Proxy mit HTTPS** betreiben, damit Passwörter nicht unverschlüsselt übertragen werden – am einfachsten mit [`docker-compose.https.yml`](../apps/docker/docker-compose.https.yml) (Caddy). Andere Proxys (Traefik, nginx) gehen genauso; wichtig sind die Weiterleitung von WebSockets (für die Live-Verbindung) und `STECKPLAN_TRUST_PROXY=true`.

## Desktop-App mit dem Server verbinden

Unter **Einstellungen** (nur mit Bearbeiten-Zugang) einen Desktop-Zugangsschlüssel erzeugen und in der Desktop-App unter „Mit Server verbinden …“ zusammen mit der Adresse des Servers eintragen.
