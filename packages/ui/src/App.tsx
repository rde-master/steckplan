import { useEffect } from 'react';
import { getDesktop } from './lib/desktop';
import { matchRoute, navigate, usePath } from './lib/router';
import { useLibraryEvents } from './lib/library';
import { useSession } from './lib/session';
import { texts } from './texts';
import { Banner, Button, Spinner } from './components/ui';
import { DesktopStartPage } from './pages/DesktopStartPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { LyricsPage } from './pages/LyricsPage';
import { PerformancePage } from './pages/PerformancePage';
import { OscPage } from './pages/OscPage';
import { ProjectPage } from './pages/ProjectPage';
import { SettingsPage } from './pages/SettingsPage';

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
