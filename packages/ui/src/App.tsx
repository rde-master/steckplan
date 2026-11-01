import { useEffect } from 'react';
import { getDesktop } from './lib/desktop';
import { matchRoute, navigate, usePath } from './lib/router';
import { useSession } from './lib/session';
import { texts } from './texts';
import { Banner, Button, Spinner } from './components/ui';
import { DesktopStartPage } from './pages/DesktopStartPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { ProjectPage } from './pages/ProjectPage';

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const { status, loginAvailable, error, refresh } = useSession();
  const desktop = getDesktop();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Nicht angemeldet → zur Anmeldeseite (mit Rücksprung)
  useEffect(() => {
    if (status === 'anonymous' && loginAvailable && route.page !== 'login') {
      navigate(`/anmelden?weiter=${encodeURIComponent(path)}`, { replace: true });
    }
  }, [status, loginAvailable, route.page, path]);

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
    default:
      return (
        <div className="p-6">
          <Button onClick={() => navigate('/')}>{texts.common.back}</Button>
        </div>
      );
  }
}
