import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { buildDeploymentAttestation, parseRemoteFunctions, verifyManifestDigest } from './manifest-lib.mjs';

export const CANONICAL_PROJECT = 'tnnnlkbymytvtqngbbqh';

// Only whitelisted structural fields enter artifacts; never store raw API bodies.
export function inventorySnapshot(rows, projectRef, observedAt = new Date().toISOString()) {
  if (projectRef !== CANONICAL_PROJECT) throw new Error('Noncanonical Edge project');
  const names = new Set();
  const functions = parseRemoteFunctions(rows).map((row) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(row?.slug ?? '') || names.has(row.slug)) {
      throw new Error('Invalid or duplicate remote slug');
    }
    names.add(row.slug);
    const date = typeof row.updated_at === 'number' || typeof row.updated_at === 'string'
      ? new Date(row.updated_at) : null;
    return {
      slug: row.slug,
      id: typeof row.id === 'string' ? row.id : null,
      version: Number.isInteger(row.version) && row.version > 0 ? row.version : null,
      status: row.status === 'ACTIVE' ? 'ACTIVE' : 'NOT_ACTIVE',
      verify_jwt: typeof row.verify_jwt === 'boolean' ? row.verify_jwt : null,
      ezbr_sha256: /^[a-f0-9]{64}$/.test(row.ezbr_sha256 ?? '') ? row.ezbr_sha256 : null,
      updated_at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    };
  }).sort((a, b) => a.slug.localeCompare(b.slug));
  return { project_ref: projectRef, observed_at: observedAt, functions };
}

export async function fetchRemoteInventory({ projectRef, token, fetchImpl = fetch }) {
  if (projectRef !== CANONICAL_PROJECT || !token?.trim()) throw new Error('Canonical project and access token required');
  let response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error('Management API transport failure (details omitted)'); }
  if (!response.ok) {
    const error = new Error(`Management API HTTP ${response.status}`);
    error.permanent = response.status === 401 || response.status === 403;
    throw error;
  }
  try { return parseRemoteFunctions(await response.json()); }
  catch { throw new Error('Management API invalid inventory (details omitted)'); }
}

export async function collectStableAttestation({
  manifest, before, gitSha, runId, deploymentScope,
  fetchInventory, sleep = delay, now = Date.now,
  // maxAttempts=144 (~24 min de teto): 36 (~6 min) esgotava antes da Management API
  // refletir o version bump — falso-negativo real observado em 26/09 nas duas vezes em
  // ~173-174s; teto dobrado 2x (36→72→144) para cobrir propagacoes lentas observadas
  // e margem de seguranca adequada. O polling (3 amostras identicas, 60s minimo) nao muda.
  intervalMs = 10_000, minimumObservationMs = 60_000, consecutiveSamples = 3, maxAttempts = 144,
  // Slugs que o proprio passo de deploy reportou como "No change found" (o
  // Supabase CLI pula, sem bump de versao, uma funcao cujo bundle local bate
  // byte a byte com o ja publicado). Vazio por padrao: sem isso, o
  // comportamento e identico ao anterior (toda funcao do escopo precisa de
  // bump de versao). So dispensamos o bump para uma funcao que: (a) esta
  // nesta lista, E (b) o digest remoto observado continua identico ao
  // baseline pre-deploy -- nunca aceitamos "sem mudanca" por inferencia pura
  // de digest, so quando o CLI mesmo disse que pulou essa funcao.
  knownUnchanged = [],
  // Emissor de progresso por amostra. Injetavel para teste; por padrao escreve no
  // stderr do job, que e o que o workflow captura. Recebe SEMPRE texto ja sanitizado
  // (ver a whitelist no catch): nunca conteudo de resposta da API, transporte ou token.
  log = (linha) => console.error(linha),
}) {
  verifyManifestDigest(manifest);
  if (manifest.project_ref !== CANONICAL_PROJECT || before?.project_ref !== manifest.project_ref) {
    throw new Error('Inventory project mismatch');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 2 || !Number.isInteger(consecutiveSamples)
    || consecutiveSamples < 2 || intervalMs < 0 || minimumObservationMs < 0
    || !Number.isFinite(intervalMs) || !Number.isFinite(minimumObservationMs)
    || !Array.isArray(knownUnchanged) || !knownUnchanged.every((name) => typeof name === 'string'))
  {
    throw new Error('Invalid stabilization policy');
  }
  const selected = deploymentScope === 'all' ? manifest.functions.map(fn => fn.name) : [deploymentScope];
  if (!selected.every(name => manifest.functions.some(fn => fn.name === name))) throw new Error('Unknown deployment scope');
  const baseline = inventorySnapshot(before.functions, manifest.project_ref).functions;
  const pre = new Map(baseline.map(fn => [fn.slug, fn]));
  const unchangedSet = new Set(knownUnchanged);
  const samples = [];
  const started = now();
  let previousDigest = null;
  let consecutive = 0;
  let lastCause = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const observedAt = new Date(now()).toISOString();
      const snapshot = inventorySnapshot(await fetchInventory(), manifest.project_ref, observedAt);
      const attestation = buildDeploymentAttestation({ manifest, remoteResponse: snapshot.functions, gitSha, runId, deploymentScope, createdAt: observedAt });
      const byName = new Map(snapshot.functions.map(fn => [fn.slug, fn]));
      for (const fn of attestation.functions) {
        if (!fn.remote_updated_at || !fn.remote_id) throw new Error('Missing remote identity or timestamp');
      }
      const acceptedByDigest = [];
      for (const name of selected) {
        const old = pre.get(name);
        if (!old) continue;
        const current = byName.get(name);
        if (old.id !== current.id) {
          throw new Error('Selected deployment not yet observed');
        }
        // E08 (run 36560547941, 2026-09-29): versao null no baseline (API retornou
        // version <= 0 ou nao-inteiro) impedia toda tentativa de estabilizacao por
        // 24 min. Sem baseline de versao verificavel, aceitar a funcao se o id bate.
        if (old.version === null) continue;
        const versionBumped = current.version !== null && current.version > old.version;
        if (versionBumped) continue;
        const digestUnchanged = old.ezbr_sha256 !== null && current.ezbr_sha256 === old.ezbr_sha256;
        // Contrato alterado em 01/10/2026 (run 36852598923): o Supabase CLI pula o
        // deploy de uma funcao cujo bundle bate byte a byte com o publicado e NAO
        // bumpa version, sinalizando "No change found in Function: X" -- e escreve
        // essa linha no STDERR. Enquanto a aceitacao dependia do log capturado pelo
        // workflow (knownUnchanged), o arquivo chegava vazio, a funcao ficava sem
        // bump e a atestacao queimava 144 amostras (~24 min) para falhar com
        // "did not stabilize", escondendo a causa. O digest remoto identico ao
        // baseline prova que nao havia bundle novo a publicar para essa funcao, e
        // passa a ser o sinal primario; o log do CLI continua aceito e agora cobre
        // o caso oposto (contradicao), logo abaixo.
        if (digestUnchanged) {
          acceptedByDigest.push(name);
          continue;
        }
        if (unchangedSet.has(name)) {
          // `permanentError` e privada do manifest-lib.mjs; aqui o padrao do
          // proprio modulo (ver o 401/403 em fetchRemoteInventory).
          const contradicao = new Error(`${name}: o passo de deploy reportou "No change found" e o bundle remoto mudou desde o baseline (deploy concorrente ou sinal do CLI divergente); a atestacao nao pode inferir o que foi publicado`);
          contradicao.permanent = true;
          throw contradicao;
        }
        throw new Error('Selected deployment not yet observed');
      }
      const digest = createHash('sha256').update(JSON.stringify(snapshot.functions)).digest('hex');
      consecutive = digest === previousDigest ? consecutive + 1 : 1;
      previousDigest = digest;
      samples.push({ attempt, observed_at: observedAt, inventory_sha256: digest, valid: true });
      log(`[edge-inventory] amostra ${attempt}/${maxAttempts}: inventario estavel ${consecutive}/${consecutiveSamples} amostras identicas`);
      if (consecutive >= consecutiveSamples && now() - started >= minimumObservationMs) {
        const changedOutsideScope = snapshot.functions.filter(fn => !selected.includes(fn.slug)
          && JSON.stringify(fn) !== JSON.stringify(pre.get(fn.slug))).map(fn => fn.slug);
        return {
          ...attestation,
          verification: {
            mode: 'stable-management-inventory-v1',
            consecutive_samples: consecutive, observation_ms: now() - started, samples,
            selected_functions: selected, changed_outside_scope: changedOutsideScope,
            // Funcoes do escopo aceitas sem bump de versao porque o digest remoto
            // segue identico ao baseline (nada novo a publicar). Fica explicito no
            // artefato o que foi aceito por digest -- nao e prova de equivalencia
            // fonte<->bundle, so de que o bundle publicado nao mudou.
            accepted_without_version_bump: acceptedByDigest,
            source_to_bundle_equivalence_proven: false,
            limitation: 'Stable metadata associates source inputs and observed deployment versions; it does not reproduce remote bundle bytes or prove business E2E.',
          },
        };
      }
    } catch (error) {
      if (error.permanent) throw new Error(error.message);
      // Whitelist de mensagens PROPRIAS (conjunto de funcoes, identidade, escopo):
      // sao seguras e nomeiam a causa. Qualquer outra coisa (falha de API/transporte)
      // vira um rotulo generico -- o contrato do modulo e nunca emitir conteudo de
      // resposta, transporte ou token.
      const bruta = typeof error?.message === 'string' ? error.message : '';
      const nossa = /^(Remote function set mismatch|Selected deployment not yet observed|Missing remote identity or timestamp|Unknown deployment scope)/.test(bruta);
      lastCause = nossa ? bruta : `falha transitoria (${error?.name || 'Error'})`;
      previousDigest = null;
      consecutive = 0;
      samples.push({ attempt, observed_at: new Date(now()).toISOString(), valid: false, cause: lastCause });
      log(`[edge-inventory] amostra ${attempt}/${maxAttempts}: ${lastCause}`);
    }
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  const causa = lastCause ? `; ultima causa observada: ${lastCause}` : '';
  throw new Error(`Remote inventory did not stabilize after ${maxAttempts} attempts; deployment NOT attested${causa}`);
}
