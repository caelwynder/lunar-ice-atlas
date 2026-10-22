import { type Page, expect, test } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openLanding(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#status')).toBeHidden({ timeout: 60_000 });
}

test('renders the NASA Moon and switches renders', async ({ page }) => {
  await openLanding(page);
  const shot = await page.locator('#moon').screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
  const grid = page.getByRole('button', { name: 'Grid render' });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Topography render' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#status')).toBeHidden({ timeout: 60_000 });
});

test('info drawer shows the run log and caveats, pushes the Moon left and closes on Escape', async ({ page }) => {
  await openLanding(page);
  const before = (await page.locator('#moon').boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: 'Project information' }).click();
  const drawer = page.locator('#info');
  await expect(drawer).toContainText('0.0277');
  await expect(drawer).toContainText('not measured ice');
  await expect.poll(async () => (await page.locator('#moon').boundingBox())?.width ?? 0).toBeLessThan(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Project information' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Project information' })).toBeFocused();
});

test('keyboard users reach the South Pole map, switch style and come back', async ({ page }) => {
  await openLanding(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Open South Pole map' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/south$/);
  await expect(page.getByRole('heading', { name: 'Candidate landing regions' })).toBeVisible();
  await expect(page.locator('.region-list tbody tr').first()).toContainText('Slater Plain');
  await page.getByRole('radio', { name: 'Hotspots' }).check();
  await expect(page.locator('.basemap')).toHaveAttribute('src', /d-dark\.webp$/);
  await page.getByRole('button', { name: 'Back to Moon' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#moon')).toBeVisible();
});

test('a deep link opens the North Pole map directly', async ({ page }) => {
  await page.goto('/#/north');
  await expect(page.getByRole('heading', { name: 'Predicted ice prospectivity', level: 1 })).toBeVisible();
  await expect(page.locator('.side')).toContainText('of the cap ≥ 0.4');
  await expect(page.locator('.basemap')).toHaveAttribute('src', /north\/b-dark\.webp$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no horizontal scroll with the drawer open or on the South Pole map', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('button', { name: 'Project information' }).click();
    await expect(page.locator('#info')).toContainText('Run log');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await page.goto('/#/south');
    await expect(page.getByRole('heading', { name: 'Candidate landing regions' })).toBeVisible();
    const widths = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.getElementById('map-view')?.scrollWidth ?? 0,
    ]);
    expect(Math.max(...widths)).toBeLessThanOrEqual(390);
  });
});
