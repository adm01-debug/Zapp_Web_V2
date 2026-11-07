// Closed, observation-only metadata for the isolated provider readiness proof.
// This module does not execute SQL, fetch URLs, or decide whether a proof passes.
export const SIGNATURES = Object.freeze([
  'public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)',
  'public.claim_outbound_message(uuid,uuid,text,integer)',
  'public.complete_outbound_message(uuid,uuid,text,text)',
  'public.fail_outbound_message(uuid,uuid,boolean)',
  'public.get_instance_token(text)',
  'public.enqueue_ai_job(text,text,text,uuid,jsonb,integer,timestamp with time zone,timestamp with time zone,integer)',
]);
export const PHASES = Object.freeze([
  'unknown', 'preflight', 'seed-proofs', 'gateway-identity', 'provider-identity',
  'provider-baseline', 'auth-login',
  'text-enqueue', 'text-delivery', 'text-evidence', 'text-readback',
  'http-negative-enqueue', 'http-negative-readback',
  'catalog-bootstrap', 'catalog-list', 'catalog-detail', 'catalog-image',
  'catalog-enqueue', 'catalog-delivery', 'catalog-evidence', 'catalog-readback',
  'storage-upload', 'storage-enqueue', 'storage-delivery', 'storage-evidence',
  'storage-readback', 'ready-write',
]);
const OWNERS = new Set(['postgres', 'supabase_admin', 'service_role', 'other', 'missing']);
const fieldsAre = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const state = value => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) && value !== '00000';
const status = value => Number.isInteger(value) && value >= 100 && value <= 599;
const unavailable = reason => ({ available: false, reason });

export function parseCatalog(result) {
  if (result?.status !== 0 || result.error || result.signal) return unavailable('query-failed');
  if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 4096) return unavailable('invalid-catalog');
  let value;
  try { value = JSON.parse(result.stdout); } catch { return unavailable('invalid-catalog'); }
  if (!fieldsAre(value, ['schema', 'routines']) || value.schema !== 1 || !Array.isArray(value.routines)
      || value.routines.length !== SIGNATURES.length) return unavailable('invalid-catalog');
  const rows = new Map();
  for (const row of value.routines) {
    if (!fieldsAre(row, ['signature', 'owner', 'security_definer']) || !SIGNATURES.includes(row.signature)
        || rows.has(row.signature) || !OWNERS.has(row.owner)
        || (row.owner === 'missing' ? row.security_definer !== null : typeof row.security_definer !== 'boolean')) {
      return unavailable('invalid-catalog');
    }
    rows.set(row.signature, { signature: row.signature, owner: row.owner, security_definer: row.security_definer });
  }
  return { available: true, schema: 1, routines: SIGNATURES.map(signature => rows.get(signature)) };
}

export function parseProviderDiagnostic(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1024) return unavailable('invalid-diagnostic');
  let value;
  try { value = JSON.parse(raw); } catch { return unavailable('invalid-diagnostic'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['schema', 'phase', 'http_status', 'sqlstate'].includes(key))
      || value.schema !== 1 || !PHASES.includes(value.phase)
      || (Object.hasOwn(value, 'http_status') && !status(value.http_status))
      || (Object.hasOwn(value, 'sqlstate') && !state(value.sqlstate))) return unavailable('invalid-diagnostic');
  return { available: true, schema: 1, phase: value.phase,
    ...(Object.hasOwn(value, 'http_status') ? { http_status: value.http_status } : {}),
    ...(Object.hasOwn(value, 'sqlstate') ? { sqlstate: value.sqlstate } : {}),
  };
}

// Bounded observation of an already failed response. It neither classifies a
// response as successful nor replaces the failure the verifier would throw.
// On failure, the response is not reused; no clone/tee is necessary.
export async function observeSqlState(response, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let reader, timer;
  const expired = Symbol('expired');
  try {
    if (!response?.body?.getReader) return undefined;
    reader = response.body.getReader();
    const deadline = new Promise(resolve => { timer = setTimer(() => resolve(expired), 500); });
    const chunks = []; let size = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part === expired) return undefined;
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || part.value.byteLength === 0) return undefined;
      size += part.value.byteLength;
      if (size > 2048) return undefined;
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return json !== null && typeof json === 'object' && !Array.isArray(json) && state(json.code) ? json.code : undefined;
  } catch { return undefined; }
  finally {
    try { if (timer !== undefined) clearTimer(timer); } catch { /* observation only */ }
    try { void reader?.cancel().catch(() => {}); } catch { /* observation only */ }
  }
}

export async function withObservation(operation, write) {
  let phase = 'preflight', httpStatus, sqlstate;
  const observer = {
    phase(value) {
      // Call sites use fixed phases; unknown values never reach the artifact.
      phase = PHASES.includes(value) ? value : 'unknown';
      httpStatus = undefined; sqlstate = undefined;
    },
    response(value) { httpStatus = status(value) ? value : undefined; },
    sqlstate(value) { sqlstate = state(value) ? value : undefined; },
  };
  try { return await operation(observer); }
  catch (error) {
    try {
      write(JSON.stringify({ schema: 1, phase,
        ...(httpStatus !== undefined ? { http_status: httpStatus } : {}),
        ...(sqlstate !== undefined ? { sqlstate } : {}),
      }) + '\n', { mode: 0o600 });
    } catch { /* Preserve the original thrown value, including falsy values. */ }
    throw error;
  }
}

// The client and server both have a short, independent observation budget.
export const CATALOG_EXECUTOR_OPTIONS = Object.freeze({ timeout: 5_000, killSignal: 'SIGKILL', maxBuffer: 8192 });
export const PROVIDER_CATALOG_SQL = "BEGIN READ ONLY;\nSET LOCAL statement_timeout = '3s';\nWITH expected(ordinal, signature) AS (\n  VALUES\n    (1, 'public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)'),\n    (2, 'public.claim_outbound_message(uuid,uuid,text,integer)'),\n    (3, 'public.complete_outbound_message(uuid,uuid,text,text)'),\n    (4, 'public.fail_outbound_message(uuid,uuid,boolean)'),\n    (5, 'public.get_instance_token(text)'),\n    (6, 'public.enqueue_ai_job(text,text,text,uuid,jsonb,integer,timestamp with time zone,timestamp with time zone,integer)')\n)\nSELECT json_build_object('schema', 1, 'routines', json_agg(\n  json_build_object(\n    'signature', expected.signature,\n    'owner', CASE\n      WHEN p.oid IS NULL THEN 'missing'\n      WHEN pg_get_userbyid(p.proowner) IN ('postgres', 'supabase_admin', 'service_role')\n        THEN pg_get_userbyid(p.proowner)\n      ELSE 'other'\n    END,\n    'security_definer', p.prosecdef\n  ) ORDER BY expected.ordinal\n))\nFROM expected\nLEFT JOIN pg_catalog.pg_proc AS p ON p.oid = to_regprocedure(expected.signature);\nROLLBACK;\n";
