import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OWNERSHIP_ROUTINES, OWNERSHIP_EXECUTOR_OPTIONS, ownershipSql, parseOwnershipResult, restoreRoutineOwnership,
} from '../e2e-isolated/routine-ownership.mjs';
import { OWNER_LABEL, PURPOSE_LABEL, PURPOSE, GROUP_SHARDS } from '../e2e-isolated/runtime-contract.mjs';

const RUN = 'zapp-e2e-ownership-unit';
const SHA = 'a'.repeat(40);
const ANCHOR = 'b'.repeat(64);
const DATABASE = 'c'.repeat(64);
const IMAGE = 'supabase/postgres:17.6.1.159@sha256:' + 'd'.repeat(64);
const DRIVER = 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:' + 'e'.repeat(64);
const PATH = '/usr/lib/postgresql/17/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const MOUNT = '/var/lib/docker/volumes/' + RUN + '-postgres/_data';
const IDENTITY = { runId: RUN, sourceSha: SHA };
const AUTH_GROUP = Object.keys(GROUP_SHARDS)[0];
const ok = stdout => ({ status: 0, error: null, signal: null, stdout, stderr: '' });

function records(owners = OWNERSHIP_ROUTINES.map(() => 'supabase_admin')) {
  return [
    { schema: 1, stage: 'before', run_id: RUN, source_sha: SHA, routines: OWNERSHIP_ROUTINES.map((entry, i) =>
      ({ ...entry, owner: owners[i], security_definer: true })) },
    { schema: 1, stage: 'verified', run_id: RUN, source_sha: SHA, routines: OWNERSHIP_ROUTINES.map((entry, i) =>
      ({ ...entry, owner: 'postgres', definition_preserved: true, attributes_preserved: true,
        acl_preserved: true, changed: owners[i] === 'supabase_admin' })) },
  ];
}
const stdout = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n';
const parsed = rows => parseOwnershipResult(ok(stdout(rows)), IDENTITY);

function fixture() {
  const labels = { [OWNER_LABEL]: RUN, [PURPOSE_LABEL]: PURPOSE };
  const metadata = (Id, suffix, image, network) => ({ Id, Name: '/' + RUN + suffix, State: { Running: true },
    Config: { Image: image, Labels: { ...labels }, Env: ['PATH=' + PATH, 'PGHOSTADDR=198.51.100.1', 'PGSERVICE=foreign', 'PGOPTIONS=-c role=other', 'DB_URL=private-sentinel'] },
    HostConfig: { NetworkMode: network, Privileged: false, CapAdd: [] }, NetworkSettings: { Networks: {} }, Mounts: [] });
  const state = {
    anchor: metadata(ANCHOR, '-anchor', DRIVER, 'none'), database: metadata(DATABASE, '-postgres', IMAGE, 'container:' + ANCHOR),
    volume: { Name: RUN + '-postgres', Labels: { ...labels }, Mountpoint: MOUNT },
    source: ok(SHA + '\n'), namespace: ok('net:[1234]\n'), result: ok(stdout(records())), calls: [], sqlCalls: [],
  };
  state.database.Mounts.push({ Type: 'volume', Name: RUN + '-postgres', Source: MOUNT, Destination: '/var/lib/postgresql/data', RW: true });
  const options = { dockerConfig: '/tmp/owned-docker-client', scope: 'suite', group: AUTH_GROUP, ...IDENTITY,
    anchorId: ANCHOR, anchorImage: DRIVER, databaseId: DATABASE, databaseImage: IMAGE, volumeName: RUN + '-postgres',
    networkNamespace: 'net:[1234]', allowedWritableSources: new Set([MOUNT]), command(program, args, commandOptions) {
      state.calls.push({ program, args, options: commandOptions });
      assert.equal(commandOptions.timeout, 5_000); assert.equal(commandOptions.killSignal, 'SIGKILL');
      assert.deepEqual(commandOptions.stdio, ['pipe', 'pipe', 'pipe']);
      if (program === 'git') {
        assert.deepEqual(args, ['rev-parse', 'HEAD']);
        assert.deepEqual(Object.keys(commandOptions.env), ['PATH']);
        return state.source;
      }
      assert.equal(program, 'docker');
      assert.deepEqual(args.slice(0, 2), ['--host', 'unix:///var/run/docker.sock']);
      assert.deepEqual(Object.keys(commandOptions.env).sort(), ['DOCKER_CONFIG', 'PATH']);
      assert.equal(commandOptions.env.DOCKER_CONFIG, '/tmp/owned-docker-client');
      const argv = args.slice(2);
      if (argv[0] === 'inspect') {
        assert.equal(commandOptions.maxBuffer, 128 * 1024);
        assert.ok([ANCHOR, DATABASE].includes(argv[1]), 'inspect must use the captured CID, never a name');
        if (state.inspectResult) return state.inspectResult;
        return ok(JSON.stringify([argv[1] === ANCHOR ? state.anchor : state.database]));
      }
      if (argv[0] === 'volume') {
        assert.deepEqual(argv, ['volume', 'inspect', RUN + '-postgres']);
        return ok(JSON.stringify([state.volume]));
      }
      if (argv.includes('/usr/bin/readlink')) {
        assert.deepEqual(argv, ['exec', DATABASE, '/usr/bin/readlink', '/proc/self/ns/net']);
        return state.namespace;
      }
      assert.deepEqual(argv, ['exec', '-i', DATABASE, '/usr/bin/env', '-i', 'PATH=' + PATH, 'LANG=C', 'LC_ALL=C',
        'PGCLIENTENCODING=UTF8', 'PGPASSFILE=/dev/null', 'psql', '-X', '-w', '-h', '/var/run/postgresql', '-p', '5432',
        '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-q', '-A', '-t']);
      for (const [key, value] of Object.entries(OWNERSHIP_EXECUTOR_OPTIONS)) assert.equal(commandOptions[key], value);
      assert.equal(commandOptions.input, ownershipSql(RUN, SHA));
      assert.equal(args.some(value => value.includes('private-sentinel') || value.includes('198.51.100.1')), false);
      state.sqlCalls.push(commandOptions.input);
      if (Object.hasOwn(state, 'throws')) throw state.throws;
      return state.result;
    } };
  return { state, options, run: () => restoreRoutineOwnership(options) };
}

for (const [name, owners, changed] of [
  ['seven replay-owned functions', Array(7).fill('supabase_admin'), 7],
  ['seven already-correct functions', Array(7).fill('postgres'), 0],
  ['four replay-owned and three already-correct functions', Array.from({ length: 7 }, (_, i) => i % 2 ? 'postgres' : 'supabase_admin'), 4],
]) test('ownership confirms ' + name + ' only after the complete process', () => {
  const value = fixture(); value.state.result = ok(stdout(records(owners)));
  const result = value.run();
  assert.equal(result.confirmed, true);
  assert.equal(result.verified.filter(row => row.changed).length, changed);
  assert.equal(value.state.sqlCalls.length, 1, 'no retry or per-function subprocess');
  assert.deepEqual(value.state.calls.map(call => call.args.includes('/usr/bin/readlink') ? 'namespace' : call.args.includes('psql') ? 'SQL' : call.args[0] === 'rev-parse' ? 'source' : call.args[2]),
    ['source', 'inspect', 'inspect', 'volume', 'namespace', 'SQL']);
});

const rejectedScopes = [
  ['login scope', x => { x.options.scope = 'login'; }],
  ['logged-out group', x => { x.options.group = 'deslogado-principal'; }],
  ['run id with SQL syntax', x => { x.options.runId = "zapp-e2e-';select"; }],
  ['source SHA with SQL syntax', x => { x.options.sourceSha = "a';select"; }],
  ['container name in place of CID', x => { x.options.databaseId = RUN + '-postgres'; }],
  ['same CID for database and anchor', x => { x.options.databaseId = ANCHOR; }],
  ['mutable image', x => { x.options.databaseImage = 'supabase/postgres:latest'; }],
  ['foreign volume name', x => { x.options.volumeName = 'foreign'; }],
  ['invalid namespace', x => { x.options.networkNamespace = 'net:1234'; }],
  ['missing writable-source contract', x => { x.options.allowedWritableSources = []; }],
  ['relative Docker config', x => { x.options.dockerConfig = '.'; }],
  ['HEAD changed', x => { x.state.source = ok('f'.repeat(40)); }],
  ['Git process error despite status zero', x => { x.state.source.error = new Error('private-sentinel'); }],
  ['wrong owner label', x => { x.state.database.Config.Labels[OWNER_LABEL] = 'zapp-e2e-foreign-owner'; }],
  ['wrong purpose', x => { x.state.database.Config.Labels[PURPOSE_LABEL] = 'other'; }],
  ['replaced database CID', x => { x.state.database.Id = 'f'.repeat(64); }],
  ['stopped database', x => { x.state.database.State.Running = false; }],
  ['stopped anchor', x => { x.state.anchor.State.Running = false; }],
  ['renamed database', x => { x.state.database.Name = '/foreign'; }],
  ['different database image', x => { x.state.database.Config.Image = DRIVER; }],
  ['different anchor image', x => { x.state.anchor.Config.Image = IMAGE; }],
  ['host network', x => { x.state.database.HostConfig.NetworkMode = 'host'; }],
  ['database network none instead of anchor', x => { x.state.database.HostConfig.NetworkMode = 'none'; }],
  ['anchor has container network', x => { x.state.anchor.HostConfig.NetworkMode = 'container:' + ANCHOR; }],
  ['extra endpoint', x => { x.state.database.NetworkSettings.Networks.bridge = {}; }],
  ['privileged container', x => { x.state.database.HostConfig.Privileged = true; }],
  ['added capability', x => { x.state.database.HostConfig.CapAdd = ['SYS_ADMIN']; }],
  ['Docker socket mount', x => { x.state.database.Mounts.push({ Source: '/var/run/docker.sock', RW: false }); }],
  ['unrelated writable mount', x => { x.state.database.Mounts.push({ Source: '/foreign', RW: true }); }],
  ['missing PATH', x => { x.state.database.Config.Env = []; }],
  ['ambiguous PATH', x => { x.state.database.Config.Env.push('PATH=/bin'); }],
  ['relative PATH component', x => { x.state.database.Config.Env = ['PATH=/bin:relative']; }],
  ['empty PATH component', x => { x.state.database.Config.Env = ['PATH=/bin:']; }],
  ['dot PATH component', x => { x.state.database.Config.Env = ['PATH=/bin:./tools']; }],
  ['parent traversal PATH', x => { x.state.database.Config.Env = ['PATH=/usr/../tmp']; }],
  ['newline in PATH', x => { x.state.database.Config.Env = ['PATH=/bin\nPGSERVICE=foreign']; }],
  ['foreign volume ownership', x => { x.state.volume.Labels[OWNER_LABEL] = 'foreign'; }],
  ['foreign volume purpose', x => { x.state.volume.Labels[PURPOSE_LABEL] = 'foreign'; }],
  ['volume mountpoint mismatch', x => { x.state.volume.Mountpoint = '/foreign'; }],
  ['volume missing from admitted sources', x => { x.options.allowedWritableSources.clear(); }],
  ['data mount replaced with bind', x => { x.state.database.Mounts[0].Type = 'bind'; }],
  ['data mount name mismatch', x => { x.state.database.Mounts[0].Name = 'foreign'; }],
  ['data mount read-only', x => { x.state.database.Mounts[0].RW = false; }],
  ['duplicate data mount', x => { x.state.database.Mounts.push({ ...x.state.database.Mounts[0] }); }],
  ['namespace changed', x => { x.state.namespace = ok('net:[9999]'); }],
  ['namespace process signalled', x => { x.state.namespace.signal = 'SIGTERM'; }],
  ['inspect process error', x => { x.state.inspectResult = { ...ok('[]'), error: new Error('private-sentinel') }; }],
  ['ambiguous inspect objects', x => { x.state.inspectResult = ok(JSON.stringify([x.state.database, x.state.database])); }],
];
for (const [name, arrange] of rejectedScopes) test('ownership blocks before SQL: ' + name, () => {
  const value = fixture(); arrange(value);
  const result = value.run();
  assert.equal(result.confirmed, false);
  assert.equal(value.state.sqlCalls.length, 0);
  assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});

for (const [name, mutate] of [
  ['nonzero exit', r => { r.status = 1; }],
  ['timeout', r => { r.status = null; r.error = new Error('private-sentinel'); }],
  ['signal after verified', r => { r.signal = 'SIGKILL'; }],
  ['error with status zero', r => { r.error = new Error('private-sentinel'); }],
  ['missing status', r => { delete r.status; }],
]) test('verified output cannot override ' + name, () => {
  const value = fixture(); mutate(value.state.result);
  const result = value.run();
  assert.equal(result.confirmed, false); assert.equal(result.reason, 'sql-process-failed');
  assert.equal(result.before.length, 7); assert.equal(Object.hasOwn(result, 'verified'), false);
  assert.equal(value.state.sqlCalls.length, 1);
  assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});

for (const thrown of [undefined, null, false, 0, '', new Error('private-sentinel')]) test('executor throw remains a failure: ' + String(thrown), () => {
  const value = fixture(); value.state.throws = thrown;
  const result = value.run();
  assert.deepEqual(result, { schema: 1, confirmed: false, reason: 'sql-process-failed' });
  assert.equal(value.state.sqlCalls.length, 1);
});

const rejectedRecords = [
  ['before only', rows => { rows.pop(); }],
  ['verified only', rows => { rows.shift(); }],
  ['extra third line', rows => { rows.push(rows[1]); }],
  ['reversed records', rows => { rows.reverse(); }],
  ['extra protocol field', rows => { rows[1].body = 'private-sentinel'; }],
  ['different run', rows => { rows[1].run_id = 'zapp-e2e-foreign-run'; }],
  ['different source', rows => { rows[1].source_sha = 'b'.repeat(40); }],
  ['unknown schema', rows => { rows[1].schema = 2; }],
  ['wrong stage', rows => { rows[1].stage = 'committed'; }],
  ['missing last function', rows => { rows[0].routines.pop(); }],
  ['extra function', rows => { rows[1].routines.push(rows[1].routines[0]); }],
  ['duplicate function', rows => { rows[1].routines[5] = rows[1].routines[0]; }],
  ['another overload', rows => { rows[1].routines[4].signature = 'public.get_instance_token(uuid)'; }],
  ['extra body field', rows => { rows[0].routines[0].definition = 'private-sentinel'; }],
  ['unexpected owner before', rows => { rows[0].routines[0].owner = 'other'; }],
  ['missing function before', rows => { rows[0].routines[0].owner = 'missing'; rows[0].routines[0].security_definer = null; rows[0].routines[0].definition_sha256 = null; }],
  ['INVOKER before', rows => { rows[0].routines[0].security_definer = false; }],
  ['definition mismatch before', rows => { rows[0].routines[0].definition_sha256 = '0'.repeat(64); }],
  ['definition mismatch after', rows => { rows[1].routines[5].definition_sha256 = '0'.repeat(64); }],
  ['owner still admin', rows => { rows[1].routines[0].owner = 'supabase_admin'; }],
  ['definition not preserved', rows => { rows[1].routines[0].definition_preserved = false; }],
  ['attributes not preserved', rows => { rows[1].routines[0].attributes_preserved = false; }],
  ['ACL not preserved', rows => { rows[1].routines[0].acl_preserved = false; }],
  ['changed contradicts before owner', rows => { rows[1].routines[0].changed = false; }],
  ['changed is truthy text', rows => { rows[1].routines[0].changed = 'true'; }],
];
for (const [name, mutate] of rejectedRecords) test('ownership rejects incomplete or altered confirmation: ' + name, () => {
  const rows = records(); mutate(rows);
  const value = parsed(rows);
  assert.equal(value.confirmed, false);
  assert.equal(JSON.stringify(value).includes('private-sentinel'), false);
});

for (const [name, value] of [
  ['raw SQL text', 'private-sentinel'], ['buffer instead of decoded string', Buffer.from(stdout(records()))],
  ['oversized stdout', stdout(records()) + ' '.repeat(8_192)], ['blank line', stdout(records()) + '\n'],
]) test('ownership rejects non-protocol stdout: ' + name, () => {
  const result = parseOwnershipResult(ok(value), IDENTITY);
  assert.equal(result.confirmed, false); assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});

test('failed SQL publishes only allowed before metadata, with no inferred rollback', () => {
  const rows = records(); rows[0].routines[5].definition_sha256 = '0'.repeat(64);
  const result = parseOwnershipResult({ status: 1, stdout: stdout([rows[0]]), stderr: 'private-sentinel raw SQL' }, IDENTITY);
  assert.equal(result.confirmed, false); assert.equal(result.before[5].definition_sha256, '0'.repeat(64));
  assert.deepEqual(Object.keys(result).sort(), ['before', 'confirmed', 'reason', 'run_id', 'schema', 'source_sha']);
  assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});

test('SQL fixes the seven signatures, validates all before ALTER and verifies before COMMIT', () => {
  const sql = ownershipSql(RUN, SHA);
  const values = [...sql.matchAll(/\(\d, '(public\.[^']+)', '([a-f0-9]{64})'\)/g)].map(([, signature, definition_sha256]) => ({ signature, definition_sha256 }));
  assert.deepEqual(values, OWNERSHIP_ROUTINES);
  assert.equal(OWNERSHIP_ROUTINES.length, 7);
  assert.ok(sql.indexOf('isolated_owner_precondition_rejected') < sql.indexOf('ALTER FUNCTION'));
  assert.ok(sql.indexOf('isolated_owner_acl_changed') < sql.indexOf("'stage', 'verified'"));
  assert.ok(sql.indexOf("'stage', 'verified'") < sql.lastIndexOf('COMMIT;'));
  assert.equal((sql.match(/ALTER FUNCTION/g) ?? []).length, 1, 'one fixed-signature loop, no additional DDL target');
  assert.equal(/REASSIGN|\bGRANT\b|\bREVOKE\b|SET (?:LOCAL )?ROLE|INSERT INTO|UPDATE public\.|DELETE FROM/i.test(sql), false);
  assert.match(sql, /pg_catalog\.sha256\(\s*pg_catalog\.convert_to\(pg_catalog\.pg_get_functiondef\(p\.oid\), 'UTF8'\)/);
  assert.match(sql, /\(p\.proacl IS NULL\) = \(b\.old_acl IS NULL\)/);
  assert.match(sql, /SELECT \* FROM expected EXCEPT SELECT \* FROM actual/);
  assert.match(sql, /SELECT \* FROM actual EXCEPT SELECT \* FROM expected/);
  assert.equal(sql.includes('__RUN_ID__') || sql.includes('__SOURCE_SHA__'), false);
});
