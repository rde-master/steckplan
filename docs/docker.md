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

Ohne die beiden Passwörter startet der Container nicht und meldet, was fehlt.

Alle Daten (Projekte, Bibliothek, Stammdaten, Versionen) liegen im Volume `/data`.

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
