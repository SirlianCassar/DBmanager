const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const zones = ['europe', 'usa', 'canada', 'hong_kong_taiwan', 'australia', 'rest_of_world'];
    const product = () => ({ skus: { global: 'SKU' }, zones: Object.fromEntries(zones.map(zone => [zone, { rma: { status: 'no', paid: { status: 'no' } }, spare_parts: { status: 'no' }, exchange: { status: 'no' } }])) });
    const country = () => ({ ga_zone: 'europe', rma: { status: 'yes', warranty_duration: 2 }, spare_parts: { status: 'yes', warranty_duration: 2 } });
    const db = { ids: { products: {}, countries: {}, bundles: {}, locations: {} }, products: {}, countries: {} };
    for (let index = 0; index < 60; index++) {
      db.ids.products[`P${index}`] = { name: `Product ${String(index).padStart(2, '0')}` };
      db.products[`P${index}`] = product();
      db.ids.countries[`C${index}`] = { name: `Country ${String(index).padStart(2, '0')}` };
      db.countries[`C${index}`] = country();
      db.ids.bundles[`B${index}`] = { name: `Bundle ${String(index).padStart(2, '0')}`, products: ['P0'] };
    }
    db.ids.products.P60 = { name: 'ZZ Product', aliases: ['Unique CRM name'] };
    db.products.P60 = product();
    db.products.P60.zones.europe.exchange.status = '';
    delete db.products.P60.skus;
    db.ids.products.P61 = { name: 'ZZ Other', aliases: ['ZZ Product'] };
    db.products.P61 = product();
    db.ids.countries.C60 = { name: 'ZZ Country' };
    db.countries.C60 = country();
    delete db.countries.C60.rma.warranty_duration;
    db.ids.bundles.B60 = { name: 'ZZ Bundle', products: [] };
    await page.addInitScript(db => { window.cairmDesktop = { loadDefaultDatabase: async () => JSON.stringify(db) }; }, db);
    const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8').replace('      loadDb();', '      window.testState = state;\n      loadDb();');
    await page.context().route('http://cairmdb.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const filename = /\.(js|css)$/.test(pathname) ? path.basename(pathname) : '';
      return route.fulfill({ contentType: filename.endsWith('.js') ? 'text/javascript' : filename ? 'text/css' : 'text/html', body: filename ? fs.readFileSync(path.join(__dirname, '../src/renderer', filename), 'utf8') : html });
    });
    await page.goto('http://cairmdb.test/');
    await page.click('#tab-cleanup');
    const before = await page.evaluate(() => JSON.stringify(testState.db));
    await page.click('#scanDb');
    await page.waitForFunction(() => document.querySelector('#auditStatus').textContent.startsWith('Scan DB terminé'));
    const open = async field => {
      await page.click('#tab-cleanup');
      await page.locator('#auditSearch').fill(field);
      await page.locator(`tr[data-audit-path="${field}"] [data-audit-open]`).click();
    };
    const assertSelection = async (list, attribute, id, fieldSelector) => {
      const item = page.locator(`${list} [${attribute}="${id}"]`);
      assert.match(await item.getAttribute('class'), /is-active/);
      assert.equal(await item.getAttribute('aria-current'), 'true');
      assert.equal(await page.locator(`${list} .is-active`).count(), 1);
      const position = await item.evaluate(node => {
        const scroller = node.closest('.stack'), item = node.getBoundingClientRect(), box = scroller.getBoundingClientRect();
        return { visible: item.top >= box.top - 1 && item.bottom <= box.bottom + 1, scroll: scroller.scrollTop };
      });
      assert(position.visible, `${id} should be visible in its list`);
      assert(position.scroll > 0, `${id} should scroll the long list`);
      const field = page.locator(fieldSelector);
      assert.equal(await field.evaluate(node => getComputedStyle(node).outlineColor), 'rgb(245, 158, 11)');
    };
    await open('products.P60.zones.europe.exchange.status');
    await assertSelection('#productList', 'data-product', 'P60', '#productEditor [data-service="exchange"].audit-field-focus');
    await open('countries.C60.rma.warranty_duration');
    await assertSelection('#countryList', 'data-country', 'C60', '#countryEditor [data-country-field="rma.warranty_duration"].audit-field-focus');
    await open('ids.bundles.B60.products');
    await assertSelection('#bundleList', 'data-bundle', 'B60', '#selectedProducts.audit-field-focus');
    await open('products.P60.skus');
    await assertSelection('#skuProductList', 'data-sku-product', 'P60', '#globalSku.audit-field-focus');
    await page.click('#tab-cleanup');
    await page.locator('#auditSearch').fill('ids.products.P61.aliases');
    const collision = page.locator('tr[data-audit-path="ids.products.P61.aliases"]');
    assert.match(await collision.locator('.audit-suggestions').textContent(), /libellé exact utilisé par le CRM/);
    assert.match(await collision.locator('.audit-suggestions').textContent(), /Aucune modification du CRM/);
    const compare = collision.locator('[data-audit-related]').filter({ hasText: '(P60)' });
    await compare.click();
    assert.equal(await page.locator('#auditFieldDialog').isVisible(), true);
    await assertSelection('#productList', 'data-product', 'P60', '#auditFieldValue.audit-field-focus');
    assert.equal(await page.evaluate(() => JSON.stringify(testState.db)), before, 'Opening, scrolling and suggestions are read-only');
    assert.deepEqual(errors, []);
    console.log('Diagnostic navigation OK: all four long lists selected/scrolled, orange fields, related collision links and CRM-read-only guidance.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
