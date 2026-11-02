import { Copy, Download, Plus, Upload } from 'lucide-react';
import { ICON } from '../components/icons';
import { useRef, useState } from 'react';
import { can, TEMPLATE_KIND_LABELS, TEMPLATE_KINDS, type Conflict, type Template, type TemplateKind } from '@steckplan/core';
import { api, errorMessage } from '../lib/api';
import { useLibrary } from '../lib/library';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { AppHeader, MainNav } from '../components/AppHeader';
import { ConflictDialog } from '../components/ConflictDialog';
import { MasterDataPanel } from '../components/library/MasterDataPanel';
import { copyDraft, newDraft, TemplateEditor, type Draft } from '../components/library/TemplateEditor';
import { Banner, Button, Spinner, TextInput } from '../components/ui';

type Section = TemplateKind | 'master';

function isSection(value: string): value is Section {
  return value === 'master' || (TEMPLATE_KINDS as readonly string[]).includes(value);
}

export function LibraryPage({ section: rawSection }: { section: string }) {
  const section: Section = isSection(rawSection) ? rawSection : 'device';
  const library = useLibrary((s) => s.library);
  const loadError = useLibrary((s) => s.error);
  const session = useSession((s) => s.session);
  const canEdit = session ? can(session.access, 'editProject') : false;
  const [selected, setSelected] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importState, setImportState] = useState<{ data: unknown; conflicts: Conflict[]; additions: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function select(draft: Draft | null) {
    setSelected(draft);
    setEditorKey((k) => k + 1);
    setMessage(null);
  }

  function go(next: Section) {
    select(null);
    navigate(`/bibliothek?bereich=${next}`, { replace: true });
  }

  async function runImport(data: unknown, resolutions?: Parameters<typeof api.importLibrary>[1]) {
    const result = await api.importLibrary(data, resolutions);
    if (result.status === 'conflicts') {
      setImportState({ data, conflicts: result.conflicts, additions: result.additions });
      return;
    }
    setImportState(null);
    const s = result.summary;
    setMessage(s.added + s.replaced + s.copied > 0 ? texts.library.importDone(s) : texts.library.importNothing);
  }

  const templates = (library?.templates ?? [])
    .filter((t) => section !== 'master' && t.kind === section)
    .filter((t) => !query || `${t.name} ${t.manufacturer ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // Liste nach Kategorien („ohne Kategorie“ am Ende), leere Gruppen ausgeblendet
  const categories = [...(library?.masterData.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const groups = [
    ...categories.map((c) => ({ key: c.id, label: c.name, color: c.color, items: templates.filter((t) => t.categoryId === c.id) })),
    { key: '', label: texts.library.noCategoryGroup, color: undefined, items: templates.filter((t) => !t.categoryId || !categories.some((c) => c.id === t.categoryId)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title={texts.library.title} nav={<MainNav active="library" />} />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900" role="tablist">
        {TEMPLATE_KINDS.map((kind) => (
          <Button key={kind} role="tab" aria-selected={section === kind} variant={section === kind ? 'primary' : 'ghost'} onClick={() => go(kind)}>
            {TEMPLATE_KIND_LABELS[kind].plural}
          </Button>
        ))}
        <Button role="tab" aria-selected={section === 'master'} variant={section === 'master' ? 'primary' : 'ghost'} onClick={() => go('master')}>
          {texts.library.masterData}
        </Button>
        <div className="flex-1" />
        <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700" href={api.exportLibraryUrl}>
          <Download {...ICON} /> {texts.library.export}
        </a>
        {canEdit && (
          <>
            <Button variant="ghost" onClick={() => fileInput.current?.click()}>
              <Upload {...ICON} /> {texts.library.import}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setError(null);
                setMessage(null);
                try {
                  await runImport(JSON.parse(await file.text()));
                } catch (err) {
                  setError(err instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : errorMessage(err));
                }
              }}
            />
          </>
        )}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-3 p-4">
        {(error || loadError) && <Banner tone="error">{error ?? loadError}</Banner>}
        {message && <Banner tone="success">{message}</Banner>}
        {!library ? (
          <Spinner />
        ) : section === 'master' ? (
          <MasterDataPanel library={library} canEdit={canEdit} />
        ) : (
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <aside className="space-y-2">
              {canEdit && (
                <Button variant="primary" className="w-full" onClick={() => select(newDraft(section))}>
                  <Plus {...ICON} /> {texts.library.new(TEMPLATE_KIND_LABELS[section].singular)}
                </Button>
              )}
              <TextInput type="search" placeholder={texts.library.search} aria-label={texts.library.search} value={query} onChange={(e) => setQuery(e.target.value)} />
              {templates.length === 0 ? (
                <p className="px-1 py-4 text-sm text-slate-500">{texts.library.empty}</p>
              ) : (
                <div className="space-y-2" data-testid="library-list">
                  {groups.map((group) => (
                    <details key={group.key || 'none'} open className="group" data-testid={`library-category-${group.key || 'none'}`}>
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <span className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
                        {group.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: group.color }} />}
                        {group.label}
                        <span className="font-normal">({group.items.length})</span>
                      </summary>
                      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                    {group.items.map((template) => (
                    <li key={template.id} className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => select(template)}
                        className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${selected?.id === template.id ? 'bg-sky-50 dark:bg-sky-950' : ''}`}
                      >
                        <span className="h-4 w-4 shrink-0 rounded border border-slate-300 dark:border-slate-600" style={{ backgroundColor: template.defaultColor ?? 'transparent' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{template.name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[
                              template.channels ? texts.library.multicore.summary(template.channels.length) : undefined,
                              template.manufacturer,
                            ]
                              .filter(Boolean)
                              .join(' · ') || ' '}
                          </span>
                        </span>
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          title={texts.library.copy}
                          aria-label={`${texts.library.copy}: ${template.name}`}
                          onClick={() => select(copyDraft(template))}
                          className="shrink-0 px-3 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        >
                          <Copy {...ICON} />
                        </button>
                      )}
                    </li>
                  ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </aside>
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              {selected ? (
                <TemplateEditor
                  key={editorKey}
                  library={library}
                  draft={selected}
                  canEdit={canEdit}
                  onSaved={(saved: Template) => {
                    setSelected(saved);
                    setMessage(texts.library.saved);
                  }}
                  onDeleted={() => {
                    select(null);
                    setMessage(texts.library.deleted);
                  }}
                  onCancel={() => select(selected.id ? (library.templates.find((t) => t.id === selected.id) ?? null) : null)}
                  onCopy={(draft) => {
                    select(draft);
                    setMessage(texts.library.copied);
                  }}
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">{texts.library.select}</p>
              )}
            </section>
          </div>
        )}
      </main>

      {importState && (
        <ConflictDialog
          conflicts={importState.conflicts}
          additions={importState.additions}
          library={library}
          onClose={() => setImportState(null)}
          onSubmit={(resolutions) => runImport(importState.data, resolutions)}
        />
      )}
    </div>
  );
}
