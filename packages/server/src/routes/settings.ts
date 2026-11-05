// Server-Einstellungen (nur Docker, nur Bearbeiten-Zugang): Desktop-Zugangsschlüssel erzeugen und widerrufen.
import type { FastifyInstance } from 'fastify';
import { LABEL_MAX_LENGTH, type DesktopKeyStore, type KeyAccess } from '../auth/desktop-keys';
import { requireSession } from '../auth/plugin';

export function registerSettingsRoutes(app: FastifyInstance, deps: { desktopKeys: DesktopKeyStore; onRevoke: (keyId: string) => void }): void {
  const { desktopKeys } = deps;

  app.get('/api/settings/desktop-keys', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    return { keys: desktopKeys.list() };
  });

  app.post<{ Body: { label?: unknown; access?: unknown } }>('/api/settings/desktop-keys', async (request, reply) => {
    const session = requireSession(request, reply, 'manageProjects');
    if (!session) return reply;
    const label = typeof request.body?.label === 'string' ? request.body.label.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    if (!label || label.length > LABEL_MAX_LENGTH) return reply.code(400).send({ error: `Bitte eine Bezeichnung (1–${LABEL_MAX_LENGTH} Zeichen) eingeben, z. B. „MacBook Ralf“.` });
    const access = request.body?.access;
    if (access !== 'edit' && access !== 'read' && access !== 'direction') return reply.code(400).send({ error: 'Bitte die Zugangsstufe wählen (Bearbeiten, Regie oder Lesen).' });
    const created = await desktopKeys.create(label, access as KeyAccess, session.name);
    return reply.code(201).send(created);
  });

  app.delete<{ Params: { id: string } }>('/api/settings/desktop-keys/:id', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    const info = await desktopKeys.revoke(request.params.id);
    if (!info) return reply.code(404).send({ error: 'Schlüssel nicht gefunden.' });
    deps.onRevoke(info.id);
    return info;
  });

  app.delete<{ Params: { id: string } }>('/api/settings/desktop-keys/:id/entry', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!(await desktopKeys.remove(request.params.id))) return reply.code(409).send({ error: 'Nur widerrufene Schlüssel können entfernt werden.' });
    return { ok: true };
  });
}
