// Seitenleisten des Bühnenplans: Nicht platziert, Ebenen, Hintergrund.
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Lock, LockOpen, Plus, Ruler, X } from 'lucide-react';
import { ICON } from '../icons';
import { useRef, useState } from 'react';
import type * as Y from 'yjs';
import { addLayer, backgroundScale, isMulticore, moveLayer, removeLayer, setBackground, updateLayer, type Background, type Cable, type DeviceInstance, type Layer, type Library, type Person } from '@steckplan/core';
import { DeviceList } from '../DeviceList';
import { imageToBackground, isPdf, loadPdf, type LoadedPdf } from '../../lib/background';
import { useEditor } from '../../lib/editor';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button, Field, TextInput } from '../ui';

const s = texts.stageplan;

/** Geräte, die im Signalfluss sind, aber noch nicht im Bühnenplan */
export function UnplacedPanel({ devices, cables = [], people = [], library, editable, onPlace }: { devices: DeviceInstance[]; cables?: Cable[]; people?: Person[]; library: Library | null; editable: boolean; onPlace: (id: string) => void }) {
  return (
    <DeviceList
      devices={devices}
      cables={cables}
      people={people}
      library={library}
      testId="unplaced"
      include={(d, t) => !d.stagePlan && (t?.kind !== 'cableType' || isMulticore(t))}
      hint={s.unplacedHint}
      empty={<p className="flex items-center gap-1 px-1 text-sm text-emerald-700 dark:text-emerald-400"><Check {...ICON} /> {s.allPlaced}</p>}
      {...(editable ? { dragType: 'application/x-steckplan-device', action: { label: () => s.place, icon: <Plus {...ICON} />, onClick: onPlace } } : {})}
    />
  );
}

/** Alles, was im Bühnenplan steht – Klick wählt aus und holt es ins Bild */
export function PlacedPanel({ devices, cables = [], people = [], layers, library, selected, onOpen }: { devices: DeviceInstance[]; cables?: Cable[]; people?: Person[]; layers: Layer[]; library: Library | null; selected: Set<string>; onOpen: (id: string) => void }) {
  const layerName = new Map(layers.map((l) => [l.id, l.name]));
  return (
    <DeviceList
      devices={devices}
      cables={cables}
      people={people}
      library={library}
      testId="placed"
      include={(d) => !!d.stagePlan}
      hint={s.placedHint}
      empty={<p className="px-1 text-sm text-slate-500">{s.placedEmpty}</p>}
      detail={(d) => (layers.length > 1 ? `${s.layerLabel}: ${layerName.get(d.layerId) ?? '–'}` : undefined)}
      selected={selected}
      onOpen={onOpen}
    />
  );
}

export function LayersPanel({ doc, origin, data, editable }: { doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const active = useEditor((st) => st.activeLayerId);
  const setActive = useEditor((st) => st.setActiveLayer);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activeId = active ?? data.layers[0]?.id;
  return (
    <div className="h-full space-y-2 overflow-y-auto p-2">
      <p className="px-1 text-xs text-slate-500">{s.layersHint}</p>
      {/* oben in der Liste = oben im Plan */}
      <ul className="space-y-1" data-testid="layers">
        {[...data.layers].sort((a, b) => b.order - a.order).map((layer, index, sorted) => {
          const count = data.devices.filter((d) => d.layerId === layer.id && d.stagePlan).length + data.shapes.filter((x) => x.layerId === layer.id).length;
          return (
            <li key={layer.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${activeId === layer.id ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
              <input type="radio" name="active-layer" aria-label={`${s.activeLayer}: ${layer.name}`} checked={activeId === layer.id} onChange={() => setActive(layer.id)} />
              <TextInput
                aria-label={`${s.layerName}: ${layer.name}`}
                value={layer.name}
                disabled={!editable}
                onChange={(e) => updateLayer(doc, layer.id, { name: e.target.value }, origin)}
                className="min-w-0 flex-1 border-transparent bg-transparent px-1 py-0.5 text-sm shadow-none"
              />
              <span className="text-xs text-slate-400">{count}</span>
              {editable && (
                <>
                  <button type="button" className="rounded px-0.5 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700" aria-label={`${s.layerUp}: ${layer.name}`} disabled={index === 0} onClick={() => moveLayer(doc, layer.id, 1, origin)}>
                    <ArrowUp {...ICON} />
                  </button>
                  <button type="button" className="rounded px-0.5 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700" aria-label={`${s.layerDown}: ${layer.name}`} disabled={index === sorted.length - 1} onClick={() => moveLayer(doc, layer.id, -1, origin)}>
                    <ArrowDown {...ICON} />
                  </button>
                </>
              )}
              <button type="button" className="rounded px-1 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`${layer.visible ? s.hide : s.show}: ${layer.name}`} aria-pressed={!layer.visible} onClick={() => updateLayer(doc, layer.id, { visible: !layer.visible }, origin)}>
                {layer.visible ? <Eye {...ICON} /> : <EyeOff {...ICON} />}
              </button>
              <button type="button" className="rounded px-1 hover:bg-slate-200 dark:hover:bg-slate-700" disabled={!editable} aria-label={`${layer.locked ? s.unlock : s.lock}: ${layer.name}`} aria-pressed={layer.locked} onClick={() => updateLayer(doc, layer.id, { locked: !layer.locked }, origin)}>
                {layer.locked ? <Lock {...ICON} /> : <LockOpen {...ICON} />}
              </button>
              {editable && (
                <button
                  type="button"
                  className="rounded px-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  aria-label={`${texts.common.delete}: ${layer.name}`}
                  onClick={() => {
                    setError(removeLayer(doc, data, layer.id, origin) ? null : s.layerNotEmpty(layer.name));
                  }}
                >
                  <X {...ICON} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <Banner tone="warn">{error}</Banner>}
      {editable && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setActive(addLayer(doc, name.trim(), origin).id);
            setName('');
          }}
        >
          <TextInput value={name} placeholder={s.newLayer} aria-label={s.newLayer} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>
            <Plus {...ICON} />
          </Button>
        </form>
      )}
    </div>
  );
}

export function BackgroundPanel({ doc, origin, background, editable }: { doc: Y.Doc; origin: object; background: Background | undefined; editable: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<{ file: File; loaded: LoadedPdf; page: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moveBackground = useEditor((st) => st.moveBackground);
  const setMoveBackground = useEditor((st) => st.setMoveBackground);
  const setTool = useEditor((st) => st.setTool);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function apply(result: Pick<Background, 'image' | 'widthPx' | 'heightPx'>) {
    setBackground(doc, { ...result, offset: { x: 0, y: 0 }, opacity: 0.5 }, origin);
  }

  async function choose(file: File) {
    setError(null);
    setBusy(true);
    try {
      if (isPdf(file)) {
        const loaded = await loadPdf(file);
        if (loaded.pages === 1) await apply(await loaded.render(1));
        else setPdf({ file, loaded, page: 1 });
      } else {
        await apply(await imageToBackground(file));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const scale = background ? backgroundScale(background) : null;
  return (
    <div className="h-full space-y-3 overflow-y-auto p-2 text-sm">
      <p className="px-1 text-xs text-slate-500">{s.backgroundHint}</p>
      {editable && (
        <>
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? texts.common.loading : background ? s.replaceBackground : s.importBackground}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,application/pdf,.pdf"
            className="hidden"
            data-testid="background-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void choose(file);
            }}
          />
        </>
      )}
      {pdf && (
        <div className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
          <Field label={s.pdfPage(pdf.loaded.pages)}>
            <TextInput type="number" min={1} max={pdf.loaded.pages} value={pdf.page} onChange={(e) => setPdf({ ...pdf, page: Math.min(pdf.loaded.pages, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apply(await pdf.loaded.render(pdf.page));
                setPdf(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {s.usePage}
          </Button>
        </div>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {background && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500" data-testid="background-scale">
            {background.calibration ? s.calibrated(scale!) : s.notCalibrated}
          </div>
          <label className="block">
            <span className="text-xs text-slate-600 dark:text-slate-300">{s.opacity}</span>
            <input type="range" min={0.1} max={1} step={0.05} className="w-full" disabled={!editable} value={background.opacity ?? 0.5} onChange={(e) => setBackground(doc, { ...background, opacity: Number(e.target.value) }, origin)} aria-label={s.opacity} />
          </label>
          {editable && (
            <>
              <Button className="w-full" onClick={() => setTool('calibrate')}>
                <Ruler {...ICON} /> {s.calibrate}
              </Button>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={moveBackground} onChange={(e) => setMoveBackground(e.target.checked)} />
                {s.moveBackground}
              </label>
              {confirmRemove ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={() => {
                      setBackground(doc, undefined, origin);
                      setConfirmRemove(false);
                    }}
                  >
                    {s.removeBackground}
                  </Button>
                  <Button onClick={() => setConfirmRemove(false)}>{texts.common.cancel}</Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
                  {s.removeBackground}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
