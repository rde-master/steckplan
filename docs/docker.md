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

Alternativ mit Docker Compose: [`apps/docker/docker-compose.yml`](../apps/docker/docker-compose.yml) herunterladen, Passwörter anpassen und `docker compose up -d` ausführen.

## Konfiguration

| Variable | Pflicht | Standard | Bedeutung |
|---|---|---|---|
| `STECKPLAN_EDIT_PASSWORD` | ja | – | Bearbeiten-Passwort (volle Bearbeitung) |
| `STECKPLAN_READ_PASSWORD` | ja | – | Lese-Passwort (ansehen, Packliste abhaken) – muss sich vom Bearbeiten-Passwort unterscheiden |
| `PORT` | nein | `8080` | Port im Container |
| `TZ` | nein | UTC | Zeitzone, z. B. `Europe/Berlin` |
| `STECKPLAN_TRUST_PROXY` | nein | `false` | `true` nur hinter einem Reverse-Proxy: dann werden `X-Forwarded-For`/`-Proto` ausgewertet (richtige IP für die Begrenzung von Fehlversuchen, sichere Cookies bei HTTPS) |

Ohne die beiden Passwörter startet der Container nicht und meldet, was fehlt.

## Anmelden

Im Browser gibt man **Name** und **Passwort** ein:

- **Bearbeiten-Passwort:** alles bearbeiten, Projekte anlegen, hochladen, löschen, Versionen wiederherstellen
- **Lese-Passwort:** alles ansehen und herunterladen (ohne WLAN-Passwörter), Packliste abhaken – sonst keine Änderungen

Die Anmeldung bleibt 30 Tage gültig und verlängert sich bei Benutzung. Werden die Passwörter geändert (Container mit neuen Werten neu starten), sind alle bestehenden Anmeldungen beendet. Nach 10 Fehlversuchen innerhalb von 15 Minuten wird die IP-Adresse vorübergehend gesperrt.

## Daten

Alles liegt im Volume `/data`:

| Ordner/Datei | Inhalt |
|---|---|
| `projects/` | Projekte als `.steckplan`-Dateien (JSON) |
| `versions/` | automatische Versionen (die letzten 30 pro Projekt) |
| `trash/` | gelöschte Projekte (30 Tage wiederherstellbar) |
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
# oder ohne Compose:
docker pull ghcr.io/rde-master/steckplan:latest
docker stop steckplan && docker rm steckplan
# … dann den docker-run-Befehl von oben erneut ausführen
```

Die Daten im Volume bleiben dabei erhalten. Vorher eine Sicherung des Volumes anzulegen schadet nie.

## Zugriff von außen

Für Zugriff außerhalb des eigenen Netzes den Container **nur hinter einem Reverse-Proxy mit HTTPS** betreiben (z. B. Caddy, Traefik, nginx), damit Passwörter nicht unverschlüsselt übertragen werden.
