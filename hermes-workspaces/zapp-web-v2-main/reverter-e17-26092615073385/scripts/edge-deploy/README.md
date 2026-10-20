# Edge deployment manifest and smoke gates

The committed `supabase/deployment-manifest.json` is the deterministic source
manifest for every Edge Function. It records:

- the canonical Supabase project ref;
- the exact `verify_jwt` contract derived from `supabase/config.toml`;
- every local source file reachable through relative imports;
- per-file and per-function SHA-256 digests;
- a domain-separated digest for the complete manifest.

Generate or verify it locally:

```bash
node scripts/edge-deploy/generate-manifest.mjs
node scripts/edge-deploy/generate-manifest.mjs --check
node --test scripts/edge-deploy/*.unit.mjs
```

The production workflow runs only from `refs/heads/main`. After deployment it:

1. captures a whitelisted pre-deploy Management API inventory, then polls after deployment;
2. requires exact local/remote function-set equality;
3. requires exact `verify_jwt` equality for every function;
4. requires ACTIVE functions with valid SHA-256 bundle digests, timestamps and
   advanced versions for the selected scope, observes at least 60 seconds and
   three consecutive identical inventories (up to 18 attempts, 10-second intervals);
5. emits an attestation associating observed remote versions with the source
   manifest and GitHub SHA; records out-of-scope changes separately;
6. runs a non-mutating smoke matrix against every function;
7. stores pre-deploy metadata, the manifest, stable attestation, and smoke evidence as a GitHub artifact.

The positive smoke is an allowed-origin CORS preflight. The negative smoke
rejects wildcard/reflected untrusted origins. Functions protected by the
Supabase JWT gateway also receive an anonymous empty request that must return
`401`. Public webhooks and cron endpoints never receive a business request from
the smoke runner, so the deployment gate cannot create or change application
data.

The source hash is an auditable digest of the exact inputs supplied from the
repository. The Management API exposes `ezbr_sha256`, the platform's bundle
digest, which is distinct from our local source digest. Polling detects transient
inventory states but cannot rule out later changes or independently reproduce
the provider build. `source_to_bundle_equivalence_proven` remains **false**.
This is not a cryptographic proof that source bytes equal remote runtime bytes,
nor an authenticated business E2E. No full deploy is needed just to collect evidence.

The single-snapshot `verify-remote.mjs` remains available for historical/offline
inspection; the production workflow uses `collect-remote.mjs`. Failure to stabilize
does not undo an already completed deploy: inspect the inventory before any retry.
The collector is extracted from the trusted triggering `GITHUB_SHA`, while source
inputs remain at `DEPLOYED_GIT_SHA`; this keeps rollback to an older ancestor
working even when that ancestor does not contain the new collector.
