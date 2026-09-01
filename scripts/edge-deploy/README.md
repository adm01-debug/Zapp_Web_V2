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

1. fetches the Supabase Management API inventory;
2. requires exact local/remote function-set equality;
3. requires exact `verify_jwt` equality for every function;
4. emits an attestation that binds remote versions to the source manifest and
   GitHub SHA;
5. runs a non-mutating smoke matrix against every function;
6. stores the manifest, attestation, and smoke evidence as a GitHub artifact.

The positive smoke is an allowed-origin CORS preflight. The negative smoke
rejects wildcard/reflected untrusted origins. Functions protected by the
Supabase JWT gateway also receive an anonymous empty request that must return
`401`. Public webhooks and cron endpoints never receive a business request from
the smoke runner, so the deployment gate cannot create or change application
data.

The source hash is an auditable digest of the exact inputs supplied from the
repository. Supabase does not expose a post-deployment bundle digest, so the
remote attestation records the platform function version and update metadata;
it must not be described as a cryptographic proof of remote runtime bytes.
