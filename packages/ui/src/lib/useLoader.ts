// Lädt Daten asynchron; `reload()` lädt erneut (z. B. nach einer Änderung).
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api';

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  reload: () => void;
}

export function useLoader<T>(load: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<{ data?: T; error: string | null }>({ error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setResult({ data, error: null }),
      (err: unknown) => active && setResult((prev) => ({ data: prev.data, error: errorMessage(err) })),
    );
    return () => {
      active = false;
    };
  }, [load, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: result.data, error: result.error, reload };
}
