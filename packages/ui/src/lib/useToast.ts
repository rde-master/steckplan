// Kurzer Hinweis unten rechts (grün), verschwindet nach 3 Sekunden.
import { useEffect, useRef, useState } from 'react';

export const TOAST_MS = 3000;

export function useToast(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), TOAST_MS);
  };
  return [message, show];
}
