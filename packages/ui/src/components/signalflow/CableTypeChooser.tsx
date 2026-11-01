// Auswahl des Kabeltyps, wenn nicht eindeutig ein Kabeltyp passt.
import { rankCableTypes, type EffectivePort, type Library, type Template } from '@steckplan/core';
import { getDesktop } from '../../lib/desktop';
import { texts } from '../../texts';
import { Button, Modal } from '../ui';

const s = texts.signalflow;

export type CableChoice = { kind: 'type'; template: Template } | { kind: 'direct' } | { kind: 'none' };

export function CableTypeChooser({
  library,
  from,
  to,
  suggestDirect,
  onChoose,
  onCancel,
}: {
  library: Library;
  from: EffectivePort;
  to: EffectivePort;
  suggestDirect: boolean;
  onChoose: (choice: CableChoice) => void;
  onCancel: () => void;
}) {
  const ranked = rankCableTypes(library, from, to);
  const direct = (
    <li>
      <button type="button" onClick={() => onChoose({ kind: 'direct' })} className="w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700">
        <div className="font-medium">{s.direct}</div>
        <div className="text-xs text-slate-500">{s.directHint}</div>
      </button>
    </li>
  );
  return (
    <Modal title={s.chooseCableType} onClose={onCancel}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        {from.label} ({from.connector || '–'}) → {to.label} ({to.connector || '–'})
      </p>
      <ul className="space-y-1.5 text-sm">
        {suggestDirect && direct}
        {ranked.map(({ template, match, signalMatch }) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onChoose({ kind: 'type', template })}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{template.name}</span>
                <span className="block text-xs text-slate-500">
                  {template.connectorA || '–'} / {template.connectorB || '–'}
                  {template.signal ? ` · ${template.signal}` : ''}
                </span>
              </span>
              {match === 'match' && signalMatch && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">{s.fits}</span>}
              {match === 'mismatch' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900">{s.connectorMismatch}</span>}
            </button>
          </li>
        ))}
        {!suggestDirect && direct}
        <li>
          <button type="button" onClick={() => onChoose({ kind: 'none' })} className="w-full rounded-md px-3 py-2 text-left text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            {s.noType}
          </button>
        </li>
      </ul>
      {ranked.length === 0 && (
        <div className="mt-3 text-sm text-slate-500">
          {s.noCableTypes}{' '}
          {getDesktop() ? (
            <Button variant="ghost" onClick={() => void getDesktop()?.openLibrary()}>
              {s.openLibrary}
            </Button>
          ) : (
            <a className="text-sky-700 underline" href="/bibliothek?bereich=cableType" target="_blank" rel="noreferrer">
              {s.openLibrary}
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
