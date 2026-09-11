const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const db = { ids: { countries: { C1: { name: 'France' } }, products: { P1: { name: 'Test product' } }, bundles: {}, locations: {} }, countries: { C1: { ga_zone: 'europe', rma: { status: 'temp' }, spare_parts: { status: 'yes' }, note: 'Country ordinary' } }, products: { P1: { note: 'Global ordinary', zones: { europe: { rma: { status: 'yes', paid: { price: 25 } }, spare_parts: { status: 'temp' }, exchange: { status: 'us' }, note: 'Region ordinary' } } } } };
    await page.addInitScript(db => { window.cairmDesktop = { loadDefaultDatabase: async () => JSON.stringify(db) }; }, db);
    const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8').replace('      loadDb();', '      window.testState = state;\n      loadDb();');
    await page.route('http://cairmdb.test/**', route => route.fulfill({ contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/html', body: route.request().url().endsWith('.css') ? fs.readFileSync(path.join(__dirname, '../src/renderer/rework.css'), 'utf8') : html }));
    await page.goto('http://cairmdb.test/');
    await page.click('#tab-wws');
    assert.equal(await page.locator('#countryEditor [data-service]').count(), 4);
    assert.equal(await page.locator('#countryEditor [data-service-legacy]').inputValue(), 'temp');
    await page.locator('#countryEditor [data-important-enabled] + .slider').click();
    await page.locator('#countryEditor [data-important-section="rma"]').check();
    await page.locator('#countryEditor [data-important-comment]').fill('Country important');
    await page.click('#tab-ga');
    assert.equal(await page.locator('#productEditor [data-service]').count(), 4);
    assert.equal(await page.locator('#productEditor [data-service="paid"] [data-service-toggle]').isChecked(), true, 'Legacy price implies Yes');
    assert.equal(await page.locator('#productEditor [data-service="spare_parts"] [data-service-legacy]').inputValue(), 'temp');
    assert.equal(await page.locator('[data-product-field="exchange.destination"]').inputValue(), 'us');
    await page.locator('[data-product-field="exchange.destination"]').selectOption('retailer');
    for (const scope of ['region', 'global']) {
      const block = page.locator(`[data-important-scope="${scope}"]`);
      await block.locator('[data-important-enabled] + .slider').click();
      await block.locator('[data-important-section="exchange"]').check();
      await block.locator('[data-important-comment]').fill(`${scope} important`);
    }
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(testState.db)));
    assert.equal(saved.countries.C1.rma.status, 'temp');
    assert.equal(saved.countries.C1.note, 'Country ordinary');
    assert.equal(saved.products.P1.zones.europe.spare_parts.status, 'temp');
    assert.equal(saved.products.P1.zones.europe.exchange.status, 'yes');
    assert.equal(saved.products.P1.zones.europe.exchange.destination, 'retailer');
    assert.equal(saved.products.P1.note, 'Global ordinary');
    assert.equal(saved.products.P1.zones.europe.note, 'Region ordinary');
    assert.equal(saved.products.P1.temporary_comment.comment, 'global important');
    assert.equal(saved.products.P1.zones.europe.temporary_comment.comment, 'region important');
    await page.locator('[data-important-scope="region"] [data-important-enabled] + .slider').click();
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.europe.temporary_comment.comment), 'region important');
    await page.locator('[data-service="spare_parts"] [data-service-legacy]').selectOption('no');
    await page.locator('#productEditor [data-service-legacy]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#productEditor [data-service-legacy]').count(), 0, 'Temp cannot be reintroduced after choosing No');
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.europe.spare_parts.status), 'no');
    assert.deepEqual(errors, []);
    console.log('Editor browser OK: four offers, both note scopes, preservation of ordinary notes and legacy states, Exchange destination and warning deactivation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
