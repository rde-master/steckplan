// Großes Textfeld mit Formatierung: fett, kursiv, unterstrichen, durchgestrichen, Überschrift, Listen, Textfarbe.
// Gespeichert wird bereinigtes HTML. Während man tippt, bleibt der Inhalt im Feld wie getippt; Änderungen anderer
// erscheinen, sobald das Feld nicht mehr den Fokus hat.
import { Bold, Heading, Italic, List, ListOrdered, RemoveFormatting, Strikethrough, Underline, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { sanitizeRichText } from '../../lib/richText';
import { texts } from '../../texts';

const t = texts.regie.sound;

/** Werkzeuge: Symbol, Bezeichnung, Befehl (execCommand) */
const TOOLS: { icon: LucideIcon; label: string; command: string; arg?: string }[] = [
  { icon: Bold, label: t.bold, command: 'bold' },
  { icon: Italic, label: t.italic, command: 'italic' },
  { icon: Underline, label: t.underline, command: 'underline' },
  { icon: Strikethrough, label: t.strike, command: 'strikeThrough' },
  { icon: Heading, label: t.heading, command: 'formatBlock', arg: 'h3' },
  { icon: List, label: t.bullets, command: 'insertUnorderedList' },
  { icon: ListOrdered, label: t.numbers, command: 'insertOrderedList' },
  { icon: RemoveFormatting, label: t.clear, command: 'removeFormat' },
];

/** Farben zum Anklicken (dazu eine frei wählbare) */
const COLORS = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#7c3aed', '#db2777'];

function setContent(el: HTMLElement | null, html: string): void {
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

function run(command: string, value?: string): void {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(command, false, value);
}

export function RichTextEditor({ value, editable, label, onChange, minHeight = 'min-h-[50vh]' }: { value: string | undefined; editable: boolean; label: string; onChange: (html: string) => void; minHeight?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const clean = sanitizeRichText(value);
  // Stand aus dem Dokument zeigen – außer während man selbst tippt
  useEffect(() => {
    if (!focused.current) setContent(ref.current, clean);
  }, [clean]);

  const emit = () => onChange(sanitizeRichText(ref.current?.innerHTML ?? ''));
  const command = (name: string, arg?: string) => {
    ref.current?.focus();
    run(name, arg);
    emit();
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900" data-testid="rich-text">
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1 dark:border-slate-700" role="toolbar" aria-label={t.toolbar}>
          {TOOLS.map(({ icon: Icon, label: name, command: cmd, arg }) => (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              // Auswahl im Textfeld behalten
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(cmd, arg)}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Icon size={16} aria-hidden />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={t.color(color)}
              aria-label={t.color(color)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command('foreColor', color)}
              className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600"
              style={{ background: color }}
            />
          ))}
          <label className="ml-1 flex items-center" title={t.customColor}>
            <span className="sr-only">{t.customColor}</span>
            <input type="color" className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" onMouseDown={() => ref.current?.focus()} onChange={(e) => command('foreColor', e.target.value)} />
          </label>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable={editable}
        suppressContentEditableWarning
        className={`rich-text ${minHeight} px-4 py-3 text-base leading-relaxed focus:outline-none`}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          emit();
        }}
        onInput={emit}
      />
    </div>
  );
}

/** Formatierten Text anzeigen (bereinigt) */
export function RichTextView({ html, className = '' }: { html: string | undefined; className?: string }) {
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}
