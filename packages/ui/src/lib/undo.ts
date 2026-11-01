// Rückgängig/Wiederholen pro Person (nur eigene Änderungen) mit dem Yjs-UndoManager.
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';

export interface UndoApi {
  /** Herkunft für eigene Änderungen – an alle Änderungsfunktionen übergeben */
  origin: object;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** nächste Änderung als eigenen Schritt beginnen (z. B. nach Ziehen) */
  stop(): void;
}

export function useUndo(doc: Y.Doc | undefined): UndoApi {
  const origin = useMemo(() => ({ name: 'lokal' }), []);
  const manager = useMemo(
    () => (doc ? new Y.UndoManager([doc.getMap('devices'), doc.getMap('cables'), doc.getMap('shapes'), doc.getMap('layers'), doc.getMap('root'), doc.getMap('settings')], { trackedOrigins: new Set([origin]), captureTimeout: 400 }) : null),
    [doc, origin],
  );
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (!manager) return;
    const update = () => setState({ canUndo: manager.canUndo(), canRedo: manager.canRedo() });
    manager.on('stack-item-added', update);
    manager.on('stack-item-popped', update);
    manager.on('stack-cleared', update);
    return () => manager.destroy();
  }, [manager]);

  return {
    origin,
    undo: () => manager?.undo(),
    redo: () => manager?.redo(),
    stop: () => manager?.stopCapturing(),
    ...state,
  };
}
