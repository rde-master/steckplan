// Einstellungen für das APC40: das Gerät als Bild (Clip-Matrix, Szenen, Spur-Tasten, Transport …). Jede Taste zeigt
// ihre Aktion und – wie am Gerät – ihre LED-Farbe. Klick auf eine Taste (oder Drücken am Gerät) wählt sie aus, unten
// wird die Aktion eingestellt. Belegung je Gerät gespeichert.
import { useState } from 'react';
import { apc40Control, clipId, CLIP_ROWS, COLUMNS, type LedState } from '../../lib/midi/apc40';
import { ACTION_VALUE, ledFor, MIDI_ACTIONS, resetMidiMapping, setMidiAction, useMidiMapping, type MidiAction, type MidiActionName, type PerformanceLedState } from '../../lib/midi/mapping';
import type { Apc40Status } from '../../lib/midi/useApc40';
import { texts } from '../../texts';
import { Button, Modal } from '../ui';

const t = texts.regie.midi;

/** Farbe der LED in der Grafik */
const LED_CLASS: Record<LedState, string> = {
  off: 'bg-slate-800 text-slate-400',
  green: 'bg-emerald-500 text-emerald-950',
  greenBlink: 'bg-emerald-500 text-emerald-950 animate-pulse',
  red: 'bg-red-500 text-red-950',
  redBlink: 'bg-red-500 text-red-950 animate-pulse',
  yellow: 'bg-amber-400 text-amber-950',
  yellowBlink: 'bg-amber-400 text-amber-950 animate-pulse',
  on: 'bg-orange-400 text-orange-950',
  blink: 'bg-orange-400 text-orange-950 animate-pulse',
};

/** kurze Beschriftung einer Aktion für die Taste */
export function actionShort(a: MidiAction | undefined): string {
  if (!a || a.action === 'none') return '';
  if (a.action === 'item') return `#${a.value ?? ''}`;
  if (a.action === 'back' || a.action === 'forward') return `${a.action === 'back' ? '−' : '+'}${String(a.value ?? '').replace('.', ',')}s`;
  return t.short[a.action];
}

export function Apc40Settings({ status, port, selected, onSelect, leds, ledState, onClose }: { status: Apc40Status; port: string | null; selected: string | null; onSelect: (id: string | null) => void; leds: Record<string, LedState>; ledState: PerformanceLedState; onClose: () => void }) {
  const mapping = useMidiMapping();
  const control = selected ? apc40Control(selected) : undefined;
  const action = selected ? mapping[selected] : undefined;
  const [confirmReset, setConfirmReset] = useState(false);

  // Taste im Bild (Renderfunktion, keine Komponente – die Belegung ändert sich laufend)
  const key = (id: string, round = false) => {
    const c = apc40Control(id)!;
    const a = mapping[id];
    const led = c.led === 'none' ? (a ? 'none' : 'off') : (leds[id] ?? 'off');
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        title={`${c.label}${a ? ` – ${t.actions[a.action]}${a.value !== undefined ? ` ${a.value}` : ''}` : ''}`}
        aria-label={c.label}
        aria-pressed={selected === id}
        className={`flex items-center justify-center overflow-hidden text-[10px] leading-tight font-semibold ${round ? 'h-10 w-10 rounded-full px-0.5 text-[9px]' : 'h-9 w-14 rounded px-0.5'} ${led === 'none' ? 'bg-slate-600 text-slate-100' : LED_CLASS[led as LedState]} ${selected === id ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900' : 'hover:ring-1 hover:ring-slate-400'}`}
        data-testid="apc-key"
        data-id={id}
        data-led={led}
      >
        {actionShort(a)}
      </button>
    );
  };
  const row = (label: string, prefix: string) => (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: COLUMNS }, (_, col) => key(`${prefix}:${col}`, true))}
      <span className="ml-1 w-16 text-[10px] text-slate-500">{label}</span>
    </div>
  );

  return (
    <Modal
      title={t.title}
      wide
      onClose={onClose}
      footer={
        <>
          {confirmReset ? (
            <Button
              variant="danger"
              onClick={() => {
                resetMidiMapping();
                setConfirmReset(false);
              }}
            >
              {t.resetConfirm}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              {t.reset}
            </Button>
          )}
          <Button onClick={onClose}>{t.close}</Button>
        </>
      }
    >
      <div className="space-y-3" data-testid="apc40-settings">
        <p className="text-sm" data-testid="apc40-status" data-status={status}>
          <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'notFound' || status === 'connecting' ? 'bg-amber-400' : 'bg-red-500'}`} aria-hidden />
          {t.status[status](port ?? '')}
        </p>
        <p className="text-xs text-slate-500">{t.hint}</p>

        {/* das Gerät */}
        <div className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-slate-200" data-testid="apc40-device">
          <div className="flex min-w-max gap-8">
            <div className="space-y-1.5">
              {Array.from({ length: CLIP_ROWS }, (_, row) => (
                <div key={row} className="flex items-center gap-1.5">
                  {Array.from({ length: COLUMNS }, (_, col) => key(clipId(col, row)))}
                  <span className="w-3" />
                  {key(`scene:${row}`, true)}
                </div>
              ))}
              <div className="flex items-center gap-1.5 pt-1">
                {Array.from({ length: COLUMNS }, (_, col) => key(`clipStop:${col}`, true))}
                <span className="w-3" />
                {key('stopAll', true)}
              </div>
              <div className="pt-2" />
              <div className="flex items-center gap-1.5">
                {Array.from({ length: COLUMNS }, (_, col) => key(`trackSelect:${col}`))}
                <span className="w-3" />
                {key('master')}
              </div>
              {row('Activator', 'activator')}
              {row('Solo/Cue', 'solo')}
              {row('Rec Arm', 'recArm')}
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[10px] text-slate-500">Pan · Send A · B · C</div>
                <div className="flex gap-1.5">
                  {['pan', 'sendA', 'sendB', 'sendC'].map((id) => key(id))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-slate-500">Device</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }, (_, n) => key(`device:${n}`))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-slate-500">Play · Stop · Rec</div>
                <div className="flex gap-1.5">
                  {key('play')}
                  {key('stop')}
                  {key('record')}
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div>
                  <div className="mb-1 text-[10px] text-slate-500">Bank</div>
                  <div className="grid grid-cols-3 gap-1">
                    <span />
                    {key('bankUp')}
                    <span />
                    {key('bankLeft')}
                    <span />
                    {key('bankRight')}
                    <span />
                    {key('bankDown')}
                    <span />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="mb-1 text-[10px] text-slate-500">Shift · Tap · Nudge − / +</div>
                  <div className="flex gap-1.5">
                    {key('shift')}
                    {key('tap')}
                  </div>
                  <div className="flex gap-1.5">
                    {key('nudgeMinus')}
                    {key('nudgePlus')}
                  </div>
                </div>
              </div>
              <p className="max-w-56 text-[10px] text-slate-500">{t.cueLevel}</p>
            </div>
          </div>
        </div>

        {/* Belegung der gewählten Taste */}
        {control ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700" data-testid="apc40-editor">
            <div className="text-sm">
              <div className="text-xs text-slate-500">{t.key}</div>
              <div className="font-semibold" data-testid="apc40-selected">
                {control.label}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t.action}
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={action?.action ?? 'none'}
                onChange={(e) => {
                  const name = e.target.value as MidiActionName;
                  const spec = ACTION_VALUE[name];
                  setMidiAction(control.id, { action: name, ...(spec ? { value: action?.action === name && action.value !== undefined ? action.value : spec.default } : {}) });
                }}
                data-testid="apc40-action"
              >
                {MIDI_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {t.actions[a]}
                  </option>
                ))}
              </select>
            </label>
            {action && ACTION_VALUE[action.action] && (
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                {action.action === 'item' ? t.itemNumber : t.seconds}
                <input
                  type="number"
                  className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  min={ACTION_VALUE[action.action]!.min}
                  max={ACTION_VALUE[action.action]!.max}
                  step={ACTION_VALUE[action.action]!.step}
                  value={action.value ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const spec = ACTION_VALUE[action.action]!;
                    if (Number.isFinite(v) && v >= spec.min && v <= spec.max) setMidiAction(control.id, { action: action.action, value: v });
                  }}
                  data-testid="apc40-value"
                />
              </label>
            )}
            <p className="text-xs text-slate-500">{control.led === 'color' ? t.ledColor : control.led === 'none' ? t.ledNone : t.ledMono}</p>
            <p className="basis-full text-xs text-slate-500">
              {t.ledNow}: <span className="font-semibold">{t.leds[ledFor(action, ledState)]}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.pick}</p>
        )}
      </div>
    </Modal>
  );
}
