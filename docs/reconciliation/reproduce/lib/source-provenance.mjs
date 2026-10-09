// Proveniência compartilhada dos probes offline de reconciliação (#362 / R2-INF-015).
// Um caminho de checkout não é permissão para executar outra fonte: cada probe atesta o
// HEAD e o SHA-256 de cada módulo executado ANTES de ler/importar, e recusa divergência
// em vez de rotular um baseline fixo que não foi o executado.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// O Git é chamado pelo PATH (nunca por caminho absoluto) e com ambiente fixo:
// PATH/GIT_* do chamador não trocam o binário auditado.
const GIT = 'git';
const GIT_ENV = Object.freeze({
  PATH: '/usr/bin:/bin',
  LANG: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_OPTIONAL_LOCKS: '0',
});

export class ProvenanceError extends Error {
  constructor(message) {
    super(`Provenance refusal: ${message}`);
    this.name = 'ProvenanceError';
  }
}

export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readHead(root, { git = GIT } = {}) {
  try {
    return execFileSync(
      git,
      ['--no-replace-objects', '-c', 'core.fsmonitor=false', 'rev-parse', '--verify', 'HEAD^{commit}'],
      { cwd: root, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], env: GIT_ENV },
    ).trim();
  } catch (error) {
    throw new ProvenanceError(`cannot verify checkout HEAD at ${root} (${error.message})`);
  }
}

/**
 * Confere o HEAD do checkout e os bytes de cada fonte declarada em `pins`.
 * Nunca lê nem executa a fonte antes de atestar: qualquer divergência (HEAD diferente,
 * bytes diferentes, fonte ausente, pins incompletos, Git indisponível) recusa a corrida.
 * Devolve esperado, observado e verificado — separados, para o relato não confundir os dois.
 */
export function attestProvenance({ root, pins, head = (path) => readHead(path) }) {
  if (!pins || typeof pins.baseline_sha !== 'string' || !pins.source_sha256 || typeof pins.source_sha256 !== 'object') {
    throw new ProvenanceError('pins must declare baseline_sha and source_sha256');
  }
  const sorted = Object.fromEntries(Object.entries(pins.source_sha256).sort(([left], [right]) => (left < right ? -1 : 1)));
  if (Object.keys(sorted).length === 0) throw new ProvenanceError('pins must list at least one attested source');
  const expected = { baseline_sha: pins.baseline_sha, source_sha256: sorted };

  const checkout = realpathSync(root);
  let observedHead;
  try {
    observedHead = head(checkout);
  } catch (error) {
    if (error instanceof ProvenanceError) throw error;
    throw new ProvenanceError(`cannot verify checkout HEAD at ${checkout} (${error.message})`);
  }
  if (observedHead !== expected.baseline_sha) {
    throw new ProvenanceError(`checkout HEAD ${observedHead} is not the audited baseline ${expected.baseline_sha}`);
  }

  const observedSources = {};
  for (const [relativePath, expectedHash] of Object.entries(expected.source_sha256)) {
    if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHash)) {
      throw new ProvenanceError(`invalid expected hash for ${relativePath}`);
    }
    if (isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
      throw new ProvenanceError(`only fixed relative source paths are accepted: ${relativePath}`);
    }
    const absolute = resolve(checkout, relativePath);
    const inside = relative(checkout, absolute);
    if (!inside || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new ProvenanceError(`source escapes the checkout: ${relativePath}`);
    }
    let stats;
    try {
      stats = lstatSync(absolute);
    } catch (error) {
      throw new ProvenanceError(`missing attested source ${relativePath} (${error.message})`);
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new ProvenanceError(`attested source must be a regular file: ${relativePath}`);
    }
    const observed = sha256Of(readFileSync(absolute));
    if (observed !== expectedHash) {
      throw new ProvenanceError(`unattested source bytes for ${relativePath} (expected ${expectedHash}, observed ${observed})`);
    }
    observedSources[relativePath] = observed;
  }

  return Object.freeze({
    verified: true,
    expected,
    observed: { head: observedHead, source_sha256: observedSources },
  });
}

/**
 * Instala o bloqueio de rede ANTES da carga do código e devolve o registro das tentativas.
 * O relato usa `attempts.length`: tentativa observada é medição, `0` literal não é.
 */
export function installNetworkBlock(target = globalThis) {
  const attempts = [];
  target.fetch = (url, options) => {
    attempts.push({ url: String(url), method: options?.method ?? 'GET' });
    throw new ProvenanceError(`network request observed while the offline probe runs: ${url}`);
  };
  return { attempts };
}
