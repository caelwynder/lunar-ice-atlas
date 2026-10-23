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
  await expect(page).toHaveURL(/:\d+\/(#\/)?$/);
  await expect(page.locator('#moon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open South Pole map' })).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(/#\/south$/);
});

test('a render that fails to load leaves the previous render pressed', async ({ page }) => {
  await page.route('**/models/grid.glb', (route) => route.abort());
  await openLanding(page);
  await page.getByRole('button', { name: 'Grid render' }).click();
  await expect(page.locator('#status')).toContainText('Could not load the Grid render');
  await expect(page.getByRole('button', { name: 'Topography render' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Grid render' })).toHaveAttribute('aria-pressed', 'false');
});

test('a deep link opens the North Pole map directly', async ({ page }) => {
  await page.goto('/#/north');
  await expect(page.getByRole('heading', { name: 'Predicted ice prospectivity', level: 1 })).toBeVisible();
  await expect(page.locator('.side')).toContainText('of covered area ≥ 0.4');
  await expect(page.locator('.basemap')).toHaveAttribute('src', /north\/b-dark\.webp$/);
});

test('the South Pole map zooms, pans and loads the sharper basemap', async ({ page }) => {
  await page.goto('/#/south');
  await expect(page.locator('.badge')).toHaveCount(9);
  await expect(page.locator('.scale span')).toHaveText('100 km');
  const pane = page.locator('.map-pane');
  const box = await pane.boundingBox();
  await page.mouse.move((box?.x ?? 0) + 300, (box?.y ?? 0) + 300);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
  await expect(page.locator('.basemap')).toHaveAttribute('src', /b-dark@2x\.webp$/, { timeout: 15_000 });
  await expect(page.locator('.scale span')).not.toHaveText('100 km');
  const before = await page.locator('.map-stage').getAttribute('style');
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + 150, (box?.y ?? 0) + 200, { steps: 5 });
  await page.mouse.up();
  expect(await page.locator('.map-stage').getAttribute('style')).not.toBe(before);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('.scale span')).toHaveText('100 km');
});

test('the 3D terrain view is optional and draws the regions', async ({ page }) => {
  await page.goto('/#/south');
  await expect(page.getByRole('radio', { name: 'Topographic' })).toBeChecked();
  await page.getByRole('radio', { name: '3D terrain' }).check();
  await expect(page.locator('.map-status')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('canvas.terrain')).toBeVisible();
  await expect(page.locator('.tbadge:visible')).not.toHaveCount(0);
  const shot = await page.locator('canvas.terrain').screenshot();
  expect(shot.byteLength).toBeGreaterThan(50_000);
  await page.getByRole('radio', { name: 'Topographic' }).check();
  await expect(page.locator('canvas.terrain')).toBeHidden();
  await expect(page.locator('.basemap')).toBeVisible();
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

for (const [width, height] of [
  [1440, 820],
  [1280, 1024],
  [1024, 768],
] as const) {
  test.describe(`at ${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test('keeps every Artemis badge centred on its outline', async ({ page }) => {
      await page.goto('/#/south');
      await expect(page.locator('.badge')).toHaveCount(9);
      const offsets = await page.evaluate(() => {
        const polys = [...document.querySelectorAll('svg.regions polygon')];
        const badges = [...document.querySelectorAll('.badge')];
        return badges.map((b, i) => {
          const bb = b.getBoundingClientRect();
          const pb = polys[i]?.getBoundingClientRect();
          if (!pb) return Infinity;
          return Math.hypot(bb.x + bb.width / 2 - (pb.x + pb.width / 2), bb.y + bb.height / 2 - (pb.y + pb.height / 2));
        });
      });
      expect(Math.max(...offsets)).toBeLessThan(8);
      const pane = await page.locator('.map-pane').boundingBox();
      expect(Math.abs((pane?.width ?? 0) - (pane?.height ?? 1))).toBeLessThan(2);
    });
  });
}
