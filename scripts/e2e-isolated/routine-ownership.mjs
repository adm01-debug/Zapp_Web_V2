import {
  OWNER_LABEL, PURPOSE_LABEL, PURPOSE, assertRunId, assertSourceSha, assertContainerIsolation, isAuthenticatedGroup,
} from './runtime-contract.mjs';

// Exact definitions exported in contexto@51d4d9fb7d6109ead9357025da3ae83389c24d4e, except
// claim_outbound_message: redefined by migration 20261111160000_outbound_post_started.sql (9727aaedd).
// These are full SHA256 hashes of pg_get_functiondef, not the snapshot's JSON hash.
export const OWNERSHIP_ROUTINES = Object.freeze([
  ['public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)', '7d23e3848086b03e90cb2413f53c4a98cc4e4f0eb72ff57ea910b7e30605d37b'],
  ['public.claim_outbound_message(uuid,uuid,text,integer)', 'df82a503c1c4700d4feef6f7f4c8b4a0c5814339cf9669db05bc1b1142d2bf1b'],
  ['public.complete_outbound_message(uuid,uuid,text,text)', '31225dd6be1b4c2ec2b5e081626a45f369b9318554250a5f05738ac760675b68'],
  ['public.fail_outbound_message(uuid,uuid,boolean)', '227ba0479f57f65cc7128ffab8b78fdb059f8867ae381d1ab100da7760d98a1b'],
  ['public.get_instance_token(text)', '5082afe06f6d581652c74d67a09bdbdb3317e4600ab223ea2a082997b3ff7777'],
  ['public.enqueue_ai_job(text,text,text,uuid,jsonb,integer,timestamp with time zone,timestamp with time zone,integer)', '866a5819d62fcbaa539029b50d83fed2dc985fd621052829d0bacac8b4fbeeba'],
  ['public.close_conversation_atomic(uuid,uuid,text,text,text,text)', 'ab317cb9f04ddb2fb6b15c8d8c85c4833e1b2452f38dfb16c00db9710d444e41'],
].map(([signature, definition_sha256]) => Object.freeze({ signature, definition_sha256 })));

export const OWNERSHIP_EXECUTOR_OPTIONS = Object.freeze({ timeout: 5_000, killSignal: 'SIGKILL', maxBuffer: 8_192 });
const CID = /^[a-f0-9]{64}$/;
const IMAGE = /^[a-z0-9./_-]+:[A-Za-z0-9_.-]+@sha256:[a-f0-9]{64}$/;
const HEX = /^[a-f0-9]{64}$/;
const NET = /^net:\[\d+\]$/;
const reject = () => { throw new Error('routine-ownership-rejected'); };
const processSucceeded = result => result?.status === 0 && result.error == null && result.signal == null;
const keysAre = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function record(value, stage, runId, sourceSha) {
  if (!keysAre(value, ['schema', 'stage', 'run_id', 'source_sha', 'routines']) || value.schema !== 1
      || value.stage !== stage || value.run_id !== runId || value.source_sha !== sourceSha
      || !Array.isArray(value.routines) || value.routines.length !== OWNERSHIP_ROUTINES.length) return null;
  const rows = [];
  for (const [index, expected] of OWNERSHIP_ROUTINES.entries()) {
    const row = value.routines[index];
    if (stage === 'before') {
      if (!keysAre(row, ['signature', 'owner', 'security_definer', 'definition_sha256'])
          || row.signature !== expected.signature || !['supabase_admin', 'postgres', 'other', 'missing'].includes(row.owner)
          || !(row.security_definer === null || typeof row.security_definer === 'boolean')
          || !(row.definition_sha256 === null || typeof row.definition_sha256 === 'string' && HEX.test(row.definition_sha256))) return null;
      rows.push({ signature: expected.signature, owner: row.owner, security_definer: row.security_definer,
        definition_sha256: row.definition_sha256 });
    } else {
      if (!keysAre(row, ['signature', 'owner', 'definition_sha256', 'definition_preserved', 'attributes_preserved', 'acl_preserved', 'changed'])
          || row.signature !== expected.signature || row.owner !== 'postgres'
          || row.definition_sha256 !== expected.definition_sha256 || row.definition_preserved !== true
          || row.attributes_preserved !== true || row.acl_preserved !== true || typeof row.changed !== 'boolean') return null;
      rows.push({ ...expected, owner: 'postgres', definition_preserved: true, attributes_preserved: true,
        acl_preserved: true, changed: row.changed });
    }
  }
  return rows;
}

/** verified is emitted BEFORE COMMIT. Only a successful process plus both exact
 * records confirms completion; losing the reply never proves rollback. */
export function parseOwnershipResult(result, { runId, sourceSha }) {
  assertRunId(runId); assertSourceSha(sourceSha);
  const base = { schema: 1, run_id: runId, source_sha: sourceSha, confirmed: false };
  let before, verified;
  if (typeof result?.stdout === 'string' && Buffer.byteLength(result.stdout, 'utf8') <= OWNERSHIP_EXECUTOR_OPTIONS.maxBuffer) {
    const lines = result.stdout.replace(/\r?\n$/, '').split(/\r?\n/);
    if (lines.length >= 1 && lines.length <= 2) {
      try {
        before = record(JSON.parse(lines[0]), 'before', runId, sourceSha);
        if (lines.length === 2) verified = record(JSON.parse(lines[1]), 'verified', runId, sourceSha);
      } catch { /* Only rebuilt, closed metadata may leave this parser. */ }
    }
  }
  const failure = reason => ({ ...base, reason, ...(before ? { before } : {}) });
  if (!processSucceeded(result)) return failure('sql-process-failed');
  if (!before || !verified || before.some((row, index) =>
    !['supabase_admin', 'postgres'].includes(row.owner) || row.security_definer !== true
    || row.definition_sha256 !== OWNERSHIP_ROUTINES[index].definition_sha256
    || verified[index].changed !== (row.owner === 'supabase_admin'))) return failure('confirmation-invalid');
  return { ...base, confirmed: true, before, verified };
}

function inspected(result) {
  if (!processSucceeded(result) || typeof result.stdout !== 'string') reject();
  const value = JSON.parse(result.stdout);
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object') reject();
  return value[0];
}

function imagePath(metadata) {
  const paths = metadata.Config?.Env?.filter(value => typeof value === 'string' && value.startsWith('PATH='));
  if (!paths || paths.length !== 1) reject();
  const value = paths[0].slice(5);
  if (value.length > 1024 || !value.split(':').every(part => /^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))) reject();
  return value;
}

/** Only this controller's fresh, isolated authenticated stack is eligible.
 * Commands are arrays, use the local daemon and exact captured CIDs, and never
 * inherit libpq settings or credentials for the new owner transaction. */
export function restoreRoutineOwnership({ command, dockerConfig, scope, group, runId, sourceSha,
  anchorId, anchorImage, databaseId, databaseImage, volumeName, networkNamespace, allowedWritableSources }) {
  let phase = 'scope';
  try {
    assertRunId(runId); assertSourceSha(sourceSha);
    if (scope !== 'suite' || !isAuthenticatedGroup(group) || !CID.test(anchorId) || !CID.test(databaseId)
        || anchorId === databaseId || !IMAGE.test(anchorImage) || !IMAGE.test(databaseImage)
        || volumeName !== runId + '-postgres' || !NET.test(networkNamespace)
        || !(allowedWritableSources instanceof Set) || typeof dockerConfig !== 'string' || !dockerConfig.startsWith('/')) reject();
    const invoke = (program, args, options = {}) => command(program, args, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...OWNERSHIP_EXECUTOR_OPTIONS,
      maxBuffer: 128 * 1024, // Inspect includes Docker configuration; never publish it.
      env: { PATH: process.env.PATH }, ...options,
    });
    const docker = (args, options = {}) => invoke('docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
      ...options, env: { PATH: process.env.PATH, DOCKER_CONFIG: dockerConfig },
    });
    phase = 'source';
    const source = invoke('git', ['rev-parse', 'HEAD']);
    if (!processSucceeded(source) || typeof source.stdout !== 'string' || source.stdout.trim() !== sourceSha) reject();
    phase = 'container';
    const anchor = inspected(docker(['inspect', anchorId]));
    const database = inspected(docker(['inspect', databaseId]));
    for (const [metadata, id, name, image, network] of [
      [anchor, anchorId, runId + '-anchor', anchorImage, 'none'],
      [database, databaseId, runId + '-postgres', databaseImage, 'container:' + anchorId],
    ]) {
      assertContainerIsolation(metadata, runId, anchorId, allowedWritableSources);
      if (metadata.Id !== id || metadata.Name !== '/' + name || metadata.State?.Running !== true
          || metadata.Config.Image !== image || metadata.HostConfig.NetworkMode !== network) reject();
    }
    const cleanPath = imagePath(database);
    phase = 'volume';
    const volume = inspected(docker(['volume', 'inspect', volumeName]));
    const mounts = database.Mounts.filter(mount => mount.Destination === '/var/lib/postgresql/data');
    if (volume.Name !== volumeName || volume.Labels?.[OWNER_LABEL] !== runId || volume.Labels?.[PURPOSE_LABEL] !== PURPOSE
        || typeof volume.Mountpoint !== 'string' || !volume.Mountpoint.startsWith('/')
        || !allowedWritableSources.has(volume.Mountpoint) || mounts.length !== 1
        || mounts[0].Type !== 'volume' || mounts[0].Name !== volumeName
        || mounts[0].Source !== volume.Mountpoint || mounts[0].RW !== true) reject();
    phase = 'namespace';
    const namespace = docker(['exec', databaseId, '/usr/bin/readlink', '/proc/self/ns/net']);
    if (!processSucceeded(namespace) || typeof namespace.stdout !== 'string'
        || namespace.stdout.trim() !== networkNamespace) reject();
    phase = 'sql-process';
    const result = docker(['exec', '-i', databaseId, '/usr/bin/env', '-i',
      'PATH=' + cleanPath, 'LANG=C', 'LC_ALL=C', 'PGCLIENTENCODING=UTF8', 'PGPASSFILE=/dev/null',
      'psql', '-X', '-w', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'supabase_admin', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-q', '-A', '-t'],
    { ...OWNERSHIP_EXECUTOR_OPTIONS, input: ownershipSql(runId, sourceSha) });
    return parseOwnershipResult(result, { runId, sourceSha });
  } catch {
    return { schema: 1, confirmed: false, reason: phase + '-failed' };
  }
}

export function ownershipSql(runId, sourceSha) {
  assertRunId(runId); assertSourceSha(sourceSha);
  return SQL.replaceAll('__RUN_ID__', runId).replaceAll('__SOURCE_SHA__', sourceSha);
}

const SQL = `BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '3s';
SET LOCAL transaction_timeout = '4s';
DO $scope$
BEGIN
  IF current_user IS DISTINCT FROM 'supabase_admin'
     OR session_user IS DISTINCT FROM 'supabase_admin'
     OR pg_catalog.current_database() IS DISTINCT FROM 'postgres'
     OR pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
     OR pg_catalog.current_setting('cron.launch_active_jobs', true) IS DISTINCT FROM 'off'
     OR pg_catalog.to_regrole('postgres') IS NULL
     OR pg_catalog.to_regrole('supabase_admin') IS NULL THEN
    RAISE EXCEPTION 'isolated_owner_session_rejected' USING ERRCODE = 'P0001';
  END IF;
END;
$scope$;

CREATE TEMP TABLE e2e_owner_before ON COMMIT DROP AS
WITH expected(ordinal, signature, expected_sha256) AS (
  VALUES
    (1, 'public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)', '7d23e3848086b03e90cb2413f53c4a98cc4e4f0eb72ff57ea910b7e30605d37b'),
    (2, 'public.claim_outbound_message(uuid,uuid,text,integer)', 'df82a503c1c4700d4feef6f7f4c8b4a0c5814339cf9669db05bc1b1142d2bf1b'),
    (3, 'public.complete_outbound_message(uuid,uuid,text,text)', '31225dd6be1b4c2ec2b5e081626a45f369b9318554250a5f05738ac760675b68'),
    (4, 'public.fail_outbound_message(uuid,uuid,boolean)', '227ba0479f57f65cc7128ffab8b78fdb059f8867ae381d1ab100da7760d98a1b'),
    (5, 'public.get_instance_token(text)', '5082afe06f6d581652c74d67a09bdbdb3317e4600ab223ea2a082997b3ff7777'),
    (6, 'public.enqueue_ai_job(text,text,text,uuid,jsonb,integer,timestamp with time zone,timestamp with time zone,integer)', '866a5819d62fcbaa539029b50d83fed2dc985fd621052829d0bacac8b4fbeeba'),
    (7, 'public.close_conversation_atomic(uuid,uuid,text,text,text,text)', 'ab317cb9f04ddb2fb6b15c8d8c85c4833e1b2452f38dfb16c00db9710d444e41')
)
SELECT e.ordinal, e.signature, e.expected_sha256, p.oid AS proc_oid,
       p.proowner AS old_owner, pg_catalog.to_regrole('postgres')::oid AS new_owner,
       p.proacl AS old_acl, p.prokind, p.prosecdef,
       CASE WHEN p.prokind = 'f' THEN pg_catalog.pg_get_functiondef(p.oid) END AS definition_before,
       CASE WHEN p.prokind = 'f' THEN pg_catalog.encode(pg_catalog.sha256(
         pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex') END AS actual_sha256,
       pg_catalog.to_jsonb(p) - 'proowner' - 'proacl' AS attributes_before
FROM expected AS e
LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = pg_catalog.to_regprocedure(e.signature);

-- An allowed partial observation survives a failed transaction; never approval.
SELECT pg_catalog.json_build_object('schema', 1, 'stage', 'before',
  'run_id', '__RUN_ID__', 'source_sha', '__SOURCE_SHA__',
  'routines', pg_catalog.json_agg(pg_catalog.json_build_object(
    'signature', signature,
    'owner', CASE WHEN proc_oid IS NULL THEN 'missing'
      WHEN old_owner = pg_catalog.to_regrole('supabase_admin') THEN 'supabase_admin'
      WHEN old_owner = new_owner THEN 'postgres' ELSE 'other' END,
    'security_definer', prosecdef, 'definition_sha256', actual_sha256
  ) ORDER BY ordinal))
FROM pg_temp.e2e_owner_before;

DO $owners$
DECLARE
  item record;
  acl_ok boolean;
BEGIN
  IF (SELECT count(*) FROM pg_temp.e2e_owner_before) <> 7
     OR (SELECT count(DISTINCT proc_oid) FROM pg_temp.e2e_owner_before) <> 7
     OR EXISTS (SELECT FROM pg_temp.e2e_owner_before WHERE
       proc_oid IS NULL OR prokind IS DISTINCT FROM 'f' OR prosecdef IS DISTINCT FROM true
       OR old_owner NOT IN (new_owner, pg_catalog.to_regrole('supabase_admin')::oid)
       OR actual_sha256 IS DISTINCT FROM expected_sha256) THEN
    RAISE EXCEPTION 'isolated_owner_precondition_rejected' USING ERRCODE = 'P0001';
  END IF;

  FOR item IN SELECT * FROM pg_temp.e2e_owner_before ORDER BY ordinal LOOP
    -- Recheck the captured object immediately before its fixed-signature ALTER.
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_proc AS p WHERE
      p.oid = item.proc_oid AND p.oid = pg_catalog.to_regprocedure(item.signature)
      AND p.proowner = item.old_owner AND p.proacl IS NOT DISTINCT FROM item.old_acl
      AND pg_catalog.pg_get_functiondef(p.oid) = item.definition_before
      AND pg_catalog.to_jsonb(p) - 'proowner' - 'proacl' = item.attributes_before) THEN
      RAISE EXCEPTION 'isolated_owner_object_changed' USING ERRCODE = 'P0001';
    END IF;
    IF item.old_owner <> item.new_owner THEN
      EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO postgres', item.signature);
    END IF;
  END LOOP;

  IF EXISTS (SELECT FROM pg_temp.e2e_owner_before AS b
    LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = b.proc_oid WHERE
      p.oid IS NULL OR p.oid IS DISTINCT FROM pg_catalog.to_regprocedure(b.signature)::oid
      OR p.proowner IS DISTINCT FROM b.new_owner
      OR pg_catalog.pg_get_functiondef(p.oid) IS DISTINCT FROM b.definition_before
      OR pg_catalog.to_jsonb(p) - 'proowner' - 'proacl' IS DISTINCT FROM b.attributes_before) THEN
    RAISE EXCEPTION 'isolated_owner_definition_or_attributes_changed' USING ERRCODE = 'P0001';
  END IF;

  WITH expected_rows AS (
    SELECT b.proc_oid,
           CASE WHEN a.grantor = b.old_owner THEN b.new_owner ELSE a.grantor END AS grantor,
           CASE WHEN a.grantee = b.old_owner THEN b.new_owner ELSE a.grantee END AS grantee,
           a.privilege_type, a.is_grantable
    FROM pg_temp.e2e_owner_before AS b
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(b.old_acl, pg_catalog.acldefault('f'::"char", b.old_owner))
    ) AS a
  ), expected AS (
    SELECT proc_oid, grantor, grantee, privilege_type,
           bool_or(is_grantable) AS is_grantable
    FROM expected_rows
    GROUP BY proc_oid, grantor, grantee, privilege_type
  ), actual AS (
    SELECT b.proc_oid, a.grantor, a.grantee, a.privilege_type,
           bool_or(a.is_grantable) AS is_grantable
    FROM pg_temp.e2e_owner_before AS b
    JOIN pg_catalog.pg_proc AS p ON p.oid = b.proc_oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
    ) AS a
    GROUP BY b.proc_oid, a.grantor, a.grantee, a.privilege_type
  ), mismatch AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ), shape AS (
    SELECT count(*) = 7 AND count(DISTINCT b.proc_oid) = 7
           AND coalesce(bool_and(
             b.old_owner IS NOT NULL
             AND b.new_owner IS NOT NULL
             AND p.oid IS NOT NULL
             AND p.proowner = b.new_owner
             AND (p.proacl IS NULL) = (b.old_acl IS NULL)
           ), false) AS ok
    FROM pg_temp.e2e_owner_before AS b
    LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = b.proc_oid
  )
  SELECT shape.ok AND NOT EXISTS (SELECT FROM mismatch) INTO acl_ok
  FROM shape;

  IF acl_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'isolated_owner_acl_changed' USING ERRCODE = 'P0001';
  END IF;
END;
$owners$;

-- Verified is not confirmed-commit. The caller also requires exit/status/error/
-- signal success after the following COMMIT; a lost reply must fail closed.
SELECT pg_catalog.json_build_object('schema', 1, 'stage', 'verified',
  'run_id', '__RUN_ID__', 'source_sha', '__SOURCE_SHA__',
  'routines', pg_catalog.json_agg(pg_catalog.json_build_object(
    'signature', signature, 'owner', 'postgres', 'definition_sha256', expected_sha256,
    'definition_preserved', true, 'attributes_preserved', true, 'acl_preserved', true,
    'changed', old_owner <> new_owner
  ) ORDER BY ordinal))
FROM pg_temp.e2e_owner_before;
COMMIT;
`;
