import { createHash } from 'node:crypto';
import { fail, ORIGIN, sha256 } from './runtime-contract.mjs';

// Only the active migration chain was inspected. These hashes bind the review
// of Vault calls to exact source bytes; future changes must be reviewed again.
const REVIEWED_VAULT = {
  '20260930240000_cron_secret_dedicado_l5.sql': '7ea58bde31b9562c85de30519b9f6877e06635ac',
  '20260927320000_multiplix_cron_scheduler.sql': '3dbf266be3443b6df73a6a91374c4eae8981e4eb',
  '20260827210000_gmail_crypto_vault.sql': '1b251b201a26c3c76673cab8288ee114cf7ea4cd',
  '20260925190000_whatsapp_connections_instance_token_vault.sql': '9c2e1fbe1baafee1eeb531dbc75053e15ec9f68d',
  '20261001391230_talkx_engine_tick.sql': 'e8eb0d73f09eb85ed24a32577222e2503a62cb2e',
  '20261013230011_voip_profile_credentials.sql': '189cc2e2a58faa163f61f9bf2e26b4dedfe907aa',
  '20260909000000_talkx_scheduler_cron.sql': 'a7f723e87bd00e2420ed8bc21e0b55c8606d74b3',
  '20260929610000_multiplix_cron_window_and_limits.sql': '4b73c26ccbe11bfe9e953993713baa2de497c720',
  '20261001311230_talkx_campaign_worker_lease.sql': '8187b1b62ae04c8401bff2d326307c806dc855f0',
  '20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql': '44b2fba209ae7990d43bff1f3a50635a1b85a8c2',
  '20261103223000_ai_usage_outbox_drain_cron.sql': 'f5a151d98b1c27f1f7f9e2943ba994502892ecb6',
};
const LOCAL_URL_CONFIGURATION = new Set([
  '20261001391230_talkx_engine_tick.sql',
  '20260929610000_multiplix_cron_window_and_limits.sql',
]);
const REVIEWED_GMAIL_CRON = '20260829110000_gmail_incremental_sync_cron.sql';
const REVIEWED_GMAIL_CRON_BLOB = '0eac1be96bcd4649db4059caad6b223f957c1ade';

export function gitBlob(source) {
  const bytes = Buffer.from(source);
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

export function prepareMigration(name, original) {
  if (!/^\d+_[a-zA-Z0-9_.-]+\.sql$/.test(name)) fail('invalid-migration-name');
  const originalBlob = gitBlob(original);
  if (/vault\.(?:create_secret|update_secret)\s*\(/i.test(original) && REVIEWED_VAULT[name] !== originalBlob) {
    throw new Error('[e2e-isolated/unreviewed-vault-configuration] ' + name);
  }
  const historicalTokens = [...original.matchAll(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g)];
  const reviewedCron = name === REVIEWED_GMAIL_CRON;
  if ((reviewedCron && originalBlob !== REVIEWED_GMAIL_CRON_BLOB) || (!reviewedCron && historicalTokens.length)) {
    throw new Error('[e2e-isolated/historical-jwt-needs-local-transform] ' + name);
  }
  let sql = original;
  const transformations = [];
  if (reviewedCron) {
    if (historicalTokens.length !== 1) fail('historical-cron-token-not-unique');
    const header = "'apikey', '" + historicalTokens[0][0] + "'";
    const priorURL = "'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/gmail-cron-sync'";
    if (sql.split(header).length !== 2 || sql.split(priorURL).length !== 2) fail('historical-cron-target-not-unique');
    // The local setting is populated from this run's synthetic anon key before
    // replay. Neither the historical token nor a production URL enters the copy.
    sql = sql.replace(header, "'apikey', current_setting('app.settings.e2e_anon_key', true)")
      .replace(priorURL, "'" + ORIGIN + "/functions/v1/gmail-cron-sync'");
    transformations.push(
      { operation: 'historical-anon-key-to-local-setting', replacements: 1 },
      { operation: 'cron-url-to-isolated-origin', replacements: 1 },
    );
  }
  if (LOCAL_URL_CONFIGURATION.has(name)) {
    if (REVIEWED_VAULT[name] !== originalBlob) fail('changed-external-configuration');
    let count = 0;
    sql = sql.replace(/(vault\.create_secret\s*\(\s*)'(https?:\/\/(?:[^']|'')*)'/gi, (_match, before, literal) => {
      const target = new URL(literal.replaceAll("''", "'"));
      if (target.username || target.password || target.search || target.hash) fail('unexpected-external-url-shape');
      count++;
      return before + "'" + ORIGIN + (target.pathname === '/' ? '' : target.pathname) + "'";
    });
    if (count !== 1) fail('external-configuration-target-not-unique');
    transformations.push({ operation: 'vault-url-to-isolated-origin', replacements: count });
  }
  return { sql, evidence: { name, original_git_blob: originalBlob, original_sha256: sha256(original), applied_sha256: sha256(sql), transformations } };
}

export function migrationFailure(name, result, expectedFailures) {
  if (result.status === 0) return { name, success: true };
  if (result.status === null || result.error || result.signal) return { name, success: false, sqlstate: 'PROCESS_FAILURE', expected: false };
  const output = String(result.stderr || '') + String(result.stdout || '');
  // Never emit SQL, response bodies or error-context lines from a migration.
  const state = output.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|$)/)?.[1] ?? 'UNKNOWN';
  return { name, success: false, sqlstate: state, expected: Object.hasOwn(expectedFailures, name) };
}
