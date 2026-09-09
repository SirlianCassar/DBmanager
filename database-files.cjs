// Database file boundary: validate before writing and replace only after a full write.
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const MAX_DATABASE_BYTES = 25 * 1024 * 1024;

function assertDatabaseContent(json) {
  if (typeof json !== 'string' || !json.trim()) throw new Error('CairmDB content must be non-empty JSON.');
  if (Buffer.byteLength(json, 'utf8') > MAX_DATABASE_BYTES) throw new Error('The CairmDB file exceeds the 25 MB limit.');
  const db = JSON.parse(json);
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('CairmDB must be a JSON object.');
  for (const field of ['ids', 'countries', 'products']) {
    if (!db[field] || typeof db[field] !== 'object' || Array.isArray(db[field])) throw new Error(`CairmDB ${field} must be an object.`);
  }
}

async function readDatabaseFile(filePath) {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_DATABASE_BYTES) throw new Error('The CairmDB file exceeds the 25 MB limit.');
  const json = await fs.readFile(filePath, 'utf8');
  assertDatabaseContent(json);
  return json;
}

async function writeDatabaseFile(filePath, json) {
  assertDatabaseContent(json);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(json, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temporaryPath, { force: true });
  }
}
module.exports = { assertDatabaseContent, readDatabaseFile, writeDatabaseFile };
