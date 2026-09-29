/* Read-only diagnostics. Availability is evaluated by the generated Cairm engine. */
(function (root) {
  const runtime = typeof module !== 'undefined' && module.exports ? require('./cairm-runtime.js') : root.CairmAuditRuntime;
  const maintenance = typeof module !== 'undefined' && module.exports ? require('./db-maintenance.js') : root.CairmDbMaintenance;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const zones = ['europe', 'usa', 'canada', 'hong_kong_taiwan', 'australia', 'rest_of_world'];
  const statuses = ['yes', 'no', 'temp'];
  const exchangeStatuses = [...statuses, 'retailer', 'us', 'both'];
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  function integrity(db) {
    const issues = [];
    const add = (path, reason) => issues.push({ path, reason });
    const requireObject = (value, path) => {
      if (!object(value)) { add(path, 'Objet absent ou format invalide'); return false; }
      return true;
    };
    if (!requireObject(db, '$')) return issues;
    for (const scope of ['ids', 'countries', 'products']) requireObject(db[scope], scope);
    const ids = object(db.ids) ? db.ids : {};
    for (const scope of ['countries', 'products', 'bundles', 'locations']) requireObject(ids[scope], `ids.${scope}`);
    const reference = (scope, id, path) => { if (!own(ids[scope], id)) add(path, `Référence ${scope} absente : ${id}`); };
    const status = (service, path, allowed = statuses, optional = false) => {
      if (optional && service == null) return;
      if (!object(service)) { add(path, 'Service absent ou format invalide'); return; }
      if (!allowed.includes(service.status)) add(`${path}.status`, 'Disponibilité absente ou invalide');
    };
    const important = (record, path) => {
      const info = record?.temporary_comment;
      if (info == null) return;
      if (!object(info)) { add(`${path}.temporary_comment`, 'Informations importantes : format invalide'); return; }
      if (info.enabled && (!Array.isArray(info.sections) || !info.sections.length || !String(info.comment || '').replace(/<[^>]*>/g, '').trim())) add(`${path}.temporary_comment`, 'Informations importantes activées sans rubrique ou message');
      for (const section of Array.isArray(info.sections) ? info.sections : []) if (!['rma', 'spare_parts', 'paid_rma', 'exchange'].includes(section)) add(`${path}.temporary_comment.sections`, `Rubrique inconnue : ${section}`);
    };
    for (const scope of ['countries', 'products', 'bundles', 'locations']) {
      for (const [id, row] of Object.entries(object(ids[scope]) ? ids[scope] : {})) {
        if (!requireObject(row, `ids.${scope}.${id}`)) continue;
        if (typeof row.name !== 'string' || !row.name.trim()) add(`ids.${scope}.${id}.name`, 'Nom absent ou invalide');
        if (row.aliases != null && !Array.isArray(row.aliases) && typeof row.aliases !== 'string') add(`ids.${scope}.${id}.aliases`, 'Alias : format invalide');
        if (Array.isArray(row.aliases) && row.aliases.some(value => typeof value !== 'string')) add(`ids.${scope}.${id}.aliases`, 'Alias non textuel');
        if (['countries', 'products'].includes(scope) && !object(db[scope]?.[id])) add(`${scope}.${id}`, 'Fiche métier absente ou invalide');
      }
    }
    for (const [id, country] of Object.entries(object(db.countries) ? db.countries : {})) {
      const path = `countries.${id}`;
      reference('countries', id, path);
      if (!requireObject(country, path)) continue;
      if (!zones.includes(country.ga_zone)) add(`${path}.ga_zone`, 'Région absente ou inconnue');
      for (const service of ['rma', 'spare_parts']) {
        status(country[service], `${path}.${service}`);
        const warranty = country[service]?.warranty_duration;
        if (warranty == null || warranty === '') add(`${path}.${service}.warranty_duration`, 'Garantie absente : Cairm affiche N/A, même si le service est No');
        else if (warranty !== 'check_retailer' && (!Number.isFinite(Number(warranty)) || Number(warranty) <= 0)) add(`${path}.${service}.warranty_duration`, 'Durée de garantie invalide');
      }
      for (const service of ['paid_rma', 'exchange']) status(country[service], `${path}.${service}`, statuses, true);
      important(country, path);
    }
    for (const [id, product] of Object.entries(object(db.products) ? db.products : {})) {
      const path = `products.${id}`;
      reference('products', id, path);
      if (!requireObject(product, path)) continue;
      important(product, path);
      if (requireObject(product.zones, `${path}.zones`)) {
        for (const zone of zones) if (!own(product.zones, zone)) add(`${path}.zones.${zone}`, 'Règles régionales absentes');
        for (const [zone, rule] of Object.entries(product.zones)) {
          const at = `${path}.zones.${zone}`;
          if (!zones.includes(zone)) add(at, 'Région inconnue');
          if (!requireObject(rule, at)) continue;
          status(rule.rma, `${at}.rma`);
          status(rule.spare_parts, `${at}.spare_parts`);
          status(rule.exchange, `${at}.exchange`, exchangeStatuses);
          const paid = rule.rma?.paid;
          if (paid != null && !object(paid)) add(`${at}.rma.paid`, 'Réparation payante : format invalide');
          if (paid?.status != null && paid.status !== '') status(paid, `${at}.rma.paid`);
          const priceText = value => value == null ? '' : object(value) ? value.amount == null ? '' : String(value.amount) : String(value).trim();
          const paidEnabled = ['yes', 'temp'].includes(paid?.status) || ((!paid?.status) && !!(paid?.location || priceText(paid?.price)));
          if (['yes', 'temp'].includes(rule.rma?.status) && !rule.rma.location) add(`${at}.rma.location`, 'RMA actif sans centre explicite (vérifier les restrictions pays)');
          if (paidEnabled && !paid?.location) add(`${at}.rma.paid.location`, 'Réparation payante active sans centre explicite (une dérogation pays peut intervenir)');
          if (paidEnabled && !priceText(paid?.price)) add(`${at}.rma.paid.price`, 'Réparation payante active sans prix');
          if (paidEnabled && !priceText(rule.rma?.default_transport_fee)) add(`${at}.rma.default_transport_fee`, 'Frais de transport par défaut non renseignés : vérifier les exceptions pays');
          for (const [field, value] of [['rma.location', rule.rma?.location], ['rma.paid.location', paid?.location]]) {
            if (value && !own(ids.locations, value) && !Object.values(ids.locations || {}).some(row => row?.name === value || row?.aliases?.includes?.(value))) add(`${at}.${field}`, `Centre de réparation inconnu : ${value}`);
          }
          if (rule.exchange?.status === 'yes' && !['retailer', 'us'].includes(rule.exchange.destination)) add(`${at}.exchange.destination`, 'Destination Exchange absente ou inconnue');
          if (rule.rma?.extra_transport_fees != null && !object(rule.rma.extra_transport_fees)) add(`${at}.rma.extra_transport_fees`, 'Exceptions de transport : format invalide');
          for (const cid of Object.keys(rule.rma?.extra_transport_fees || {})) reference('countries', cid, `${at}.rma.extra_transport_fees.${cid}`);
          important(rule, at);
        }
      }
      const sku = product.skus;
      const hasSku = value => object(value) || Array.isArray(value) ? Object.values(value).some(hasSku) : typeof value === 'string' || typeof value === 'number' ? String(value).trim() !== '' : false;
      if (!hasSku(sku)) add(`${path}.skus`, 'Aucun SKU renseigné (ne produit pas une case N/A)');
      if (sku != null && !object(sku)) add(`${path}.skus`, 'SKU : format invalide');
      if (object(sku)) {
        const canonical = ['global', 'regions', 'countries'].some(key => own(sku, key));
        for (const scope of ['regions', 'countries']) if (own(sku, scope) && !object(sku[scope])) add(`${path}.skus.${scope}`, 'Répartition SKU : format invalide');
        const validSku = value => value == null || ['string', 'number'].includes(typeof value) || Array.isArray(value) && value.every(item => ['string', 'number'].includes(typeof item));
        if (own(sku, 'global') && !validSku(sku.global)) add(`${path}.skus.global`, 'SKU global : valeur invalide');
        for (const [scope, values] of canonical ? [['countries', sku.countries], ['regions', sku.regions]] : [['countries', sku]]) {
          for (const [key, value] of Object.entries(object(values) ? values : {})) if (!validSku(value)) add(`${path}.skus.${scope}.${key}`, 'SKU : valeur invalide');
        }
        for (const cid of Object.keys(canonical ? sku.countries || {} : sku)) reference('countries', cid, `${path}.skus.countries.${cid}`);
        for (const zone of Object.keys(sku.regions || {})) if (!zones.includes(zone)) add(`${path}.skus.regions.${zone}`, 'Région SKU inconnue');
      }
    }
    const bundle = (record, path) => {
      if (!requireObject(record, path)) return;
      if (!Array.isArray(record.products) || !record.products.length) add(`${path}.products`, 'Composition absente : bundle non résolu par Cairm');
      for (const id of Array.isArray(record.products) ? record.products : []) reference('products', id, `${path}.products`);
    };
    for (const [id, row] of Object.entries(object(ids.bundles) ? ids.bundles : {})) bundle(row, `ids.bundles.${id}`);
    if (db.activeBundles != null && !Array.isArray(db.activeBundles)) add('activeBundles', 'Liste des bundles actifs invalide');
    const activeIds = new Set();
    for (const row of Array.isArray(db.activeBundles) ? db.activeBundles : []) {
      const at = `activeBundles.${row?.id || '?'}`;
      if (!object(row)) { add(at, 'Bundle actif invalide'); continue; }
      if (activeIds.has(row.id)) add(at, 'Identifiant de bundle actif répété');
      activeIds.add(row.id);
      // Legacy composition text is resolved by Cairm in the N/A scan.
      if (own(row, 'products')) bundle(row, at);
      if (!ids.bundles?.[row.id]) add(at, 'Bundle actif absent de la liste Bundles');
      else if (own(row, 'products') && JSON.stringify(row.products) !== JSON.stringify(ids.bundles[row.id].products)) add(at, 'Composition différente : Cairm utilise le bundle actif');
    }
    for (const [scope, rows] of Object.entries(object(db.checked) ? db.checked : {})) {
      const target = scope === 'skus' ? 'products' : scope;
      if (!own(ids, target)) add(`checked.${scope}`, 'Catégorie de validation inconnue');
      else for (const id of Object.keys(rows || {})) reference(target, id, `checked.${scope}.${id}`);
    }
    try { issues.push(...identities(runtime.create(db)).blockers); }
    catch (error) { add('$', `Moteur Cairm indisponible pour cette structure : ${error.message}`); }
    return issues;
  }

  // Resolve every indexed spelling, including aliases and active bundles. Equivalent
  // spellings are grouped to avoid multiplying identical country/product scenarios.
  function identities(engine) {
    const blockers = [], countries = new Map(), products = new Map();
    for (const [kind, index, resolve, target] of [
      ['countries', engine.rules.countryIndex, engine.resolveCountry, countries],
      ['products', [...engine.rules.productIndex, ...engine.rules.bundleIndex], engine.resolveProduct, products]
    ]) {
      for (const name of new Set(index.map(row => row.key))) {
        const result = resolve(name);
        if (!result || (kind === 'products' && !result.productIds.length)) {
          const matches = index.filter(row => row.key === name);
          for (const match of matches) {
            const scope = kind === 'countries' ? kind : match.type === 'product' ? 'products' : 'bundles';
            const field = result ? 'products' : ['name', 'label_fr', 'labelFr'].find(field => {
              const key = engine.identityKey(match.record?.[field], kind === 'countries' ? 'country' : 'product');
              return key && (key === name || kind === 'countries' && key.replace(/ /g, '') === name);
            }) || 'aliases';
            blockers.push({ path: `ids.${scope}.${match.id}.${field}`, reason: `Nom ambigu ou composition non résolue par Cairm : ${name}`, input: name });
          }
          continue;
        }
        const key = `${result.type || kind}:${result.id}`;
        if (!target.has(key)) target.set(key, { ...result, input: name, aliases: [] });
        target.get(key).aliases.push(name);
      }
    }
    for (const [scope, index] of [['countries', engine.rules.countryIndex], ['products', engine.rules.productIndex], ['bundles', engine.rules.bundleIndex]]) {
      const indexed = new Set(index.map(row => row.id));
      for (const id of Object.keys(engine.rules.ids[scope] || {})) if (!indexed.has(id)) blockers.push({ path: `ids.${scope}.${id}.name`, reason: 'Aucun nom textuel utilisable par Cairm' });
    }
    if (!countries.size) blockers.push({ path: 'ids.countries', reason: 'Aucun pays résolu : aucune combinaison ne peut être testée' });
    if (!products.size) blockers.push({ path: 'ids.products', reason: 'Aucun produit ou bundle résolu : aucune combinaison ne peut être testée' });
    return { countries: [...countries.values()], products: [...products.values()], blockers };
  }

  function hasProductData(record) {
    const hasValue = value => object(value) || Array.isArray(value) ? Object.values(value).some(hasValue) : typeof value === 'string' ? value.trim() !== '' : value != null;
    // Identity, SKU and global notes alone do not provide regional GA rules.
    return object(record?.zones) && Object.values(record.zones).some(rule => object(rule) && hasValue(rule));
  }

  function naCheck(db, progress = () => {}, options = {}) {
    const engine = runtime.create(db);
    const catalog = identities(engine);
    const noData = new Set(Object.keys(db.ids.products || {}).filter(id => !hasProductData(db.products[id])));
    if (options.excludeNoData) catalog.products = catalog.products.filter(selection => selection.type !== 'product' || !noData.has(selection.id));
    const groups = new Map();
    let tested = 0, cells = 0, affected = 0;
    const total = catalog.countries.length * catalog.products.length;
    const labels = { yes: 'Yes', no: 'No', temp: 'Temp', unknown: 'N/A' };
    const add = (path, field, country, selection, detailId) => {
      const key = `${path}|${field}`;
      if (!groups.has(key)) groups.set(key, { path, field, reason: `${field} : N/A`, countries: new Set(), products: new Set(), occurrences: [] });
      const row = groups.get(key);
      row.countries.add(country.id);
      row.products.add(selection.id);
      row.occurrences.push({ field, countryId: country.id, selectionId: selection.id, selectionType: selection.type, detailId: detailId || null });
      cells++;
    };
    for (const country of catalog.countries) {
      for (const selection of catalog.products) {
        const data = engine.resolve(country.input, selection.input);
        if (!data || data.productMissing) throw new Error(`Résolution instable : ${country.input} / ${selection.input}`);
        const before = cells;
        for (const [service, label] of [['rma', 'RMA warranty'], ['spare_parts', 'Spare part warranty']]) {
          const value = engine.formatWarrantyDuration(data.country.rule?.[service]?.warranty_duration);
          if (!value || /^n\/[ad]$/i.test(value.trim())) add(`countries.${country.id}.${service}.warranty_duration`, label, country, selection);
        }
        for (const detail of data.productDetails) {
          if (options.excludeNoData && noData.has(detail.id)) continue;
          const path = `products.${detail.id}.zones.${detail.zone || '(sans région)'}`;
          const values = [
            ['rma', 'RMA', 'rma', engine.getSignalValueLabel(detail.rma.value, labels)],
            ['spare_parts', 'Spare part', 'spareParts', engine.getSignalValueLabel(detail.spareParts.value, labels)],
            ['rma.paid', 'Paid repair', 'paidRma', engine.getSignalValueLabel(detail.rma.paidStatus, labels)],
            ['exchange', 'Exchange', 'exchange', engine.formatServiceExchangeLabel(detail.exchange, labels)]
          ];
          for (const [field, label, override, value] of values) {
            if (!detail.temporaryOverride[override] && /^n\/[ad]$/i.test(String(value).trim())) add(zones.includes(detail.zone) ? `${path}.${field}.status` : `countries.${country.id}.ga_zone`, label, country, selection, detail.id);
          }
        }
        if (cells > before) affected++;
        tested++;
      }
      progress({ tested, total });
    }
    return {
      operation: 'na-check', generatedAt: new Date().toISOString(), databaseUpdatedAt: db.updatedAt || null,
      engineVersion: runtime.version, engineHash: runtime.sourceHash,
      tested, total, cells, affected,
      countries: catalog.countries.map(({ id, input, aliases }) => ({ id, input, aliases })),
      selections: catalog.products.map(({ id, type, input, aliases }) => ({ id, type, input, aliases })),
      blockers: catalog.blockers,
      issues: [...groups.values()].map(row => ({ ...row, countries: [...row.countries], products: [...row.products] }))
    };
  }
  const categories = { 'no-data': 'No data', partial: 'Partial data', 'not-resolved': 'Not Resolved', na: 'N/A', syntax: 'Syntaxe' };
  function valueAt(db, path) {
    const parts = String(path).split('.');
    if (parts[0] === '$') return db;
    let value = db;
    for (const part of parts) value = Array.isArray(value) && !/^\d+$/.test(part) ? value.find(row => row?.id === part) : value?.[part];
    return value;
  }
  function targetFor(db, path) {
    const parts = path.split('.');
    if (parts[0] === 'activeBundles') {
      const id = parts[1];
      return { scope: 'bundles', id, name: db.ids?.bundles?.[id]?.name || db.activeBundles?.find?.(row => row?.id === id)?.name || id || 'Bundles actifs', field: parts.slice(2).join('.') };
    }
    const offset = ['ids', 'checked'].includes(parts[0]) ? 1 : 0;
    const scope = parts[offset] === 'skus' ? 'products' : parts[offset];
    if (['products', 'countries', 'bundles', 'locations'].includes(scope) && parts[offset + 1]) {
      const id = parts[offset + 1];
      return { scope, id, name: String(db.ids?.[scope]?.[id]?.name || id), field: parts.slice(offset + 2).join('.') };
    }
    return { scope: 'database', id: '', name: 'Base de données', field: path };
  }
  function issueCategory(db, issue) {
    const value = valueAt(db, issue.path);
    if (issue.input || /ambigu|résolu|identit|nom textuel|Référence|Centre de réparation inconnu/i.test(issue.reason)) return 'not-resolved';
    if (/\.name$/.test(issue.path) && /Nom absent/.test(issue.reason)) return 'not-resolved';
    if (/Objet absent|Service absent|Fiche métier absente/.test(issue.reason)) return value == null ? 'partial' : 'syntax';
    if (/format invalide|valeur invalide|non textuel|Durée de garantie invalide|Région inconnue|Région SKU inconnue|Rubrique inconnue|répété|Catégorie de validation inconnue|différente/i.test(issue.reason)) return 'syntax';
    if (/absent.*invalide|absente.*invalide|absente ou inconnue/.test(issue.reason) && value != null && value !== '') return 'syntax';
    return 'partial';
  }
  function unresolvedSuggestions(db, row, engine) {
    const steps = [];
    const related = [];
    const { scope, id } = row.target;
    const meta = db.ids?.[scope]?.[id];
    const add = text => steps.push(text);
    if (row.path.startsWith('checked.')) {
      add('Cette validation pointe vers une fiche absente. Utiliser Cleanup pour retirer la validation orpheline ; aucune règle métier ni fiche CRM ne doit être créée pour conserver ce simple marqueur.');
    } else if (/\.location$/.test(row.path)) {
      add('Dans cette fiche DBmanager, sélectionner le centre de réparation correspondant dans la liste des centres existants. Ne pas remplacer un centre inconnu au hasard.');
      add('Si le centre existe sous un autre nom, corriger la référence ou ses alias dans CairmDB ; sinon ajouter sa fiche au référentiel des centres après vérification.');
    } else if (/\.skus\.countries\.|\.extra_transport_fees\./.test(row.path)) {
      add('Réaffecter cette exception SKU ou ces frais au pays existant correspondant dans CairmDB. La clé de pays référencée est absente du référentiel.');
      add('Si le pays manque vraiment, importer son libellé depuis un index CRM en lecture seule, puis compléter sa fiche et utiliser son identifiant CairmDB. Conserver la valeur du SKU ou des frais.');
    } else if (scope === 'bundles' && (row.target.field === 'products' || (db.activeBundles || []).filter?.(bundle => bundle?.id === id)?.length > 1 || row.path.startsWith('activeBundles.'))) {
      add('Vérifier la composition du bundle dans DBmanager : chaque composant doit pointer vers une fiche produit existante et vérifiée. Remplacer les références cassées, ou créer les composants réellement absents.');
      add('Conserver une seule définition active de ce bundle et la même composition dans le référentiel Bundles et les bundles actifs. Ne pas supprimer un composant nécessaire uniquement pour faire disparaître l’erreur.');
      if (meta) related.push({ path: `ids.bundles.${id}.products`, label: `Voir la composition de ${meta.name || id}` });
    } else if (['products', 'countries'].includes(scope) && !meta) {
      add('Cette fiche métier n’a pas d’identité correspondante dans CairmDB. Restaurer son identité avec le libellé CRM exact, ou rattacher les règles à la bonne fiche existante après comparaison.');
      add('Avant toute fusion, conserver les règles, SKU et références de bundles. Les données du CRM restent inchangées.');
    } else {
      const collisions = new Map();
      if (engine && ['products', 'countries', 'bundles'].includes(scope)) {
        const index = scope === 'countries' ? engine.rules.countryIndex : [...engine.rules.productIndex, ...engine.rules.bundleIndex];
        const inputs = new Set([...(row.inputs || []), meta?.name, ...(Array.isArray(meta?.aliases) ? meta.aliases : typeof meta?.aliases === 'string' ? [meta.aliases] : [])].filter(Boolean));
        for (const input of inputs) {
          const key = engine.identityKey(input, scope === 'countries' ? 'country' : 'product');
          let matches = index.filter(entry => entry.key === key);
          const bundles = matches.filter(entry => entry.type !== 'country' && entry.type !== 'product');
          if (bundles.length) matches = bundles;
          const distinct = new Map(matches.map(entry => [`${entry.type === 'country' ? 'countries' : entry.type === 'product' ? 'products' : 'bundles'}:${entry.id}`, entry]));
          if (distinct.size > 1) for (const [key, entry] of distinct) collisions.set(key, entry);
        }
      }
      if (collisions.size) {
        add('Le même libellé ou alias correspond à plusieurs fiches CairmDB. Conserver le libellé exact utilisé par le CRM comme nom ou alias sur la seule fiche qui représente réellement ce produit/pays/bundle ; retirer cet alias des fiches concurrentes.');
        for (const entry of collisions.values()) {
          const otherScope = entry.type === 'country' ? 'countries' : entry.type === 'product' ? 'products' : 'bundles';
          related.push({ path: `ids.${otherScope}.${entry.id}.aliases`, label: `Comparer ${entry.record?.name || entry.id} (${entry.id})` });
        }
        add('S’il s’agit de doublons réels, fusionner d’abord les règles, SKU et références de bundles avant de supprimer la fiche redondante.');
        add('Si le CRM utilise exactement le même nom pour deux produits réellement différents, Cairm ne peut pas les distinguer par ce nom : ne pas choisir arbitrairement une fiche.');
      } else {
        add('Relever le libellé exact affiché dans le CRM, ou importer un index CRM complet en lecture seule. Dans DBmanager, ajouter ce texte comme alias de la fiche correcte, en conservant les autres noms utiles.');
        add('Si aucune fiche ne correspond réellement, créer l’identité et compléter ses règles (ou la composition du bundle). Ne pas associer automatiquement deux modèles dont les noms se ressemblent. Les GUID CRM ne servent pas au rapprochement de Cairm.');
      }
    }
    add('Après vérification, exporter/publier la base corrigée, recharger la DB dans Cairm puis relancer Scan DB. Aucune modification du CRM n’est nécessaire.');
    return { steps, related };
  }
  function scan(db, progress = () => {}) {
    const entries = new Map();
    const noData = new Set(Object.keys(db.ids?.products || {}).filter(id => !hasProductData(db.products?.[id])));
    const add = (issue, category, fixable = false) => {
      const target = targetFor(db, issue.path);
      if (target.scope === 'products' && noData.has(target.id) && ['partial', 'na'].includes(category)) return;
      if (!entries.has(issue.path)) entries.set(issue.path, { path: issue.path, target, categories: [], reasons: [], fixable: false });
      const row = entries.get(issue.path);
      if (!row.categories.includes(category)) row.categories.push(category);
      if (!row.reasons.includes(issue.reason)) row.reasons.push(issue.reason);
      const input = issue.input || issue.name;
      if (input) row.inputs = [...new Set([...(row.inputs || []), input])];
      row.fixable ||= fixable;
      if (issue.occurrences) {
        row.occurrences = [...(row.occurrences || []), ...issue.occurrences];
        row.countries = [...new Set([...(row.countries || []), ...issue.countries])];
        row.products = [...new Set([...(row.products || []), ...issue.products])];
      }
    };
    for (const id of noData) add({ path: `products.${id}`, reason: 'Aucune règle GA renseignée pour ce produit' }, 'no-data');
    for (const issue of integrity(db)) add(issue, issueCategory(db, issue));
    let syntaxFixes = 0;
    const errors = [];
    try {
      const report = maintenance.cleanupSyntax(db).report;
      syntaxFixes = report.changes.length;
      for (const issue of report.changes) add(issue, 'syntax', true);
      for (const issue of report.issues) {
        if (issue.candidates) {
          for (const id of issue.candidates) add({ ...issue, path: `${issue.path}.${id}.aliases` }, 'not-resolved');
        } else add(issue, /Unknown repair|Ambiguous/.test(issue.reason) ? 'not-resolved' : 'syntax');
      }
    } catch (error) {
      errors.push(`Analyse syntaxique : ${error.message}`);
      add({ path: '$', reason: errors[errors.length - 1] }, 'syntax');
    }
    let na = null;
    try {
      na = naCheck(db, progress, { excludeNoData: true });
      for (const issue of na.issues) add(issue, 'na');
      for (const issue of na.blockers) add(issue, 'not-resolved');
    } catch (error) {
      errors.push(`Calcul N/A incomplet : ${error.message}`);
      add({ path: '$', reason: errors[errors.length - 1] }, 'syntax');
    }
    const scopeOrder = { products: 0, countries: 1, bundles: 2, locations: 3, database: 4 };
    const issues = [...entries.values()].sort((a, b) => scopeOrder[a.target.scope] - scopeOrder[b.target.scope] || a.target.name.localeCompare(b.target.name, 'fr', { numeric: true }) || a.target.id.localeCompare(b.target.id) || a.path.localeCompare(b.path));
    let engine;
    if (issues.some(row => row.categories.includes('not-resolved'))) {
      try { engine = runtime.create(db); } catch { /* Guidance remains available for malformed databases. */ }
      for (const row of issues) if (row.categories.includes('not-resolved')) row.suggestions = unresolvedSuggestions(db, row, engine);
    }
    const counts = Object.fromEntries(Object.keys(categories).map(category => [category, issues.filter(row => row.categories.includes(category)).length]));
    return { operation: 'global-scan', generatedAt: new Date().toISOString(), databaseUpdatedAt: db.updatedAt || null,
      engineVersion: runtime.version, engineHash: runtime.sourceHash, complete: !errors.length, errors, counts,
      tested: na?.tested || 0, cells: na?.cells || 0, affected: na?.affected || 0,
      excludedNoDataProducts: [...noData], countries: na?.countries || [], selections: na?.selections || [], syntaxFixes, issues };
  }
  const api = { integrity, naCheck, hasProductData, scan, categories, valueAt, targetFor, unresolvedSuggestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CairmDbAudit = api;
})(globalThis);
