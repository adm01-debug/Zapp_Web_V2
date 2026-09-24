import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// libpq does not expand a URI supplied through the PGDATABASE default.
// Callers must validate project identity/TLS before calling this transport.
const QUERY_ENV = new Map([
  ['sslmode', 'PGSSLMODE'], ['sslrootcert', 'PGSSLROOTCERT'],
  ['connect_timeout', 'PGCONNECT_TIMEOUT'], ['application_name', 'PGAPPNAME'],
  ['options', 'PGOPTIONS'], ['channel_binding', 'PGCHANNELBINDING'],
  ['target_session_attrs', 'PGTARGETSESSIONATTRS'],
]);

export function parseConnection(connectionString) {
  try {
    const url = new URL(connectionString);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !host || !user || !database
      || url.hash || [host, user, password, database].some(value => /[\r\n\0]/.test(value))) {
      throw new Error();
    }
    const fields = { PGHOST: host, PGPORT: url.port || '5432', PGUSER: user,
      PGDATABASE: database, PGCONNECT_TIMEOUT: '10' };
    const seen = new Set();
    for (const [key, value] of url.searchParams) {
      // Reject alternate host/user/dbname/service/password and duplicate options.
      if (!QUERY_ENV.has(key) || seen.has(key) || /[\r\n\0]/.test(value)) throw new Error();
      seen.add(key);
      fields[QUERY_ENV.get(key)] = value;
    }
    return { fields, password };
  } catch {
    throw new Error('Invalid or unsupported PostgreSQL connection parameters (details omitted)');
  }
}

/** Synchronous child-process scope. No password/URI in argv or child environment. */
export function withPsqlEnvironment(connectionString, callback, { baseEnv = process.env, tempRoot = os.tmpdir() } = {}) {
  const { fields, password } = parseConnection(connectionString);
  const env = Object.fromEntries(Object.entries(baseEnv)
    .filter(([key]) => !key.startsWith('PG') && key !== 'DESTINO_URL'));
  const directory = fs.mkdtempSync(path.join(tempRoot, 'zapp-psql-'));
  const passwordFile = path.join(directory, 'pgpass');
  try {
    fs.chmodSync(directory, 0o700);
    const escape = value => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    const line = [fields.PGHOST, fields.PGPORT, fields.PGDATABASE, fields.PGUSER, password]
      .map(escape).join(':');
    fs.writeFileSync(passwordFile, `${line}\n`, { flag: 'wx', mode: 0o600 });
    return callback({ ...env, ...fields, PGPASSFILE: passwordFile });
  } finally {
    // Only the exact file/directory created above; never recursive cleanup.
    fs.rmSync(passwordFile, { force: true });
    fs.rmdirSync(directory);
  }
}
