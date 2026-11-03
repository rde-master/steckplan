// Umschalter für die Zeichenfläche: Auto (Systemdesign) · Hell · Dunkel – je Browser gemerkt.
import type { CanvasTheme } from '../lib/useDarkMode';
import { texts } from '../texts';

const t = texts.canvasTheme;

export function CanvasThemeSwitch({ value, onChange }: { value: CanvasTheme; onChange: (theme: CanvasTheme) => void }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className="text-slate-500">{t.label}:</span>
      <span className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={t.label}>
        {(['auto', 'light', 'dark'] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={value === theme}
            title={theme === 'auto' ? t.autoTitle : undefined}
            onClick={() => onChange(theme)}
            className={`px-2 py-0.5 ${value === theme ? 'bg-sky-600 text-white' : ''}`}
          >
            {t[theme]}
          </button>
        ))}
      </span>
    </span>
  );
}
