import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_SCHEMA_VERSION = 1;

const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const IMPORT_PATTERNS = [
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function assertInside(parent, candidate, label) {
  const relative = path.relative(parent, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes ${parent}: ${candidate}`);
  }
}

async function regularFileOrNull(candidate) {
  try {
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are forbidden in Edge sources: ${candidate}`);
    return stat.isFile() ? candidate : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function resolveLocalImport(sourceFile, specifier, functionsRoot) {
  if (!specifier.startsWith('.')) return null;

  const unresolved = path.resolve(path.dirname(sourceFile), specifier);
  assertInside(functionsRoot, unresolved, `Import ${specifier}`);

  for (const extension of SOURCE_EXTENSIONS) {
    const file = await regularFileOrNull(`${unresolved}${extension}`);
    if (file) return file;
  }

  for (const extension of SOURCE_EXTENSIONS.slice(1)) {
    const file = await regularFileOrNull(path.join(unresolved, `index${extension}`));
    if (file) return file;
  }

  throw new Error(`Unresolved local import ${specifier} from ${sourceFile}`);
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function collectFunctionSources(entrypoint, functionsRoot) {
  const queue = [entrypoint];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = await readFile(current, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      const dependency = await resolveLocalImport(current, specifier, functionsRoot);
      if (dependency && !visited.has(dependency)) queue.push(dependency);
    }
  }

  return [...visited].sort();
}

function parseConfig(configSource) {
  const projectMatch = configSource.match(/^project_id\s*=\s*"([a-z0-9]+)"\s*$/m);
  if (!projectMatch) throw new Error('supabase/config.toml has no valid project_id');

  const settings = new Map();
  let currentFunction = null;
  for (const rawLine of configSource.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const section = line.match(/^\[functions\.([a-z0-9-]+)]$/);
    if (section) {
      currentFunction = section[1];
      if (settings.has(currentFunction)) throw new Error(`Duplicate function config: ${currentFunction}`);
      settings.set(currentFunction, {});
      continue;
    }

    if (line.startsWith('[')) {
      currentFunction = null;
      continue;
    }

    const verifyJwt = line.match(/^verify_jwt\s*=\s*(true|false)$/);
    if (verifyJwt && currentFunction) {
      settings.get(currentFunction).verifyJwt = verifyJwt[1] === 'true';
    }
  }

  return { projectRef: projectMatch[1], settings };
}

function hashSourceRecords(records, verifyJwt) {
  const hash = createHash('sha256');
  hash.update('zapp-edge-deployment-source-v1\0');
  hash.update(`verify_jwt=${verifyJwt}\0`);
  for (const record of records) {
    const name = Buffer.from(record.path, 'utf8');
    const content = Buffer.from(record.content);
    hash.update(`${name.length}:`);
    hash.update(name);
    hash.update('\0');
    hash.update(`${content.length}:`);
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function manifestDigest(manifestWithoutDigest) {
  return sha256(`zapp-edge-deployment-manifest-v1\0${JSON.stringify(manifestWithoutDigest)}`);
}

export async function buildDeploymentManifest({ repoRoot }) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const functionsRoot = path.join(absoluteRepoRoot, 'supabase', 'functions');
  const configPath = path.join(absoluteRepoRoot, 'supabase', 'config.toml');
  const configSource = await readFile(configPath, 'utf8');
  const { projectRef, settings } = parseConfig(configSource);

  const functionNames = [];
  for (const entry of await readdir(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared' || entry.name === 'graphify-out') continue;
    const entrypoint = path.join(functionsRoot, entry.name, 'index.ts');
    if (!await regularFileOrNull(entrypoint)) {
      throw new Error(`Function directory missing index.ts: ${entry.name}`);
    }
    functionNames.push(entry.name);
  }
  functionNames.sort();

  if (functionNames.length === 0) throw new Error('No Edge Functions found');
  for (const configuredName of settings.keys()) {
    if (!functionNames.includes(configuredName)) {
      throw new Error(`Function configured but missing entrypoint: ${configuredName}`);
    }
  }

  const fileRecords = new Map();
  const functions = [];

  for (const name of functionNames) {
    const entrypoint = path.join(functionsRoot, name, 'index.ts');
    const sourceFiles = await collectFunctionSources(entrypoint, functionsRoot);
    const records = [];

    for (const absolutePath of sourceFiles) {
      const content = await readFile(absolutePath);
      const relativePath = toPosix(path.relative(absoluteRepoRoot, absolutePath));
      const record = {
        path: relativePath,
        bytes: content.length,
        sha256: sha256(content),
        content,
      };
      records.push(record);
      fileRecords.set(relativePath, record);
    }

    const verifyJwt = settings.get(name)?.verifyJwt ?? true;
    functions.push({
      name,
      entrypoint: toPosix(path.relative(absoluteRepoRoot, entrypoint)),
      verify_jwt: verifyJwt,
      source_sha256: hashSourceRecords(records, verifyJwt),
      source_files: records.map((record) => record.path),
    });
  }

  const sourceFiles = [...fileRecords.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ content: _content, ...record }) => record);
  const manifestWithoutDigest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    project_ref: projectRef,
    config: {
      path: 'supabase/config.toml',
      sha256: sha256(configSource),
    },
    summary: {
      function_count: functions.length,
      source_file_count: sourceFiles.length,
      verify_jwt_true: functions.filter((fn) => fn.verify_jwt).length,
      verify_jwt_false: functions.filter((fn) => !fn.verify_jwt).length,
    },
    source_files: sourceFiles,
    functions,
  };

  return {
    ...manifestWithoutDigest,
    manifest_sha256: manifestDigest(manifestWithoutDigest),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function verifyManifestDigest(manifest) {
  const { manifest_sha256: actual, ...withoutDigest } = manifest;
  const expected = manifestDigest(withoutDigest);
  if (actual !== expected) {
    throw new Error(`Manifest digest mismatch: expected ${expected}, received ${actual}`);
  }
  return true;
}

export function parseRemoteFunctions(value) {
  const rows = Array.isArray(value) ? value : value?.data;
  if (!Array.isArray(rows)) throw new Error('Supabase Management API response is not an array');
  return rows;
}

export function buildDeploymentAttestation({
  manifest,
  remoteResponse,
  gitSha,
  runId,
  deploymentScope,
  createdAt = new Date().toISOString(),
}) {
  verifyManifestDigest(manifest);
  const remoteRows = parseRemoteFunctions(remoteResponse);
  const remoteByName = new Map();

  for (const row of remoteRows) {
    const name = row?.slug;
    if (typeof name !== 'string' || !name) throw new Error('Remote function without slug');
    if (remoteByName.has(name)) throw new Error(`Duplicate remote function: ${name}`);
    remoteByName.set(name, row);
  }

  const expectedNames = new Set(manifest.functions.map((fn) => fn.name));
  const missing = [...expectedNames].filter((name) => !remoteByName.has(name)).sort();
  const extra = [...remoteByName.keys()].filter((name) => !expectedNames.has(name)).sort();
  if (missing.length || extra.length) {
    throw new Error(`Remote function set mismatch; missing=[${missing.join(',')}], extra=[${extra.join(',')}]`);
  }

  const functions = manifest.functions.map((expected) => {
    const remote = remoteByName.get(expected.name);
    if (remote.verify_jwt !== expected.verify_jwt) {
      throw new Error(
        `${expected.name}: verify_jwt mismatch; expected=${expected.verify_jwt}, remote=${remote.verify_jwt}`,
      );
    }
    return {
      name: expected.name,
      source_sha256: expected.source_sha256,
      verify_jwt: expected.verify_jwt,
      remote_id: typeof remote.id === 'string' ? remote.id : null,
      remote_version: Number.isInteger(remote.version) ? remote.version : null,
      remote_status: typeof remote.status === 'string' ? remote.status : null,
      remote_created_at: typeof remote.created_at === 'string' ? remote.created_at : null,
      remote_updated_at: typeof remote.updated_at === 'string' ? remote.updated_at : null,
    };
  });

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    project_ref: manifest.project_ref,
    git_sha: gitSha,
    github_run_id: String(runId),
    deployment_scope: deploymentScope,
    created_at: createdAt,
    source_manifest_sha256: manifest.manifest_sha256,
    function_count: functions.length,
    functions,
  };
}
