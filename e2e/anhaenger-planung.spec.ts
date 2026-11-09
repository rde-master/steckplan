import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Anhänger-Planung: je Auftritt wer welchen Anhänger von wo nach wo fährt; Freiwillige oben; Fahrer sehen ihre Fahrten', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const big = await (await page.request.post('/api/library/master/trailers', { data: { name: 'Hänger Groß AP' } })).json();
  const small = await (await page.request.post('/api/library/master/trailers', { data: { name: 'Hänger Klein AP' } })).json();
  const box = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Box AP' } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'anhaenger',
        meta: { name: 'Tour' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        people: [
          { id: 'anna', lastName: 'Muster', firstName: 'Anna' },
          { id: 'ben', lastName: 'Beispiel', firstName: 'Ben' },
        ],
        devices: [{ id: 'b1', templateId: box.id, layerId: 'l1', label: 'Box 1', trailerId: big.id }],
        gigs: [
          { id: 'g1', title: 'Sommerfest', location: 'Marktplatz', date: '2026-07-04', setupTime: '14:00' },
          { id: 'g2', title: 'Herbstkonzert', location: 'Stadthalle', date: '2026-10-10' },
        ],
        helperSignups: [{ id: 'g1:ben', gigId: 'g1', personId: 'ben', trailerThere: true }],
      },
    })
  ).json();
  const trips = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { trailerTrips: { gigId: string; trailerId?: string; personId?: string; from?: string; to?: string; time?: string }[] }).trailerTrips;

  await page.goto(`/projekt/${id}?ansicht=helfer`);
  await page.getByTestId('helpers-trailers').click();
  const planning = page.getByTestId('trailer-planning');
  const gig = planning.getByTestId('trailer-gig').filter({ hasText: 'Sommerfest' });
  await expect(gig).toContainText('Marktplatz');
  await expect(gig.getByTestId('trailer-volunteers')).toContainText('Ben Beispiel (hin)');

  // alle genutzten Anhänger einplanen: eine Fahrt (nur der große ist im Projekt genutzt) zum Marktplatz
  await gig.getByRole('button', { name: 'Alle Anhänger einplanen' }).click();
  const trip = gig.getByTestId('trailer-trip');
  await expect(trip).toHaveCount(1);
  await expect(trip.getByLabel('Anhänger')).toHaveValue(big.id);
  await expect(trip.getByLabel('Nach')).toHaveValue('Marktplatz');
  await expect(gig.getByTestId('trailer-gap')).toHaveText('1 Fahrt ohne Fahrer');
  // Fahrer: Ben steht als Freiwilliger oben
  await expect(trip.getByLabel('Fahrer').locator('option').nth(1)).toHaveText('🚚 Ben Beispiel');
  await trip.getByLabel('Fahrer').selectOption({ label: '🚚 Ben Beispiel' });
  await trip.getByLabel('Von').fill('Lager');
  await trip.getByLabel('Von').press('Tab');
  await trip.getByLabel('Abfahrt').fill('13:00');
  await expect(gig.getByTestId('trailer-gap')).toHaveCount(0);
  // zweite Fahrt von Hand: kleiner Anhänger mit Anna
  await gig.getByRole('button', { name: 'Fahrt', exact: true }).click();
  await expect(trip).toHaveCount(2);
  const second = trip.nth(1);
  await second.getByLabel('Anhänger').selectOption({ label: 'Hänger Klein AP' });
  await second.getByLabel('Fahrer').selectOption({ label: 'Anna Muster' });
  await expect
    .poll(async () => (await trips()).map((x) => `${x.gigId}|${x.trailerId === big.id ? 'groß' : x.trailerId === small.id ? 'klein' : '-'}|${x.personId ?? ''}|${x.from ?? ''}→${x.to ?? ''}|${x.time ?? ''}`).sort())
    .toEqual(['g1|groß|ben|Lager→Marktplatz|13:00', 'g1|klein|anna|→Marktplatz|']);

  await planning.screenshot({ path: 'test-results/anhaenger-planung.png' });
  // Ben sieht seine Fahrt auf seiner Seite
  await page.goto(`/projekt/${id}?ansicht=helfer&person=ben`);
  const mine = page.getByTestId('my-trips');
  await expect(mine.getByTestId('my-trip')).toHaveCount(1);
  await expect(mine).toContainText('Abfahrt 13:00');
  await expect(mine).toContainText('Hänger Groß AP');
  await expect(mine).toContainText('Lager → Marktplatz (Sommerfest)');

  // Fahrt löschen
  await page.goto(`/projekt/${id}?ansicht=helfer`);
  await page.getByTestId('helpers-trailers').click();
  await page.getByTestId('trailer-gig').filter({ hasText: 'Sommerfest' }).getByTestId('trailer-trip').nth(1).getByRole('button', { name: 'Fahrt löschen' }).click();
  await expect.poll(async () => (await trips()).length).toBe(1);
});
