import { Suspense, useEffect } from 'react';
import { lazyPage } from './lib/lazyPage';
import { getDesktop } from './lib/desktop';
import { matchRoute, navigate, usePath } from './lib/router';
import { useLibraryEvents } from './lib/library';
import { useSession } from './lib/session';
import { texts } from './texts';
import { Banner, Button, Spinner } from './components/ui';
import { DesktopStartPage } from './pages/DesktopStartPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectListPage } from './pages/ProjectListPage';

// Die großen Seiten werden erst geladen, wenn man sie öffnet: Anmeldung und Projektliste starten schneller, und
// Textfenster, Player und Vorstellung laden nicht den ganzen Editor (Zeichenflächen, Listen, Bibliothek) mit.
const ProjectPage = lazyPage(() => import('./pages/ProjectPage').then((m) => m.ProjectPage));
const PerformancePage = lazyPage(() => import('./pages/PerformancePage').then((m) => m.PerformancePage));
const LyricsPage = lazyPage(() => import('./pages/LyricsPage').then((m) => m.LyricsPage));
const LibraryPage = lazyPage(() => import('./pages/LibraryPage').then((m) => m.LibraryPage));
const OscPage = lazyPage(() => import('./pages/OscPage').then((m) => m.OscPage));
const PlayerPage = lazyPage(() => import('./pages/PlayerPage').then((m) => m.PlayerPage));
const SettingsPage = lazyPage(() => import('./pages/SettingsPage').then((m) => m.SettingsPage));

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const { status, loginAvailable, keyRejected, error, refresh } = useSession();
  const desktop = getDesktop();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Bibliothek laden und bei Änderungen (auch von anderen) live aktualisieren
  useLibraryEvents(status === 'authenticated');

  // Nicht angemeldet → zur Anmeldeseite (mit Rücksprung); nicht bei abgelehntem Desktop-Zugangsschlüssel
  useEffect(() => {
    if (status === 'anonymous' && loginAvailable && !keyRejected && route.page !== 'login') {
      navigate(`/anmelden?weiter=${encodeURIComponent(path)}`, { replace: true });
    }
  }, [status, loginAvailable, keyRejected, route.page, path]);

  if (keyRejected && status === 'anonymous') {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Banner tone="error">{texts.keyRejected[keyRejected]}</Banner>
        <Button onClick={() => void refresh()}>{texts.common.retry}</Button>
      </div>
    );
  }
  if (route.page === 'login') return <LoginPage next={route.next} />;
  if (status === 'loading') return <Spinner />;
  if (status === 'error') {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Banner tone="error">{error ?? texts.common.unknownError}</Banner>
        <Button onClick={() => void refresh()}>{texts.common.retry}</Button>
      </div>
    );
  }
  if (status === 'anonymous') {
    return loginAvailable ? <Spinner /> : <div className="p-6"><Banner tone="warn">{texts.login.notAvailable}</Banner></div>;
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Page route={route} desktop={desktop} />
    </Suspense>
  );
}

function Page({ route, desktop }: { route: ReturnType<typeof matchRoute>; desktop: ReturnType<typeof getDesktop> }) {
  switch (route.page) {
    case 'home':
      return desktop ? <DesktopStartPage desktop={desktop} /> : <ProjectListPage />;
    case 'project':
      return <ProjectPage key={route.id} id={route.id} />;
    case 'performance':
      return <PerformancePage key={route.id} id={route.id} />;
    case 'lyrics':
      return <LyricsPage key={route.id} id={route.id} />;
    case 'library':
      return <LibraryPage section={route.section} />;
    case 'osc':
      return <OscPage />;
    case 'player':
      return <PlayerPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return (
        <div className="p-6">
          <Button onClick={() => navigate('/')}>{texts.common.back}</Button>
        </div>
      );
  }
}
