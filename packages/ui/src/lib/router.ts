// Minimaler Router über die History-API (keine zusätzliche Bibliothek nötig).
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  for (const listener of listeners) listener();
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
}

export type Route =
  | { page: 'home' }
  | { page: 'login'; next: string }
  | { page: 'project'; id: string }
  | { page: 'lyrics'; id: string }
  | { page: 'performance'; id: string }
  | { page: 'library'; section: string }
  | { page: 'settings' }
  | { page: 'osc' }
  | { page: 'player' }
  | { page: 'notFound' };

export function matchRoute(pathWithQuery: string): Route {
  const [path = '/', query = ''] = pathWithQuery.split('?');
  if (path === '/' || path === '') return { page: 'home' };
  if (path === '/anmelden') {
    const next = new URLSearchParams(query).get('weiter');
    return { page: 'login', next: next && next.startsWith('/') && !next.startsWith('//') ? next : '/' };
  }
  if (path === '/bibliothek' || path === '/bibliothek/') {
    return { page: 'library', section: new URLSearchParams(query).get('bereich') ?? 'device' };
  }
  if (path === '/einstellungen') return { page: 'settings' };
  if (path === '/osc') return { page: 'osc' };
  if (path === '/player' || path === '/player/') return { page: 'player' };
  const performance = /^\/projekt\/([^/]+)\/vorstellung\/?$/.exec(path);
  if (performance) return { page: 'performance', id: decodeURIComponent(performance[1]!) };
  const lyrics = /^\/projekt\/([^/]+)\/text\/?$/.exec(path);
  if (lyrics) return { page: 'lyrics', id: decodeURIComponent(lyrics[1]!) };
  const project = /^\/projekt\/([^/]+)\/?$/.exec(path);
  if (project) return { page: 'project', id: decodeURIComponent(project[1]!) };
  return { page: 'notFound' };
}
