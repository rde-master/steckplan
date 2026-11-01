# Mitmachen bei Steckplan

Danke für dein Interesse! Grundlage der Entwicklung ist [PLAN.md](PLAN.md).

## Branches

- `main` – stabil, nur Releases (Tag `vX.Y.Z`)
- `develop` – laufende Entwicklung
- Feature-Branches von `develop`, z. B. `feature/m1-server-sync`; Pull Requests gehen nach `develop`

## Commits

[Conventional Commits](https://www.conventionalcommits.org/de/) mit deutscher Beschreibung, z. B.:

```
feat(core): Kabellänge mit Höhenregel berechnen
fix(server): Lese-Zugang darf keine Häkchen zurücksetzen
chore(release): 0.2.0
```

Kleine, in sich abgeschlossene Commits. Vor jedem Commit müssen Lint, Typecheck und die betroffenen Tests grün sein.

## Regeln

- **Keine Inhalte aus proprietären Tools** übernehmen (Code, Grafiken, Bibliotheksdaten) – insbesondere nicht aus CablePlanner.
- Alle Abhängigkeiten müssen GPL-3-kompatibel sein (MIT, BSD, Apache-2.0, LGPL).
- Keine Passwörter, Schlüssel, `.env`-Dateien oder echten Projektdaten committen.
- Fachlogik gehört nach `packages/core` und wird mit Tests abgedeckt.
- Jede Änderung am Datenmodell: `schemaVersion` erhöhen + Migration + Test.
- Benutzeroberfläche nur auf Deutsch; Texte zentral ablegen.

## Fehler melden / Ideen

Bitte die Issue-Vorlagen verwenden.
