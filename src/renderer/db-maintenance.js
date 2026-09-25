/* Pure, additive catalogue import and conservative database maintenance. */
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const guid = /^\{?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}?$/i;
  function key(value, country = false) {
    let valueKey = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u2010-\u2015\u2212]/g, '-');
    if (country) {
      valueKey = valueKey.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
      if (["etats unis", "etats unis d'amerique", 'united states', 'united states of america', 'usa'].includes(valueKey)) valueKey = 'united states';
      valueKey = valueKey.replace(/ /g, '');
    }
    return valueKey;
  }
  function names(record, id) {
    return [record?.name, record?.label_fr, record?.labelFr, ...(Array.isArray(record?.aliases) ? record.aliases : typeof record?.aliases === 'string' ? [record.aliases] : [])]
      .filter(value => typeof value === 'string' && value.trim() && value !== id && !guid.test(value.trim()));
  }
  function importIndex(input, catalog) {
    if (!object(input?.ids)) throw new Error('Load a database first');
    if (catalog?.format !== 'cairm-crm-index' || catalog.formatVersion !== 1 || typeof catalog.complete !== 'boolean' || !Array.isArray(catalog.countries) || !Array.isArray(catalog.products)) throw new Error('Expected a Cairm CRM index export (version 1)');
    for (const row of [...catalog.countries, ...catalog.products]) if (!object(row) || typeof row.name !== 'string' || !row.name.trim()) throw new Error('Invalid index entry: every entry must have a name');
    const db = copy(input);
    for (const scope of ['countries', 'products', 'bundles']) db.ids[scope] ||= {};
    const report = { operation: 'import-crm-index', partial: !catalog.complete, added: [], existing: [], issues: [], errors: catalog.errors || [] };
    const maps = {};
    for (const scope of ['countries', 'products', 'bundles']) {
      maps[scope] = new Map();
      for (const [id, record] of Object.entries(db.ids[scope])) for (const name of names(record, id)) {
        const k = key(name, scope === 'countries');
        if (!maps[scope].has(k)) maps[scope].set(k, new Set());
        maps[scope].get(k).add(id);
      }
    }
    for (const bundle of db.activeBundles || []) {
      if (!bundle?.id || own(db.ids.bundles, bundle.id)) continue;
      for (const name of names(bundle, bundle.id)) {
        const k = key(name);
        if (!maps.bundles.has(k)) maps.bundles.set(k, new Set());
        maps.bundles.get(k).add(bundle.id);
      }
    }
    function nextId(scope, prefix) {
      // Reserve identifiers appearing in rules as well as the identity directory.
      const used = new Set([...Object.keys(db.ids[scope]), ...Object.keys(db[scope] || {}), ...(db.activeBundles || []).map(row => row.id)]);
      let number = Math.max(0, ...[...used].filter(id => new RegExp(`^${prefix}\\d+$`).test(id)).map(id => Number(id.slice(1)))) + 1;
      while (used.has(`${prefix}${String(number).padStart(3, '0')}`)) number++;
      return `${prefix}${String(number).padStart(3, '0')}`;
    }
    for (const kind of ['countries', 'products']) for (const row of catalog[kind]) {
      const name = row.name.trim(), k = key(name, kind === 'countries');
      if (!k || guid.test(name)) { report.issues.push({ name, reason: 'Invalid textual name' }); continue; }
      if (row.type === 'family') { report.issues.push({ name, reason: 'CRM product family: not a product or bundle' }); continue; }
      const bundleMatches = kind === 'products' ? maps.bundles.get(k) : null;
      const matches = bundleMatches?.size ? bundleMatches : maps[kind].get(k);
      if (kind === 'products' && row.type === 'bundle' && !bundleMatches?.size && matches?.size) {
        report.issues.push({ name, reason: 'CRM bundle matches an existing product: review its type and composition', candidates: [...matches] });
        continue;
      }
      if (matches?.size) {
        if (matches.size > 1) report.issues.push({ name, reason: 'Ambiguous name', candidates: [...matches] });
        else report.existing.push({ name, id: [...matches][0] });
        continue;
      }
      const scope = kind === 'countries' ? 'countries' : row.type === 'bundle' ? 'bundles' : 'products';
      const id = nextId(scope, { countries: 'C', products: 'P', bundles: 'B' }[scope]);
      db.ids[scope][id] = { name, aliases: [name], ...(scope === 'bundles' ? { products: [] } : {}) };
      maps[scope].set(k, new Set([id]));
      report.added.push({ scope, id, name });
    }
    // No business records, SKU values, default statuses or CRM GUID matching are created.
    return { db, report };
  }
  function sanitize(input) {
    if (!object(input?.ids)) throw new Error('Load a database first');
    const db = copy(input), report = { operation: 'sanitize-db', changes: [], issues: [] };
    const change = (path, reason) => report.changes.push({ path, reason });
    const placeholder = value => /^check[ _-]*here[.!]?$/i.test(String(value || '').trim());
    // Only identity metadata proven unused by both applications is discarded.
    for (const scope of ['countries', 'products', 'bundles', 'locations']) for (const [id, record] of Object.entries(db.ids[scope] || {})) {
      if (!object(record)) continue;
      for (const field of ['_source', 'crm_id', 'crm_ids']) if (own(record, field)) { delete record[field]; change(`ids.${scope}.${id}.${field}`, 'Unused import metadata / CRM GUID'); }
      if (own(record, 'aliases')) {
        const aliases = [...new Set((Array.isArray(record.aliases) ? record.aliases : [record.aliases]).filter(value => typeof value === 'string' && value.trim() && !guid.test(value.trim()) && value !== id).map(value => value.trim()))];
        if (JSON.stringify(aliases) !== JSON.stringify(record.aliases)) { record.aliases = aliases; change(`ids.${scope}.${id}.aliases`, 'Empty, technical or duplicate alias'); }
      }
    }
    const locations = db.ids.locations || {};
    const placeholders = new Set(Object.entries(locations).filter(([, row]) => placeholder(row.name)).map(([id]) => id));
    function walk(value, path = '') {
      if (!object(value) && !Array.isArray(value)) return;
      for (const [field, child] of Object.entries(value)) {
        const at = path ? `${path}.${field}` : field;
        if (at === 'ids.locations') continue;
        if (field === 'location' && (placeholders.has(child) || placeholder(child))) { delete value[field]; change(at, 'CHECK HERE is not a repair centre; destination left missing'); continue; }
        if (field === 'status' && child === 'temp') report.issues.push({ path: at, reason: 'Legacy temporary status still affects service availability; review manually' });
        if (field === 'status' && child === 'both' && path.endsWith('.exchange')) { value[field] = 'retailer'; change(at, 'Legacy both has the same Retailer meaning'); }
        if (field === 'location' && typeof child === 'string' && child && !own(locations, child) && !Object.values(locations).some(row => names(row, '').some(name => key(name) === key(child)))) report.issues.push({ path: at, reason: 'Unknown repair centre retained', value: child });
        walk(value[field], at);
      }
    }
    walk(db);
    // Search every remaining value outside the location directory before declaring a centre unused.
    const references = new Set();
    function collect(value, path = '') {
      if (typeof value === 'string') references.add(key(value));
      else if (object(value) || Array.isArray(value)) for (const [field, child] of Object.entries(value)) {
        const at = path ? `${path}.${field}` : field;
        if (at !== 'ids.locations') collect(child, at);
      }
    }
    collect(db);
    for (const [id, record] of Object.entries(locations)) {
      if (![id, ...names(record, id)].some(name => references.has(key(name)))) { delete locations[id]; change(`ids.locations.${id}`, placeholders.has(id) ? 'Unused CHECK HERE placeholder' : 'Unreferenced repair centre'); }
      else if (placeholders.has(id)) report.issues.push({ path: `ids.locations.${id}`, reason: 'Placeholder still referenced outside a location field; review manually' });
    }
    for (const [scope, flags] of Object.entries(db.checked || {})) {
      if (!object(flags)) continue;
      const records = db.ids[scope === 'skus' ? 'products' : scope];
      if (!records) continue;
      for (const id of Object.keys(flags)) if (!own(records, id)) { delete flags[id]; change(`checked.${scope}.${id}`, 'Orphan verification flag'); }
    }
    for (const scope of ['countries', 'products', 'bundles']) {
      const aliases = new Map();
      for (const [id, record] of Object.entries(db.ids[scope] || {})) for (const name of names(record, id)) {
        const k = key(name, scope === 'countries');
        if (!aliases.has(k)) aliases.set(k, new Set());
        aliases.get(k).add(id);
      }
      for (const [name, ids] of aliases) if (ids.size > 1) report.issues.push({ path: `ids.${scope}`, name, reason: 'Ambiguous name retained', candidates: [...ids] });
    }
    // Keep identities without rules, notes, unknown extensions and incomplete bundles.
    return { db, report };
  }
  const api = { importIndex, sanitize, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CairmDbMaintenance = api;
})(globalThis);
