#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fetchRemoteInventory, inventorySnapshot, collectStableAttestation, CANONICAL_PROJECT } from './stable-inventory.mjs';
import { verifyManifestDigest } from './manifest-lib.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const allowed = new Set(['--manifest', '--output', '--before', '--git-sha', '--run-id', '--scope']);
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--snapshot') { args.snapshot = true; continue; }
    if (!allowed.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid collector arguments');
    args[argv[i].slice(2)] = argv[++i];
  }
  if (!args.manifest || !args.output) throw new Error('Manifest and output required');
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  verifyManifestDigest(manifest);
  if (manifest.project_ref !== CANONICAL_PROJECT || process.env.PROJECT_REF !== CANONICAL_PROJECT) throw new Error('Canonical project required');
  const fetchInventory = () => fetchRemoteInventory({ projectRef: manifest.project_ref, token: process.env.SUPABASE_ACCESS_TOKEN });
  let evidence;
  if (args.snapshot) evidence = inventorySnapshot(await fetchInventory(), manifest.project_ref);
  else {
    if (!args.before || !/^[a-f0-9]{40}$/.test(args['git-sha'] ?? '') || !/^\d+$/.test(args['run-id'] ?? '') || !args.scope) throw new Error('Before snapshot, immutable SHA, run and scope required');
    evidence = await collectStableAttestation({ manifest, before: JSON.parse(await readFile(args.before, 'utf8')),
      gitSha: args['git-sha'], runId: args['run-id'], deploymentScope: args.scope, fetchInventory });
  }
  await writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(args.snapshot ? 'Pre-deploy structural snapshot captured.' : `Stable deployment observed: ${evidence.function_count} functions; not a binary source/bundle equivalence proof.`);
}
main().catch(() => {
  // Arguments, parser errors and API bodies can contain sensitive data.
  console.error('Edge inventory collection failed; no successful attestation emitted. Check identity, API access, versions and stabilization.');
  process.exitCode = 1;
});
