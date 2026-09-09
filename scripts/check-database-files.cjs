const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { assertDatabaseContent, readDatabaseFile, writeDatabaseFile } = require('../database-files.cjs');
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cairmdb-files-'));
  try {
    const target = path.join(directory, 'database.json');
    const json = JSON.stringify({ ids: {}, countries: {}, products: {} });
    for (const invalid of ['{', 'null', '[]', '{}']) assert.throws(() => assertDatabaseContent(invalid));
    await writeDatabaseFile(target, json);
    assert.equal(await readDatabaseFile(target), json);
    await assert.rejects(writeDatabaseFile(target, '{'));
    assert.equal(await fs.readFile(target, 'utf8'), json, 'Invalid export cannot destroy the existing file');
    const updated = JSON.stringify({ ids: {}, countries: {}, products: {}, version: 'test' });
    await writeDatabaseFile(target, updated);
    assert.equal(await readDatabaseFile(target), updated);
    assert.deepEqual(await fs.readdir(directory), ['database.json'], 'No temporary file remains');
    console.log('Database files OK: JSON structure, atomic replacement and preservation after invalid writes.');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
