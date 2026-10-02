import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Regressão de redimensionamento: nomes longos nos chips, utilitários do cabeçalho
// e layout de computador entre 761 e 1440px. Nenhuma API real recebe escrita.
const output = resolve('.test-artifacts/desktop-intermediario');
mkdirSync(output, { recursive: true });
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const customer = { id: 'c1', name: 'Aline Fernandes de Albuquerque', phone: '68999990000', isQuick: false };
await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  const json = value => route.fulfill({ json: value });
  if (path === '/api/auth/me') return json({ user: { id: 'u1', name: 'Administrador Inova', role: 'SUPER_ADMIN', maxDiscountPercent: 100 } });
  if (path === '/api/notifications/deadlines') return json({ alerts: [] });
  if (path === '/api/quote-draft') return json(route.request().method() === 'GET' ? { version: null } : { saved: true, version: 1 });
  if (path === '/api/catalog') return json({ materials: [], services: [], productTypes: [], settings: { closedSquareMeter: true } });
  if (path === '/api/customers') return json({ data: [customer] });
  if (path === '/api/customers/c1/designs') return json({ designs: [] });
  errors.push(`API não simulada: ${path}`);
  return route.fulfill({ status: 404, json: {} });
});

try {
  await page.goto((process.env.INOVA_VISUAL_URL ?? 'http://localhost:3001') + '/');
  await page.getByRole('button', { name: 'Cliente: selecionar', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Selecionar cliente existente', exact: true }).click();
  await page.getByPlaceholder('Digite nome, telefone ou CPF').fill('Aline');
  await page.locator('.customer-result').click();
  const projectName = 'Cozinha gourmet e varanda da família Fernandes';
  await page.locator('#project-name').fill(projectName);
  await page.locator('#project-name').press('Tab');
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.documentElement.classList.toggle('inova-dark', dark), dark);
    for (const width of [1440, 1401, 1400, 1280, 1181, 1180, 1100, 960, 875, 800, 761]) {
      await page.setViewportSize({ width, height: 960 });
      const chips = page.locator('.application-header-tabs .atendimento-chip');
      await expect(chips).toHaveCount(2);
      const rectangles = await chips.evaluateAll(elements => elements.map(el => {
        const box = el.getBoundingClientRect(), text = el.querySelector('.atendimento-chip-texto').getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, right: box.right, bottom: box.bottom, textWidth: text.width };
      }));
      for (const r of rectangles) { assert(r.width >= 180, `${width}: botão legível`); assert(r.textWidth >= 80, `${width}: espaço para o nome`); assert(r.right <= width, `${width}: botão dentro da tela`); }
      const [a, b] = rectangles;
      assert(a.right <= b.x || a.bottom <= b.y || b.bottom <= a.y, `${width}: cliente e projeto não se sobrepõem`);
      const controls = await page.locator('.application-header-actions > .notification-bell:not(.mobile-menu-toggle), .application-header-actions > .header-account').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
      for (const chip of rectangles) for (const control of controls) assert(chip.right <= control.x + 1 || chip.bottom <= control.y + 1 || control.bottom <= chip.y + 1, `${width}: utilitários não cobrem os menus`);
      await expect(page.locator('.application-frame > .application-sidebar')).toBeVisible();
      await expect(page.locator('.mobile-bottom-nav')).not.toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: sem estouro da página`);
      await expect(page.locator('#project-name')).toHaveValue(projectName);
      if ([875, 1181, 1440].includes(width)) await page.screenshot({ path: resolve(output, `${width}-${dark ? 'escuro' : 'claro'}.png`) });
      console.log(`✓ ${width}px ${dark ? 'escuro' : 'claro'}`);
    }
  }
  await page.setViewportSize({ width: 875, height: 960 });
  await page.getByRole('button', { name: `Projeto: ${projectName}`, exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Adicionar projeto', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Cliente: ${customer.name}`, exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Editar cliente', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.application-frame > .application-sidebar')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar projeto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cliente', exact: true })).toBeVisible();
  await expect(page.locator('#project-name')).toHaveValue(projectName);
  assert.deepEqual(errors, []);
  console.log('✓ Redimensionamento, menus e dados preservados; 22 combinações de largura e tema.');
} finally { await browser.close(); }
