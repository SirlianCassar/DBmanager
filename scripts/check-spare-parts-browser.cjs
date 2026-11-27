// Spare part warning tab: seeding from the list built into Cairm, adding, editing and removing
// parts, SKU validation, the single global message, and the exported JSON read by Cairm.
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
    page.on('dialog', dialog => dialog.accept());
    const db = { ids: { countries: {}, products: {}, bundles: {}, locations: {} }, countries: {}, products: {}, checked: { countries: {}, products: {}, skus: {}, bundles: {} } };
    await page.addInitScript(db => { window.cairmDesktop = { loadDefaultDatabase: async () => JSON.stringify(db) }; }, db);
    const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8').replace('      loadDb();', '      window.testState = state; window.testExport = buildExportDb;\n      loadDb();');
    await page.context().route('http://cairmdb.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const filename = /\.(js|css)$/.test(pathname) ? path.basename(pathname) : '';
      return route.fulfill({ contentType: filename.endsWith('.js') ? 'text/javascript' : filename ? 'text/css' : 'text/html', body: filename ? fs.readFileSync(path.join(__dirname, '../src/renderer', filename), 'utf8') : html });
    });
    await page.goto('http://cairmdb.test/');
    await page.click('#tab-spares');
    const seed = await page.evaluate(() => globalThis.CAIRM_US_EXPRESS_SPARE_PARTS.length);
    assert.ok(seed > 100, 'The list built into Cairm is offered');
    assert.match(await page.locator('#spareSeed').textContent(), new RegExp(`${seed} pièces`));
    assert.equal(await page.evaluate(() => testState.dirty), false, 'Opening the tab changes nothing');
    assert.equal(await page.evaluate(() => 'usExpressSpareParts' in testState.db), false);

    await page.click('#seedSpareParts');
    assert.equal(await page.locator('#spareList tbody tr').count(), seed);
    assert.equal(await page.locator('#spareSeed').textContent(), '');

    await page.fill('#spareSku', ' 6 001 692 ');
    await page.fill('#spareName', 'Duplicate');
    await page.click('#spareAddForm button[type="submit"]');
    assert.match(await page.locator('#spareAddError').textContent(), /6001692 est déjà/);
    await page.fill('#spareSku', '12/34');
    await page.click('#spareAddForm button[type="submit"]');
    assert.match(await page.locator('#spareAddError').textContent(), /lettres, chiffres/);
    await page.fill('#spareSku', '9000001');
    await page.fill('#spareName', 'TEST PART');
    await page.click('#spareAddForm button[type="submit"]');
    assert.equal(await page.locator('#spareAddError').textContent(), '');
    assert.equal(await page.locator('#spareList tbody tr').count(), seed + 1);
    assert.equal(await page.locator('#spareList tbody tr').first().locator('input').first().inputValue(), '9000001');

    await page.fill('#spareSearch', 'test part');
    assert.equal(await page.locator('#spareList tbody tr').count(), 1);
    await page.locator('#spareList input[data-spare-field="name"]').fill('TEST PART RENAMED');
    await page.locator('#spareList input[data-spare-field="name"]').press('Tab');
    await page.locator('#spareList input[data-spare-field="sku"]').fill('6001692');
    await page.locator('#spareList input[data-spare-field="sku"]').press('Tab');
    assert.match(await page.locator('#spareAddError').textContent(), /déjà/);
    assert.equal(await page.locator('#spareList input[data-spare-field="sku"]').inputValue(), '9000001', 'A rejected SKU is restored');

    await page.click('#editSpareMessage');
    assert.equal(await page.locator('#editSpareMessage').isHidden(), true, 'A single edit button, hidden while editing');
    await page.fill('#spareMessageInput', 'Express only for the parts in red.');
    await page.click('#saveSpareMessage');
    assert.equal(await page.locator('.spare-message').textContent(), 'Express only for the parts in red.');

    await page.fill('#spareSearch', '');
    await page.locator('#spareList [data-spare-remove]').nth(1).click();
    assert.equal(await page.locator('#spareList tbody tr').count(), seed);

    const exported = await page.evaluate(() => testExport().usExpressSpareParts);
    assert.equal(exported.message, 'Express only for the parts in red.');
    assert.equal(exported.parts.length, seed);
    assert.deepEqual(exported.parts[0], { sku: '9000001', name: 'TEST PART RENAMED' });
    assert.equal(new Set(exported.parts.map(part => part.sku)).size, seed, 'SKUs stay unique');
    assert.equal(await page.evaluate(() => testState.dirty), true);
    assert.deepEqual(errors, []);
    console.log('Spare parts browser OK: seed from Cairm, add, edit, remove, SKU validation, single global message and export.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
