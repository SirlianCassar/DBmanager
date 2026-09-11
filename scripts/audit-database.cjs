#!/usr/bin/env node
// Read-only contract audit; never normalizes or rewrites the supplied database.
const fs = require('node:fs');
const path = require('node:path');
const ZONES = ['europe', 'usa', 'canada', 'hong_kong_taiwan', 'australia', 'rest_of_world'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function audit(db) {
  const issues = [];
  const add = (severity, code, path, value) => issues.push({ severity, code, path, value });
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!object(db)) return { counts: {}, issues: [{ severity: 'error', code: 'invalid-root', path: '$' }] };
  for (const key of ['ids', 'countries', 'products']) if (!object(db[key])) add('error', 'missing-object', key);
  const ids = db.ids || {}, products = db.products || {}, countries = db.countries || {};
  const statuses = {}, missingZones = [], notes = [];
  const checkStatus = (value, allowed, at) => {
    const key = at.includes('exchange') ? 'exchange' : at.includes('.paid.') ? 'paid' : 'service';
    statuses[key] ||= {};
    const label = value == null || value === '' ? '(empty)' : String(value);
    statuses[key][label] = (statuses[key][label] || 0) + 1;
    if (label === '(empty)') add('warning', 'implicit-status', at, value);
    else if (value === 'both' && key === 'exchange') add('warning', 'legacy-both', at, value);
    else if (!allowed.includes(value)) add('error', 'invalid-status', at, value);
  };
  const checkImportant = (record, at) => {
    const info = record?.temporary_comment;
    if (info?.enabled && (!info.comment?.trim() || !info.sections?.length)) add('warning', 'empty-temporary-comment', `${at}.temporary_comment`);
    for (const section of info?.sections || []) if (!['rma', 'spare_parts', 'paid_rma', 'exchange'].includes(section)) add('error', 'invalid-temporary-section', `${at}.temporary_comment.sections`, section);
  };
  const reference = (scope, id, at) => { if (id && !ids[scope]?.[id]) add('error', 'missing-reference', at, id); };
  for (const [id, country] of Object.entries(countries)) {
    reference('countries', id, `countries.${id}`);
    if (!ZONES.includes(country.ga_zone)) add('error', 'invalid-zone', `countries.${id}.ga_zone`, country.ga_zone);
    for (const service of ['rma', 'spare_parts']) checkStatus(country[service]?.status, ['yes', 'no', 'temp'], `countries.${id}.${service}.status`);
    for (const service of ['paid_rma', 'exchange']) if (country[service]) checkStatus(country[service].status, ['yes', 'no', 'temp'], `countries.${id}.${service}.status`);
    checkImportant(country, `countries.${id}`);
  }
  for (const id of Object.keys(ids.countries || {})) if (!countries[id]) add('warning', 'missing-country-record', `countries.${id}`);
  for (const id of Object.keys(ids.products || {})) {
    const product = products[id];
    if (!product) add('warning', 'missing-product-record', `products.${id}`);
    for (const zone of ZONES) if (!product?.zones?.[zone]) missingZones.push(`${id}.${zone}`);
  }
  for (const [id, product] of Object.entries(products)) {
    reference('products', id, `products.${id}`);
    checkImportant(product, `products.${id}`);
    for (const [zone, rule] of Object.entries(product.zones || {})) {
      const at = `products.${id}.zones.${zone}`;
      checkImportant(rule, at);
      if (!ZONES.includes(zone)) add('error', 'invalid-zone', at);
      for (const service of ['rma', 'spare_parts']) checkStatus(rule[service]?.status, ['yes', 'no', 'temp'], `${at}.${service}.status`);
      checkStatus(rule.exchange?.status, ['yes', 'retailer', 'us', 'no', 'temp'], `${at}.exchange.status`);
      const paid = rule.rma?.paid;
      if (paid?.status) checkStatus(paid.status, ['yes', 'no', 'temp'], `${at}.rma.paid.status`);
      reference('locations', rule.rma?.location, `${at}.rma.location`);
      reference('locations', paid?.location, `${at}.rma.paid.location`);
      if (paid?.status === 'no' && (paid.location || paid.price)) add('warning', 'inactive-paid-details', `${at}.rma.paid`);
      for (const countryId of Object.keys(rule.rma?.extra_transport_fees || {})) reference('countries', countryId, `${at}.rma.extra_transport_fees.${countryId}`);
      if (rule.note?.trim()) notes.push(`${id}.${zone}`);
    }
    const skus = product.skus || {};
    const canonical = ['global', 'regions', 'countries'].some(key => Object.hasOwn(skus, key));
    for (const countryId of Object.keys(canonical ? skus.countries || {} : skus)) reference('countries', countryId, `products.${id}.skus.${countryId}`);
    for (const zone of Object.keys(skus.regions || {})) if (!ZONES.includes(zone)) add('error', 'invalid-sku-zone', `products.${id}.skus.regions.${zone}`);
  }
  for (const [id, bundle] of Object.entries(ids.bundles || {})) for (const productId of bundle.products || []) reference('products', productId, `ids.bundles.${id}.products`);
  for (const bundle of db.activeBundles || []) {
    for (const id of bundle.products || []) reference('products', id, `activeBundles.${bundle.id}.products`);
    const canonical = ids.bundles?.[bundle.id];
    if (!canonical || JSON.stringify(canonical.products) !== JSON.stringify(bundle.products)) add('warning', 'bundle-divergence', `activeBundles.${bundle.id}`);
  }
  for (const scope of ['products', 'countries']) {
    const names = new Map();
    for (const [id, record] of Object.entries(ids[scope] || {})) for (const name of [record.name, ...(record.aliases || [])]) {
      const key = normalize(name); if (!key) continue;
      if (!names.has(key)) names.set(key, new Set()); names.get(key).add(id);
    }
    for (const [key, matches] of names) if (matches.size > 1) add('warning', 'name-collision', `ids.${scope}`, { key, ids: [...matches] });
  }
  return { counts: { countries: Object.keys(countries).length, productIds: Object.keys(ids.products || {}).length, products: Object.keys(products).length, bundles: Object.keys(ids.bundles || {}).length, missingZones: missingZones.length, regionalNotes: notes.length, errors: issues.filter(x => x.severity === 'error').length, warnings: issues.filter(x => x.severity === 'warning').length }, statuses, missingZones, regionalNotes: notes, issues };
}
module.exports = { audit };
if (require.main === module) {
  const file = path.resolve(process.argv[2] || path.join(__dirname, '../cairm-full-database.json'));
  try {
    const report = audit(JSON.parse(fs.readFileSync(file, 'utf8')));
    console.log(JSON.stringify({ file, ...report }, null, 2));
    process.exitCode = report.issues.some(x => x.severity === 'error') ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
