// Werkzeugleiste des Signalflusses.
import type { UndoApi } from '../../lib/undo';
import { texts } from '../../texts';
import { Button } from '../ui';

const s = texts.signalflow;

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distributeH' | 'distributeV';

export function Toolbar({
  undo,
  editable,
  selectionCount,
  deviceCount,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  canUngroup = false,
  onAlign,
  onZoom,
  onFit,
  zoom,
}: {
  undo: UndoApi;
  editable: boolean;
  selectionCount: number;
  deviceCount: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  canUngroup?: boolean;
  onAlign: (mode: AlignMode) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  zoom: number;
}) {
  const icon = (label: string, symbol: string, onClick: () => void, disabled = false) => (
    <Button variant="ghost" className="min-h-9 px-2" title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      {symbol}
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="toolbar" aria-label={s.toolbar}>
      {editable && (
        <>
          {icon(s.undo, '↶', undo.undo, !undo.canUndo)}
          {icon(s.redo, '↷', undo.redo, !undo.canRedo)}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          {icon(s.duplicate, '⧉', onDuplicate, selectionCount === 0)}
          {icon(s.delete, '🗑', onDelete, selectionCount === 0)}
          {onGroup && (
            <Button variant="ghost" className="min-h-9 px-2 text-xs" title={texts.groups.createTitle} onClick={onGroup} disabled={deviceCount === 0}>
              ▣ {texts.groups.create}
            </Button>
          )}
          {onUngroup && canUngroup && (
            <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onUngroup}>
              {texts.groups.ungroup}
            </Button>
          )}
          <span className="mx-1 hidden h-5 w-px bg-slate-200 md:inline dark:bg-slate-700" />
          <span className="hidden md:contents">
            {icon(s.align.left, '⫷', () => onAlign('left'), deviceCount < 2)}
            {icon(s.align.center, '⫼', () => onAlign('center'), deviceCount < 2)}
            {icon(s.align.right, '⫸', () => onAlign('right'), deviceCount < 2)}
            {icon(s.align.top, '⊤', () => onAlign('top'), deviceCount < 2)}
            {icon(s.align.middle, '⊝', () => onAlign('middle'), deviceCount < 2)}
            {icon(s.align.bottom, '⊥', () => onAlign('bottom'), deviceCount < 2)}
            {icon(s.align.distributeH, '⇹', () => onAlign('distributeH'), deviceCount < 3)}
            {icon(s.align.distributeV, '⇳', () => onAlign('distributeV'), deviceCount < 3)}
          </span>
        </>
      )}
      <div className="flex-1" />
      {icon(s.zoomOut, '−', () => onZoom(1 / 1.2))}
      <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)} %</span>
      {icon(s.zoomIn, '+', () => onZoom(1.2))}
      <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onFit}>
        {s.fit}
      </Button>
    </div>
  );
}
