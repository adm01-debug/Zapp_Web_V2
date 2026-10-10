// Read-only provenance gate. Must run before any application import.
// Only versioned backend source/configuration bytes and the root audit manifest
// are read. No environment files, credentials, network or application code run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96';
export function verifyProviderSource(source, manifestPath = path.join(path.dirname(source), 'source-integrity.json')) {
  const actualHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualHead !== EXPECTED_HEAD) throw new Error('Refusing audit: checkout HEAD differs from the pinned commit');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.head_sha !== EXPECTED_HEAD || manifest.mismatches?.length !== 0 || !Array.isArray(manifest.files)) {
    throw new Error('Refusing audit: root source integrity manifest is incompatible');
  }
  const entries = manifest.files.filter(entry => entry.path.startsWith('supabase/functions/') || entry.path === 'supabase/config.toml');
  if (entries.length < 100) throw new Error('Refusing audit: unexpectedly incomplete backend manifest');
  for (const entry of entries) {
    const filePath = path.resolve(source, entry.path);
    if (!filePath.startsWith(path.resolve(source) + path.sep)) throw new Error('Invalid manifest path');
    const bytes = fs.readFileSync(filePath);
    const observed = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== entry.bytes || observed !== entry.git_blob_sha) {
      throw new Error(`Refusing audit: source integrity mismatch at ${entry.path}`);
    }
  }
  return {
    gate: 'passed_before_application_imports',
    expected_head: EXPECTED_HEAD,
    actual_head: actualHead,
    manifest: manifestPath,
    manifest_sha256: createHash('sha256').update(manifestBytes).digest('hex'),
    verified_files: entries.length,
    verified_scope: ['supabase/functions/**', 'supabase/config.toml'],
    comparison: 'Git blob SHA-1 and exact byte length against root verified manifest',
    application_transitive_imports: 'All local backend modules are within the verified prefix; only the explicitly described remote dependency stubs are outside it.',
  };
}
