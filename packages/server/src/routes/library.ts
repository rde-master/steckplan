// REST-Schnittstelle für Bibliothek (Vorlagen) und Stammdaten.
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  analyze,
  applyAnalysis,
  createLibraryExport,
  isMasterKind,
  isTemplateKind,
  LibraryExportSchema,
  MASTER_ENTRY_SCHEMAS,
  MASTER_KIND_LABELS,
  missingResolutions,
  newId,
  TemplateSchema,
  type Conflict,
  type Library,
  type MasterEntry,
  type MasterKind,
  type Resolution,
  type Template,
} from '@steckplan/core';
import { requireSession } from '../auth/plugin';
import { LibraryError, type LibraryStore } from '../library/library-store';
import type { UsageTracker } from '../library/usage-tracker';

type ImportResult =
  | { status: 'conflicts'; conflicts: Conflict[]; additions: number }
  | { status: 'imported'; summary: { added: number; replaced: number; copied: number; kept: number } };

const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME = 120;
export const LIBRARY_IMPORT_LIMIT_BYTES = 20 * 1024 * 1024;

function send(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof LibraryError) return reply.code(error.status).send({ error: error.message, ...error.details });
  throw error;
}

function cleanName(input: unknown): string {
  const name = typeof input === 'string' ? input.trim() : '';
  if (!name || name.length > MAX_NAME) throw new LibraryError(400, `Bitte einen Namen (1–${MAX_NAME} Zeichen) eingeben.`);
  return name;
}

function checkColor(color: unknown): void {
  if (color !== undefined && color !== null && color !== '' && (typeof color !== 'string' || !COLOR.test(color))) {
    throw new LibraryError(400, 'Ungültige Farbe (erwartet #rrggbb).');
  }
}

/** Verweise einer Vorlage auf Stammdaten prüfen: müssen existieren; archivierte nur, wenn schon vorher gesetzt. */
function checkReferences(library: Library, template: Template, previous?: Template): void {
  const refs: [MasterKind, string | undefined, string | undefined][] = [
    ['categories', template.categoryId, previous?.categoryId],
    ['owners', template.defaultOwnerId, previous?.defaultOwnerId],
    ['trailers', template.defaultTrailerId, previous?.defaultTrailerId],
  ];
  for (const [kind, id, before] of refs) {
    if (!id) continue;
    const entry = (library.masterData[kind] as MasterEntry[]).find((e) => e.id === id);
    const label = MASTER_KIND_LABELS[kind].singular;
    if (!entry) throw new LibraryError(400, `${label} existiert nicht (mehr).`);
    if (entry.archived && id !== before) throw new LibraryError(400, `${label} „${entry.name}“ ist archiviert und kann nicht neu zugeordnet werden.`);
  }
}

/** Baut eine gültige Vorlage aus den Eingaben (leere Texte → weggelassen). */
function buildTemplate(input: Record<string, unknown>, base: Pick<Template, 'id' | 'kind' | 'version' | 'updatedAt' | 'updatedBy'>): Template {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (['id', 'kind', 'version', 'updatedAt', 'updatedBy'].includes(key)) continue;
    if (value === '' || value === null || value === undefined) continue;
    cleaned[key] = value;
  }
  cleaned.name = cleanName(input.name);
  checkColor(cleaned.defaultColor);
  const parsed = TemplateSchema.safeParse({ ...cleaned, ...base });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LibraryError(400, `Ungültige Vorlage (${issue?.path.join('.') || 'Vorlage'}: ${issue?.message ?? ''}).`);
  }
  const ports = parsed.data.ports ?? [];
  if (new Set(ports.map((p) => p.id)).size !== ports.length) throw new LibraryError(400, 'Anschlüsse brauchen eindeutige Kennungen.');
  return parsed.data;
}

export function registerLibraryRoutes(app: FastifyInstance, deps: { library: LibraryStore; usage: UsageTracker }): void {
  const { library, usage } = deps;

  app.get('/api/library', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    return library.get();
  });

  // ---------- Vorlagen ----------

  app.post<{ Body: { template?: Record<string, unknown> } }>('/api/library/templates', async (request, reply) => {
    const session = requireSession(request, reply, 'editProject');
    if (!session) return reply;
    try {
      const input = request.body?.template ?? {};
      if (!isTemplateKind(input.kind)) throw new LibraryError(400, 'Unbekannte Vorlagen-Art.');
      const kind = input.kind;
      const template = await library.mutate((lib) => {
        const created = buildTemplate(input, { id: newId(), kind, version: 1, updatedAt: new Date().toISOString(), updatedBy: session.name });
        checkReferences(lib, created);
        return { library: { ...lib, templates: [...lib.templates, created] }, result: created, templateIds: [created.id] };
      });
      return reply.code(201).send(template);
    } catch (error) {
      return send(reply, error);
    }
  });

  app.put<{ Params: { id: string }; Body: { template?: Record<string, unknown>; baseVersion?: number; force?: boolean } }>(
    '/api/library/templates/:id',
    async (request, reply) => {
      const session = requireSession(request, reply, 'editProject');
      if (!session) return reply;
      try {
        const template = await library.mutate((lib) => {
          const current = lib.templates.find((t) => t.id === request.params.id);
          if (!current) throw new LibraryError(404, 'Vorlage nicht gefunden.');
          if (!request.body?.force && request.body?.baseVersion !== current.version) {
            throw new LibraryError(409, `Die Vorlage wurde inzwischen von ${current.updatedBy ?? 'jemand anderem'} geändert.`, { current });
          }
          const updated = buildTemplate(request.body?.template ?? {}, {
            id: current.id,
            kind: current.kind,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
            updatedBy: session.name,
          });
          checkReferences(lib, updated, current);
          return {
            library: { ...lib, templates: lib.templates.map((t) => (t.id === current.id ? updated : t)) },
            result: updated,
            templateIds: [current.id],
          };
        });
        return template;
      } catch (error) {
        return send(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/library/templates/:id', async (request, reply) => {
    if (!requireSession(request, reply, 'editProject')) return reply;
    try {
      await library.mutate((lib) => {
        const current = lib.templates.find((t) => t.id === request.params.id);
        if (!current) throw new LibraryError(404, 'Vorlage nicht gefunden.');
        const projects = usage.find('template', current.id);
        if (projects.length) {
          throw new LibraryError(409, `„${current.name}“ wird noch verwendet und kann nicht gelöscht werden.`, { projects });
        }
        return { library: { ...lib, templates: lib.templates.filter((t) => t.id !== current.id) }, result: undefined, templateIds: [current.id] };
      });
      return { ok: true };
    } catch (error) {
      return send(reply, error);
    }
  });

  // ---------- Stammdaten ----------

  function buildEntry(kind: MasterKind, input: Record<string, unknown>, id: string, archived?: boolean): MasterEntry {
    checkColor(input.color);
    const raw: Record<string, unknown> = { id, name: cleanName(input.name) };
    if (typeof input.color === 'string' && input.color) raw.color = input.color.toLowerCase();
    if (kind === 'owners' && typeof input.contact === 'string' && input.contact.trim()) raw.contact = input.contact.trim();
    if (kind === 'trailers' && typeof input.notes === 'string' && input.notes.trim()) raw.notes = input.notes.trim();
    if (archived) raw.archived = true;
    return MASTER_ENTRY_SCHEMAS[kind].parse(raw);
  }

  function masterUsage(lib: Library, kind: MasterKind, id: string): string[] {
    const field = kind === 'categories' ? 'categoryId' : kind === 'owners' ? 'defaultOwnerId' : 'defaultTrailerId';
    const templates = lib.templates.filter((t) => t[field] === id).map((t) => `Vorlage „${t.name}“`);
    return [...templates, ...usage.find(kind, id).map((name) => `Projekt „${name}“`)];
  }

  app.post<{ Params: { kind: string }; Body: Record<string, unknown> }>('/api/library/master/:kind', async (request, reply) => {
    if (!requireSession(request, reply, 'editProject')) return reply;
    const kind = request.params.kind;
    if (!isMasterKind(kind)) return reply.code(404).send({ error: 'Unbekannte Stammdaten-Art.' });
    try {
      const entry = await library.mutate((lib) => {
        const created = buildEntry(kind, request.body ?? {}, newId());
        return {
          library: { ...lib, masterData: { ...lib.masterData, [kind]: [...lib.masterData[kind], created] } },
          result: created,
          masterKeys: [`${kind}:${created.id}`],
        };
      });
      return reply.code(201).send(entry);
    } catch (error) {
      return send(reply, error);
    }
  });

  app.put<{ Params: { kind: string; id: string }; Body: Record<string, unknown> }>('/api/library/master/:kind/:id', async (request, reply) => {
    if (!requireSession(request, reply, 'editProject')) return reply;
    const kind = request.params.kind;
    if (!isMasterKind(kind)) return reply.code(404).send({ error: 'Unbekannte Stammdaten-Art.' });
    try {
      return await library.mutate((lib) => {
        const list = lib.masterData[kind] as MasterEntry[];
        const current = list.find((e) => e.id === request.params.id);
        if (!current) throw new LibraryError(404, 'Eintrag nicht gefunden.');
        const body = request.body ?? {};
        const archived = typeof body.archived === 'boolean' ? body.archived : current.archived;
        const updated = buildEntry(kind, { ...current, ...body }, current.id, archived);
        return {
          library: { ...lib, masterData: { ...lib.masterData, [kind]: list.map((e) => (e.id === current.id ? updated : e)) } },
          result: updated,
          masterKeys: [`${kind}:${current.id}`],
        };
      });
    } catch (error) {
      return send(reply, error);
    }
  });

  app.delete<{ Params: { kind: string; id: string } }>('/api/library/master/:kind/:id', async (request, reply) => {
    if (!requireSession(request, reply, 'editProject')) return reply;
    const kind = request.params.kind;
    if (!isMasterKind(kind)) return reply.code(404).send({ error: 'Unbekannte Stammdaten-Art.' });
    try {
      await library.mutate((lib) => {
        const list = lib.masterData[kind] as MasterEntry[];
        const current = list.find((e) => e.id === request.params.id);
        if (!current) throw new LibraryError(404, 'Eintrag nicht gefunden.');
        const usedBy = masterUsage(lib, kind, current.id);
        if (usedBy.length) {
          throw new LibraryError(409, `„${current.name}“ wird noch verwendet und kann nicht gelöscht werden – stattdessen archivieren?`, { usedBy });
        }
        return {
          library: { ...lib, masterData: { ...lib.masterData, [kind]: list.filter((e) => e.id !== current.id) } },
          result: undefined,
          masterKeys: [`${kind}:${current.id}`],
        };
      });
      return { ok: true };
    } catch (error) {
      return send(reply, error);
    }
  });

  // ---------- Import / Export ----------

  app.get('/api/library/export', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="steckplan-bibliothek-${date}.json"`)
      .send(JSON.stringify(createLibraryExport(library.get()), null, 2) + '\n');
  });

  app.post<{ Body: { data?: unknown; resolutions?: Record<string, Resolution> } }>(
    '/api/library/import',
    { bodyLimit: LIBRARY_IMPORT_LIMIT_BYTES },
    async (request, reply) => {
      const session = requireSession(request, reply, 'editProject');
      if (!session) return reply;
      const parsed = LibraryExportSchema.safeParse(request.body?.data);
      if (!parsed.success) return reply.code(400).send({ error: 'Die Datei ist keine Steckplan-Bibliothek.' });
      const resolutions = request.body?.resolutions;
      return library.mutate<ImportResult>((lib) => {
        const analysis = analyze(parsed.data, lib, { sameLibrary: false });
        if (analysis.conflicts.length && (!resolutions || missingResolutions(analysis, resolutions).length)) {
          return {
            library: lib,
            result: {
              status: 'conflicts' as const,
              conflicts: analysis.conflicts,
              additions: analysis.additions.templates.length + Object.values(analysis.additions.masterData).flat().length,
            },
          };
        }
        const applied = applyAnalysis(lib, analysis, resolutions ?? {}, { by: session.name });
        return {
          library: applied.library,
          result: { status: 'imported' as const, summary: applied.summary },
          templateIds: parsed.data.templates.map((t) => t.id),
          masterKeys: [],
        };
      });
    },
  );
}
