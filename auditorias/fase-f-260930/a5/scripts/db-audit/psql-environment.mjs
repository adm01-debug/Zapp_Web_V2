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

// Falhas que acontecem ANTES de qualquer statement chegar ao servidor: o
// comando nao teve efeito, logo repetir e' seguro mesmo para um callback que
// escreveria. Deliberadamente nao inclui erro de autenticacao/autorizacao
// (pg_hba, senha, role) nem erro de SQL: esses sao deterministicos e repetir
// so' atrasaria a falha. Um drift detectado tampouco passa por aqui — ele e'
// resultado de uma consulta que teve sucesso.
// Mantida em sincronia deliberada com TRANSIENT_CONNECTION_RE de
// check-migration-drift.mjs (#704): como o db-live-guard desliga aquele retry
// para nao multiplicar tentativas, esta regex precisa cobrir tudo o que a de la
// cobria -- ECHECKOUTRETRIES, "too many clients", "terminating connection" e
// "connection reset" vieram de la. Os padroes sao propositalmente amplos
// ("could not connect", nao "could not connect to server") para pegar as
// variantes de mensagem do pooler.
const TRANSPORT_FAILURE = new RegExp([
  'timeout expired',
  'could not connect',
  'could not translate host',
  'server closed the connection',
  'connection refused',
  'connection timed out',
  'connection reset',
  'connection terminated',
  'terminating connection',
  'too many clients',
  'ECHECKOUTRETRIES',
  'no route to host',
  'network is unreachable',
  'temporary failure in name resolution',
  'SSL SYSCALL error',
].join('|'), 'i');

function isTransportFailure(error) {
  const partes = [error?.stderr, error?.stdout, error?.message]
    .map(value => (typeof value === 'string' ? value : ''))
    .join('\n');
  return TRANSPORT_FAILURE.test(partes);
}

/**
 * Politica de retry, desligada por padrao: sem PSQL_CONNECT_RETRIES nada muda
 * para nenhum chamador existente. O db-live-guard liga porque roda sozinho e um
 * timeout de 10s do pooler abria uma issue de "contrato quebrado" que nao era
 * verdade (run 36135041890). Quem escreve (register-migration --apply) nao liga
 * e continua falhando de primeira.
 */
function retryPolicy(env) {
  const bruto = Number.parseInt(env.PSQL_CONNECT_RETRIES ?? '', 10);
  const atrasoBruto = Number.parseInt(env.PSQL_CONNECT_RETRY_DELAY_MS ?? '', 10);
  return {
    tentativas: Number.isInteger(bruto) && bruto > 0 ? Math.min(bruto, 5) : 0,
    atrasoMs: Number.isInteger(atrasoBruto) && atrasoBruto >= 0 ? Math.min(atrasoBruto, 30000) : 2000,
  };
}

function esperaSincrona(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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
    const childEnv = { ...env, ...fields, PGPASSFILE: passwordFile };
    const { tentativas, atrasoMs } = retryPolicy(baseEnv);
    for (let tentativa = 0; ; tentativa += 1) {
      try {
        return callback(childEnv);
      } catch (error) {
        if (tentativa >= tentativas || !isTransportFailure(error)) throw error;
        // stderr pode conter a URI; nunca ecoar o erro, so' a contagem.
        process.stderr.write(
          `aviso: falha de transporte ao falar com o banco; nova tentativa ${tentativa + 1}/${tentativas}\n`,
        );
        esperaSincrona(atrasoMs * (tentativa + 1));
      }
    }
  } finally {
    // Only the exact file/directory created above; never recursive cleanup.
    fs.rmSync(passwordFile, { force: true });
    fs.rmdirSync(directory);
  }
}
