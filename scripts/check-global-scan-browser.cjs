const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const zones = ['europe', 'usa', 'canada', 'hong_kong_taiwan', 'australia', 'rest_of_world'];
    const rule = () => ({ rma: { status: 'no', paid: { status: 'no' } }, spare_parts: { status: 'no' }, exchange: { status: 'no' } });
    const product = () => ({ skus: { global: 'SKU' }, zones: Object.fromEntries(zones.map(zone => [zone, rule()])) });
    const db = {
      ids: { countries: { C1: { name: 'France' } }, products: { P0: { name: 'Empty' }, P1: { name: 'A device', _source: { file: 'legacy' } }, P2: { name: 'Shared' }, P3: { name: 'Other', aliases: ['Shared'] } }, bundles: {}, locations: {} },
      countries: { C1: { ga_zone: 'europe', rma: { status: 'yes', warranty_duration: 2 }, spare_parts: { status: 'yes', warranty_duration: 2 } } },
      products: { P0: { skus: { global: 'SKU only' } }, P1: product(), P2: product(), P3: product() }
    };
    db.products.P1.zones.europe.exchange.status = '';
    db.products.P1.zones.europe.rma.paid = { status: 'yes' };
    db.products.P1.zones.canada.exchange.status = 'both';
    delete db.products.P1.zones.usa;
    for (let index = 0; index < 55; index++) {
      const id = `F${index}`;
      db.ids.products[id] = { name: `Filler ${String(index).padStart(2, '0')}`, _source: { file: 'legacy' } };
      db.products[id] = product();
    }
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
    const scan = async () => {
      await page.click('#scanDb');
      await page.waitForFunction(() => document.querySelector('#auditStatus').textContent.startsWith('Scan DB terminé'));
    };
    const filter = async selected => {
      for (const key of ['no-data', 'partial', 'not-resolved', 'na', 'syntax']) {
        const button = page.locator(`[data-audit-filter="${key}"]`);
        if ((await button.getAttribute('aria-pressed') === 'true') !== selected.includes(key)) await button.click();
      }
    };
    const rows = page.locator('#auditReport tbody tr[data-audit-path]');
    await scan();
    assert.equal(await page.locator('[data-audit-filter]').count(), 5);
    assert.equal(await page.evaluate(() => JSON.stringify(testState.db)), before);
    assert.equal(await rows.count(), 50, 'Table pagination');
    assert.equal(await page.locator('#auditNext').isEnabled(), true);
    await page.click('#auditNext');
    assert.match(await page.locator('#auditPage').textContent(), /2 \/ 2/);
    await filter(['no-data']);
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.first().getAttribute('data-audit-path'), 'products.P0');
    await rows.first().locator('button').click();
    assert.equal(await page.locator('#initProductZone.audit-field-focus').count(), 1);
    await page.click('#tab-cleanup');
    await filter([]);
    assert.equal(await rows.count(), 0);
    await filter(['na']);
    assert.equal(await rows.count(), 1, 'No data product is excluded');
    assert.equal(await rows.first().getAttribute('data-audit-path'), 'products.P1.zones.europe.exchange.status');
    await rows.first().locator('button').click();
    assert.equal(await page.locator('#productEditor [data-service="exchange"].audit-field-focus').count(), 1);
    assert.equal(await page.evaluate(() => testState.selectedZone), 'europe');
    await page.click('#tab-cleanup');
    await filter(['partial', 'na']);
    assert.equal(await page.locator('tr[data-audit-path="products.P1.zones.europe.exchange.status"]').count(), 1, 'Overlapping categories merge, not duplicate');
    await page.locator('#auditSearch').fill('rma.paid.price');
    assert.equal(await rows.count(), 1);
    await rows.first().locator('button').click();
    assert.equal(await page.locator('#productEditor [data-product-field="rma.paid.price"].audit-field-focus').count(), 1);
    await page.click('#tab-cleanup');
    await page.locator('#auditSearch').fill('');
    await filter(['not-resolved']);
    assert(await rows.count() >= 2);
    await page.locator('tr[data-audit-path="ids.products.P3.aliases"] [data-audit-open]').click();
    assert.equal(await page.locator('#auditFieldDialog').isVisible(), true);
    assert.match(await page.locator('#auditFieldValue.audit-field-focus').textContent(), /Shared/);
    await page.click('#closeAuditField');
    await page.click('#tab-cleanup');
    await filter(['syntax']);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportAudit');
    const report = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
    assert.equal(report.operation, 'global-scan');
    assert.equal(report.counts['no-data'], 1, 'Export covers all diagnostics regardless of filters');
    assert(!report.issues.some(row => row.target.id === 'P0' && row.categories.includes('na')));
    await page.screenshot({ path: '/tmp/cairmdb-global-scan.png' });
    await page.click('#sanitizeDb');
    await page.waitForFunction(() => document.querySelector('#auditStatus').textContent.startsWith('Scan DB terminé'));
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.canada.exchange.status), 'retailer');
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.europe.exchange.status), '', 'Cleanup preserves missing decisions');
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.usa), undefined);
    assert.equal(await page.evaluate(() => testState.db.ids.products.P1._source), undefined);
    assert.equal(await page.locator('#sanitizeDb').isVisible(), false, 'No syntax work remains');
    await page.click('#cancelCleanup');
    assert.equal(await page.evaluate(() => testState.db.products.P1.zones.canada.exchange.status), 'both');
    assert.deepEqual(await page.evaluate(() => testState.db.ids.products.P1._source), { file: 'legacy' });
    assert.deepEqual(errors, []);
    console.log('Global scan UI OK: five filters, union, No data exclusion, pagination, full export, field highlighting, safe cleanup/rescan and undo.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
