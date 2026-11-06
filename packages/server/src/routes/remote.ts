// Fernsteuerung der Vorstellung
//   GET  /api/settings/osc     OSC-Einstellungen und Zustand (alle Angemeldeten)
//   PUT  /api/settings/osc     { enabled?, port? } (Bearbeiten-Zugang)
//   POST /api/remote           { action, value?, projectId? } – derselbe Befehl wie per OSC (Regie bearbeiten)
import type { FastifyInstance } from 'fastify';
import { parseRemoteCommand, type RemoteCommand } from '@steckplan/core';
import { requireSession } from '../auth/plugin';
import { validPort, type OscListener, type OscSettingsStore } from '../osc/listener';

export function registerRemoteRoutes(
  app: FastifyInstance,
  deps: { settings: OscSettingsStore; listener: OscListener; remote: (command: RemoteCommand, projectId?: string) => number },
): void {
  app.get('/api/settings/osc', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    return { settings: deps.settings.settings, status: deps.listener.status };
  });

  app.put<{ Body: { enabled?: unknown; port?: unknown } }>('/api/settings/osc', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    const body = request.body ?? {};
    if (body.port !== undefined && !validPort(body.port)) return reply.code(400).send({ error: 'Port zwischen 1024 und 65535' });
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return reply.code(400).send({ error: 'enabled muss wahr oder falsch sein' });
    const settings = await deps.settings.update({ ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), ...(body.port !== undefined ? { port: body.port as number } : {}) });
    const status = await deps.listener.apply(settings);
    return { settings, status };
  });

  app.post<{ Body: { action?: unknown; value?: unknown; projectId?: unknown } }>('/api/remote', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    const command = parseRemoteCommand(request.body?.action, request.body?.value);
    if (!command) return reply.code(400).send({ error: 'Unbekannter Befehl' });
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : undefined;
    return { rooms: deps.remote(command, projectId) };
  });
}
