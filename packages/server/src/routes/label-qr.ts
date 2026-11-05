// QR-Code auf den Geräte-Etiketten (Einstellungen, Lese-Schlüssel je Projekt) und der Kurzlink, den er öffnet.
//   GET  /api/settings/label-qr                 Einstellungen (alle Angemeldeten)
//   PUT  /api/settings/label-qr                 ändern (Bearbeiten-Zugang)
//   GET  /api/settings/label-qr/links           alle Schlüssel mit Projektname (Bearbeiten-Zugang)
//   PUT  /api/settings/label-qr/links           { key, action: 'renew' | 'revoke' }
//   GET  /api/projects/:id/share                Schlüssel des Projekts (falls vorhanden)
//   POST /api/projects/:id/share                anlegen bzw. { renew: true } erneuern (Bearbeiten-Zugang)
//   DELETE /api/projects/:id/share              sperren (Bearbeiten-Zugang)
//   GET  /s/:token?g=<Gerät>                    öffnet ohne Passwort die Leseansicht dieses Projekts
import { basename } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LABEL_HINT_MAX, normalizeBaseUrl, type LabelQrStore, type ShareLink } from '../auth/label-qr';
import { requireSession, setSessionCookie } from '../auth/plugin';
import type { SessionStore } from '../auth/sessions';
import type { ProjectStore } from '../storage/types';

const SAFE_ID = /^[A-Za-z0-9 _.:-]{1,64}$/;
/** Name der Sitzung, die per QR-Code entsteht (erscheint bei „Verbunden“) */
export const QR_SESSION_NAME = 'Gast (QR-Code)';

function gone(reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .type('text/html; charset=utf-8')
    .send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Steckplan</title><p style="font-family:sans-serif;padding:2rem">Dieser QR-Code ist nicht (mehr) gültig oder das Projekt ist gerade nicht geöffnet.</p>');
}

export function registerLabelQrRoutes(
  app: FastifyInstance,
  deps: {
    store: ProjectStore;
    labelQr: LabelQrStore;
    sessions: SessionStore;
    /** Verbindungen beenden (z. B. nach Erneuern/Sperren eines Schlüssels) */
    disconnect: (sessionId: string, reason: string) => void;
    /** dauerhafte Kennung → aktuelle Projekt-id (Desktop: nur geöffnete Dateien) */
    resolve: (key: string) => Promise<string | undefined>;
  },
): void {
  const { labelQr, store, sessions } = deps;

  const endSessions = (key: string, reason: string) => {
    for (const s of sessions.deleteWhere((x) => x.scope?.key === key)) deps.disconnect(s.id, reason);
  };

  app.get('/api/settings/label-qr', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    return labelQr.settings;
  });

  app.put<{ Body: { enabled?: unknown; baseUrl?: unknown; hint?: unknown } }>('/api/settings/label-qr', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    const body = request.body ?? {};
    const patch: Parameters<LabelQrStore['updateSettings']>[0] = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') return reply.code(400).send({ error: 'Ungültige Angabe „an/aus“.' });
      patch.enabled = body.enabled;
    }
    if (body.baseUrl !== undefined) {
      const url = normalizeBaseUrl(body.baseUrl);
      if (url === null) return reply.code(400).send({ error: 'Bitte eine Adresse wie https://steckplan.example.de eingeben (oder leer lassen).' });
      patch.baseUrl = url;
    }
    if (body.hint !== undefined) {
      if (typeof body.hint !== 'string' || body.hint.trim().length > LABEL_HINT_MAX) return reply.code(400).send({ error: `Hinweis höchstens ${LABEL_HINT_MAX} Zeichen.` });
      patch.hint = body.hint.trim();
    }
    return labelQr.updateSettings(patch);
  });

  app.get('/api/settings/label-qr/links', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    const projects = await store.list();
    return {
      links: labelQr.links().map((l) => {
        const byKey = projects.find((p) => store.persistentKey(p.id) === l.key);
        return { key: l.key, name: byKey?.name ?? basename(l.key).replace(/\.steckplan$/i, ''), createdAt: l.createdAt, createdBy: l.createdBy };
      }),
    };
  });

  app.put<{ Body: { key?: unknown; action?: unknown } }>('/api/settings/label-qr/links', async (request, reply) => {
    const session = requireSession(request, reply, 'manageProjects');
    if (!session) return reply;
    const key = typeof request.body?.key === 'string' ? request.body.key : '';
    if (!labelQr.link(key)) return reply.code(404).send({ error: 'Schlüssel nicht gefunden.' });
    if (request.body?.action === 'revoke') {
      await labelQr.revoke(key);
      endSessions(key, 'Der QR-Code wurde gesperrt.');
      return { ok: true };
    }
    if (request.body?.action === 'renew') {
      await labelQr.ensure(key, session.name, true);
      endSessions(key, 'Der QR-Code wurde erneuert.');
      return { ok: true };
    }
    return reply.code(400).send({ error: 'Unbekannte Aktion.' });
  });

  const keyOf = async (id: string): Promise<string | undefined> => {
    try {
      await store.load(id);
      return store.persistentKey(id);
    } catch {
      return undefined;
    }
  };
  const tokenInfo = (link: ShareLink) => ({ token: link.token, createdAt: link.createdAt });

  app.get<{ Params: { id: string } }>('/api/projects/:id/share', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const key = await keyOf(request.params.id);
    const link = key ? labelQr.link(key) : undefined;
    if (!link) return reply.code(404).send({ error: 'Kein QR-Schlüssel für dieses Projekt.' });
    return tokenInfo(link);
  });

  app.post<{ Params: { id: string }; Body: { renew?: unknown } }>('/api/projects/:id/share', async (request, reply) => {
    const session = requireSession(request, reply, 'manageProjects');
    if (!session) return reply;
    const key = await keyOf(request.params.id);
    if (!key) return reply.code(404).send({ error: 'Projekt nicht gefunden' });
    const renew = request.body?.renew === true;
    const { link } = await labelQr.ensure(key, session.name, renew);
    if (renew) endSessions(key, 'Der QR-Code wurde erneuert.');
    return tokenInfo(link);
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id/share', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    const key = await keyOf(request.params.id);
    if (!key || !(await labelQr.revoke(key))) return reply.code(404).send({ error: 'Kein QR-Schlüssel für dieses Projekt.' });
    endSessions(key, 'Der QR-Code wurde gesperrt.');
    return { ok: true };
  });

  app.get<{ Params: { token: string }; Querystring: { g?: string } }>('/s/:token', async (request, reply) => {
    const link = labelQr.settings.enabled ? labelQr.byToken(request.params.token) : undefined;
    if (!link) return gone(reply);
    const projectId = await deps.resolve(link.key);
    if (!projectId) return gone(reply);
    // Wer schon angemeldet ist (ohne Beschränkung oder mit diesem Schlüssel), bleibt es;
    // sonst neue Sitzung: nur lesen, nur dieses Projekt
    const current = request.session;
    if (!current || (current.scope && current.scope.key !== link.key)) {
      const { token } = sessions.create(QR_SESSION_NAME, 'read', 'browser', { scope: { projectId, key: link.key } });
      setSessionCookie(reply, token, request.protocol === 'https');
    }
    const device = typeof request.query.g === 'string' && SAFE_ID.test(request.query.g) ? `&geraet=${encodeURIComponent(request.query.g)}` : '';
    return reply.redirect(`/projekt/${encodeURIComponent(projectId)}?ansicht=signalfluss${device}`, 302);
  });
}
