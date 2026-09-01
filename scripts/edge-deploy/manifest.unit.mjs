import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildDeploymentAttestation,
  buildDeploymentManifest,
  serializeManifest,
  verifyManifestDigest,
} from './manifest-lib.mjs';

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zapp-edge-manifest-'));
  await mkdir(path.join(root, 'supabase', 'functions', '_shared'), { recursive: true });
  await mkdir(path.join(root, 'supabase', 'functions', 'alpha'), { recursive: true });
  await mkdir(path.join(root, 'supabase', 'functions', 'beta'), { recursive: true });
  await writeFile(
    path.join(root, 'supabase', 'config.toml'),
    'project_id = "abcdefghijklmnopqrst"\n\n[functions.alpha]\nverify_jwt = false\n',
  );
  await writeFile(
    path.join(root, 'supabase', 'functions', '_shared', 'common.ts'),
    'export const common = "v1";\n',
  );
  await writeFile(
    path.join(root, 'supabase', 'functions', 'alpha', 'index.ts'),
    'import { common } from "../_shared/common.ts";\nconsole.log(common);\n',
  );
  await writeFile(
    path.join(root, 'supabase', 'functions', 'beta', 'index.ts'),
    'import "https://deno.land/std/example.ts";\nconsole.log("beta");\n',
  );
  return root;
}

test('buildDeploymentManifest is deterministic and follows shared imports', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await buildDeploymentManifest({ repoRoot: root });
  const second = await buildDeploymentManifest({ repoRoot: root });
  assert.equal(serializeManifest(first), serializeManifest(second));
  assert.equal(first.summary.function_count, 2);
  assert.equal(first.summary.verify_jwt_false, 1);
  assert.equal(first.summary.verify_jwt_true, 1);
  assert.equal(first.functions[0].name, 'alpha');
  assert.equal(first.functions[0].verify_jwt, false);
  assert.deepEqual(first.functions[0].source_files, [
    'supabase/functions/_shared/common.ts',
    'supabase/functions/alpha/index.ts',
  ]);
  assert.deepEqual(first.functions[1].source_files, ['supabase/functions/beta/index.ts']);
  assert.equal(verifyManifestDigest(first), true);

  await writeFile(
    path.join(root, 'supabase', 'functions', '_shared', 'common.ts'),
    'export const common = "v2";\n',
  );
  const changed = await buildDeploymentManifest({ repoRoot: root });
  assert.notEqual(changed.functions[0].source_sha256, first.functions[0].source_sha256);
  assert.equal(changed.functions[1].source_sha256, first.functions[1].source_sha256);
  assert.throws(() => verifyManifestDigest({ ...first, project_ref: 'tampered' }), /digest mismatch/);
});

test('buildDeploymentManifest rejects config for a missing function', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'supabase', 'config.toml'),
    'project_id = "abcdefghijklmnopqrst"\n\n[functions.missing]\nverify_jwt = false\n',
  );
  await assert.rejects(
    buildDeploymentManifest({ repoRoot: root }),
    /Function configured but missing entrypoint: missing/,
  );
});

test('buildDeploymentManifest rejects a function directory without index.ts', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'supabase', 'functions', 'incomplete'));
  await assert.rejects(
    buildDeploymentManifest({ repoRoot: root }),
    /Function directory missing index\.ts: incomplete/,
  );
});

test('buildDeploymentAttestation rejects missing, extra, and JWT-drifted functions', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = await buildDeploymentManifest({ repoRoot: root });
  const base = {
    manifest,
    gitSha: 'a'.repeat(40),
    runId: '123',
    deploymentScope: 'all',
    createdAt: '2026-08-31T00:00:00.000Z',
  };
  const remote = [
    { id: '1', slug: 'alpha', version: 3, status: 'ACTIVE', verify_jwt: false },
    { id: '2', slug: 'beta', version: 4, status: 'ACTIVE', verify_jwt: true },
  ];

  const attestation = buildDeploymentAttestation({ ...base, remoteResponse: remote });
  assert.equal(attestation.function_count, 2);
  assert.equal(attestation.functions[0].remote_version, 3);
  assert.equal(attestation.source_manifest_sha256, manifest.manifest_sha256);

  assert.throws(
    () => buildDeploymentAttestation({ ...base, remoteResponse: remote.slice(0, 1) }),
    /missing=\[beta]/,
  );
  assert.throws(
    () => buildDeploymentAttestation({
      ...base,
      remoteResponse: [...remote, { slug: 'zombie', verify_jwt: true }],
    }),
    /extra=\[zombie]/,
  );
  assert.throws(
    () => buildDeploymentAttestation({
      ...base,
      remoteResponse: remote.map((row) => row.slug === 'alpha' ? { ...row, verify_jwt: true } : row),
    }),
    /verify_jwt mismatch/,
  );
});
