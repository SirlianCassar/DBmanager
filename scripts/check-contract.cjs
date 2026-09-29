const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { audit } = require('./audit-database.cjs');
const source = fs.readFileSync(require.resolve('../src/renderer/index.html'), 'utf8');
new vm.Script(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
const locations = { L001: { name: 'First' }, L005: { name: 'CHECK HERE' }, L006: { name: 'Carentoir' } };
const context = vm.createContext({ text: value => String(value || '').trim(), normalize: value => String(value || '').toLowerCase(), esc: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), label: value => value === "check_retailer" ? "Check with retailer" : String(value), ids: () => locations, feeToText: value => value == null ? '' : String(value) });
for (const name of ['resolveLocationId', 'locationOptions', 'paidDisplayStatus', 'serviceToggleHtml', 'warrantyOptions', 'defaultZone', 'defaultCountryRecord', 'zoneForDisplay', 'exchangeDisplayStatus']) {
  const start = source.indexOf(`      function ${name}(`);
  const end = source.indexOf('\n      }', start) + 8;
  vm.runInContext(source.slice(start, end), context);
}
assert.match(context.locationOptions('L006'), /value="L006" selected/);
assert.match(context.locationOptions('L005'), /value="L005" selected/);
assert.match(context.locationOptions('Carentoir'), /value="L006" selected/);
assert.match(context.locationOptions('L999'), /value="L999" selected/);
assert.equal(context.paidDisplayStatus({ status: 'temp', price: 25 }), 'temp');
assert.equal(context.paidDisplayStatus({ status: 'no', price: 25 }), 'no');
assert.equal(context.paidDisplayStatus({ price: 25 }), 'yes');
assert.match(context.serviceToggleHtml('rma', 'temp'), /value="temp" selected disabled>Temporary \(legacy\)<\/option>/);
assert.match(context.warrantyOptions('check_retailer'), /value="check_retailer" selected/);
assert.match(context.warrantyOptions(null), /value="" selected>N\/A/);
assert.match(context.warrantyOptions(7), /value="7" selected/);
const bad = { ids: { products: { P1: { name: 'Shared' }, P2: { name: 'Shared' } }, countries: {}, bundles: {} }, countries: {}, products: { P1: { zones: { europe: { rma: { status: 'maybe', location: 'L999' }, spare_parts: { status: 'yes' }, exchange: { status: 'both' } } } } } };
const report = audit(bad);
for (const code of ['invalid-status', 'missing-reference', 'missing-product-record', 'legacy-both', 'name-collision']) assert(report.issues.some(issue => issue.code === code), code);
assert.equal(report.counts.missingZones, 11);
assert.equal(audit(null).issues[0].code, 'invalid-root');
console.log('DBmanager contract OK: syntax, locations, temporary state, paid inference and invalid-data diagnostics.');

for (const name of ['rma', 'spare_parts', 'paid_rma', 'exchange']) assert.equal(context.defaultCountryRecord()[name].status, 'no');
const fresh = context.defaultZone();
for (const service of [fresh.rma, fresh.spare_parts, fresh.rma.paid, fresh.exchange]) assert.equal(service.status, 'no');
assert.equal(context.paidDisplayStatus(context.zoneForDisplay({ rma: { paid: { price: 25 } } }).rma.paid), 'yes');
for (const status of ['temp', 'no', 'yes']) assert.equal(context.zoneForDisplay({ rma: { paid: { status } } }).rma.paid.status, status);
assert.equal(context.exchangeDisplayStatus({ status: 'both' }), 'yes');
assert.equal(context.exchangeDisplayStatus({ status: 'temp' }), 'temp');
assert.doesNotMatch(context.serviceToggleHtml('rma', 'yes'), /value="temp"/);
assert.doesNotMatch(context.serviceToggleHtml('rma', 'no'), /value="temp"/);
console.log('Editor availability OK: explicit new defaults, legacy Temp preserved, inferred paid availability preserved.');

// Incomplete records: the Home counters and the "Missing values" filter must select
// exactly what leaves the extension on N/D, and nothing that merely looks unusual.
const completeness = vm.createContext({
  ZONES: ['europe', 'usa', 'canada', 'hong_kong_taiwan', 'australia', 'rest_of_world'],
  STATUS: ['yes', 'no', 'temp'],
  EXCHANGE_STATUS_KNOWN: ['retailer', 'us', 'temp', 'no', 'yes', 'both'],
  state: { listFilters: { products: {} } },
  isChecked: () => false
});
for (const name of ['getCountryDataState', 'getProductDataState', 'hasProductGaData', 'matchesListFilters']) {
  const start = source.indexOf(`      function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(source.slice(start, source.indexOf('\n      }', start) + 8), completeness);
}
const fullZone = () => ({ rma: { status: 'yes' }, spare_parts: { status: 'no' }, exchange: { status: 'retailer' } });
const allZones = () => Object.fromEntries(completeness.ZONES.map(zone => [zone, fullZone()]));
assert.equal(completeness.getProductDataState({ zones: allZones() }), 'complete');
assert.equal(completeness.getProductDataState(null), 'empty');
assert.equal(completeness.getProductDataState({ skus: { global: 'X' } }), 'empty', 'SKUs alone are not GA data');
for (const [field, value] of [['rma', {}], ['spare_parts', {}], ['exchange', {}], ['exchange', { status: '' }]]) {
  const zones = allZones();
  zones.europe[field] = value;
  assert.equal(completeness.getProductDataState({ zones }), 'partial', `${field} without a status is partial`);
}
// Exchange keeps its own vocabulary; a destination is a filled status, not a gap.
for (const status of ['retailer', 'us', 'both', 'temp', 'no', 'yes']) {
  const zones = allZones();
  zones.europe.exchange = { status };
  assert.equal(completeness.getProductDataState({ zones }), 'complete', `exchange ${status}`);
}
const missingZone = allZones();
delete missingZone.australia;
assert.equal(completeness.getProductDataState({ zones: missingZone }), 'partial', 'A zone with no block is partial');
const country = extra => ({ ga_zone: 'europe', rma: { status: 'yes', warranty_duration: 2 }, spare_parts: { status: 'no', warranty_duration: 'check_retailer' }, ...extra });
assert.equal(completeness.getCountryDataState(country()), 'complete');
assert.equal(completeness.getCountryDataState(country({ ga_zone: 'elsewhere' })), 'partial');
assert.equal(completeness.getCountryDataState(country({ rma: { status: '', warranty_duration: 2 } })), 'partial');
assert.equal(completeness.getCountryDataState(country({ rma: { status: 'yes' } })), 'partial', 'A missing warranty is partial');
assert.equal(completeness.getCountryDataState(null), 'empty');
// The filter is a union, and an incomplete record is not an empty one.
completeness.state.listFilters.products = { validated: false, unvalidated: false, empty: false, incomplete: true };
assert.equal(completeness.matchesListFilters('products', 'P1', { empty: false, incomplete: true }), true);
assert.equal(completeness.matchesListFilters('products', 'P1', { empty: true, incomplete: false }), false);
completeness.state.listFilters.products = { validated: false, unvalidated: false, empty: false, incomplete: false };
assert.equal(completeness.matchesListFilters('products', 'P1', { incomplete: true }), true, 'No active filter shows everything');
console.log('Completeness OK: N/D-producing gaps detected, exchange vocabulary respected, filter union and empty/incomplete kept apart.');

// Missing-value highlighting and the Cleanup exclusion list.
const marking = vm.createContext({ state: { listFilters: {} }, CLEANUP_HIDDEN_REASONS: null });
for (const name of ['highlightMissingFor', 'missingAttr', 'warrantyIsMissing', 'cleanupVisibleIssues']) {
  const start = source.indexOf(`      function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(source.slice(start, source.indexOf('\n      }', start) + 8), marking);
}
const hidden = source.match(/const CLEANUP_HIDDEN_REASONS = (\[[^\]]*\]);/);
assert(hidden, 'CLEANUP_HIDDEN_REASONS');
vm.runInContext(`CLEANUP_HIDDEN_REASONS = ${hidden[1]};`, marking);
// The ring only appears while the filter is on, so normal editing stays unchanged.
marking.state.listFilters = { countries: { incomplete: false }, products: { incomplete: true } };
assert.equal(marking.highlightMissingFor('countries'), false);
assert.equal(marking.highlightMissingFor('products'), true);
assert.equal(marking.highlightMissingFor('skus'), false, 'A scope without the filter never highlights');
assert.equal(marking.missingAttr(true), ' data-missing="1"');
assert.equal(marking.missingAttr(false), '');
// Cairm renders warranties even when service availability is No.
assert.equal(marking.warrantyIsMissing({ status: 'no' }), true);
assert.equal(marking.warrantyIsMissing({ status: 'yes', warranty_duration: 2 }), false);
assert.equal(marking.warrantyIsMissing({ status: 'yes', warranty_duration: 'check_retailer' }), false);
assert.equal(marking.warrantyIsMissing({ status: 'yes' }), true);
assert.equal(marking.warrantyIsMissing({ status: 'temp', warranty_duration: 0 }), true);
// Homonyms remain visible in Cleanup because they can block CRM resolution.
const issues = [{ reason: 'Ambiguous name retained', name: 'Twin' }, { reason: 'Unknown repair centre retained' }];
// Arrays built inside the VM are cross-realm, so compare their contents, not their identity.
assert.equal(marking.cleanupVisibleIssues(issues).map(row => row.reason).join('|'), 'Ambiguous name retained|Unknown repair centre retained');
assert.equal(marking.cleanupVisibleIssues(undefined).length, 0);
assert(maintenanceSanitizeReportsAmbiguity(), 'sanitize must still detect homonyms');
function maintenanceSanitizeReportsAmbiguity() {
  const twins = { ids: { countries: {}, products: { P1: { name: 'Twin' }, P2: { name: 'Twin' } }, bundles: {} }, countries: {}, products: {} };
  return require('../src/renderer/db-maintenance.js').sanitize(twins).report.issues.some(row => row.reason === 'Ambiguous name retained');
}
console.log('Missing-value marking OK: filter-gated highlight, warranty gaps even on No, homonyms visible in cleanup.');
