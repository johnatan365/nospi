const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NOSPI_PLAYWRIGHT || (fs.existsSync(path.join(__dirname, 'node_modules/playwright')) ? path.join(__dirname, 'node_modules/playwright') : '/Users/johnatanpabon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    for (const width of [360, 736]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], outbound = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) outbound.push(request.url()); });
      await page.goto('http://127.0.0.1:4173/');
      await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
      const next = page.getByRole('button', { name: 'Confirmar y continuar', exact: true });
      await next.waitFor();
      assert.equal(await next.isDisabled(), true);
      const slider = page.getByRole('slider').first();
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox();
      await slider.click({ position: { x: box.width * 0.25, y: box.height / 2 } });
      const check = page.getByRole('checkbox');
      await check.click(); assert.equal(await next.isEnabled(), true);
      await slider.scrollIntoViewIfNeeded();
      await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
      assert.equal(await next.isDisabled(), true);
      await check.click();
      await page.screenshot({ path: path.join(__dirname, `reports/age-${width}.png`), fullPage: true });
      await next.click();
      const save = page.getByRole('button', { name: 'Guardar y continuar', exact: true });
      await save.waitFor(); assert.equal(await save.isDisabled(), true);
      const preference = width === 360 ? 'Pasar mi reserva a otra fecha.' : 'Asistir de todas formas.';
      await page.getByRole('radio', { name: preference, exact: true }).click();
      await page.screenshot({ path: path.join(__dirname, `reports/decision-${width}.png`), fullPage: true });
      await save.click();
      await page.getByText('¿En qué país y ciudad te encuentras?', { exact: true }).waitFor();
      assert.equal(await page.getByText('Preferencias confirmadas', { exact: true }).count(), 0);
      await page.getByText('Continuar', { exact: true }).click();
      await page.getByRole('button', { name: 'Completar registro de prueba' }).click();
      await page.getByRole('heading', { name: 'Eventos disponibles' }).waitFor();
      const stored = JSON.parse(await page.locator('pre').textContent());
      assert.equal(stored.age_range_fallback, width === 360 ? 'postpone' : 'attend');
      assert(stored.age_range_confirmed_at);
      await page.getByRole('button', { name: 'Cena del viernes →', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar asistencia', exact: true }).click();
      await page.getByRole('button', { name: 'Simular pago', exact: true }).click();
      await page.getByRole('heading', { name: 'Compra simulada', exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
      await page.close();
      console.log(`PASS ${width}px: range review reset, explicit choice, direct location, local DB save, catalog before payment, no outbound requests.`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
