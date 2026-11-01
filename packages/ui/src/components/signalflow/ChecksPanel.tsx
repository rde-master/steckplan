// Prüfungen-Panel: alle Warnungen, Klick springt zum Objekt.
import { useState } from 'react';
import type { Issue } from '@steckplan/core';
import { texts } from '../../texts';

const s = texts.signalflow;

export function ChecksPanel({ issues, onJump }: { issues: Issue[]; onJump: (issue: Issue) => void }) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;
  return (
    <section className="border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label={s.checks}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-medium">{s.checks}</span>
        {issues.length === 0 ? (
          <span className="text-emerald-700 dark:text-emerald-400">✓ {s.noIssues}</span>
        ) : (
          <>
            {errors > 0 && <span className="rounded-full bg-red-100 px-2 text-xs text-red-900">{s.errors(errors)}</span>}
            {warnings > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900">{s.warnings(warnings)}</span>}
            {infos > 0 && <span className="rounded-full bg-sky-100 px-2 text-xs text-sky-900">{s.infos(infos)}</span>}
          </>
        )}
        <span className="ml-auto text-slate-400">{open ? '▾' : '▴'}</span>
      </button>
      {open && issues.length > 0 && (
        <ul className="max-h-48 overflow-y-auto border-t border-slate-100 text-sm dark:border-slate-800" data-testid="checks-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button type="button" className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onJump(issue)}>
                <span className={issue.severity === 'error' ? 'text-red-600' : issue.severity === 'warning' ? 'text-amber-600' : 'text-sky-600'}>
                  {issue.severity === 'error' ? '⛔' : issue.severity === 'warning' ? '⚠' : 'ℹ'}
                </span>
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
