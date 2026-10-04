import { appendFileSync, readFileSync } from 'node:fs';

// E58 (auditoria de GitHub Actions, 2026-10-01): todo deploy reescrevia TODOS os
// secrets das edges, sempre. Sao 4 blocos de escrita, condicionados ao escopo da
// funcao (crm-integration, promogifts-catalog, fetch-link-preview) mas NUNCA ao
// fato de o valor ter mudado. Consequencia: cada deploy de edge reescreve 7
// secrets e forca reload de todas as funcoes, mesmo quando nada mudou -- e, pior,
// um rollback tambem reescreve.
//
// Decisao desta etapa: reescrever APENAS quando
//   (a) o operador pediu (`rotate_secrets=true`), ou
//   (b) o `secrets list` do projeto divergir do que o escopo espera, ou
//   (c) a leitura do remoto falhar (cai no comportamento antigo, de proposito).
// Em rollback (`source_ref` preenchido) NUNCA reescrever: o objetivo e' voltar ao
// estado anterior, nao mexer em configuracao.
//
// R2-INF-001 (auditoria R2, 2026-10-03): em ensaio (dry_run) NUNCA reescrever.
// O workflow passa `--dry-run` e a decisao devolve reescrever=false com motivo
// de ensaio -- o modo so' registra o que faria. E' a segunda trava: a primeira
// e' o `if: inputs.dry_run != true` no passo "Configurar secrets nas edges".
//
// Limite assumido e declarado: a comparacao e' do CONJUNTO DE NOMES, nao do valor.
// O `secrets list` do Supabase mostra NAME + DIGEST e nunca o valor, mas o
// algoritmo do digest nao e' documentado -- reconstrui-lo a partir do que parece
// produziria um teste que sempre diz "divergente" (reescreve sempre, sem ganho) ou
// sempre "igual" (deixa de propagar rotacao real). Um nome ausente, porem, e'
// divergencia que da' para medir sem adivinhar -- e para propagar a rotacao de um
// VALOR existe o `rotate_secrets=true`, explicito.

/** Secrets que o workflow escreve em TODO deploy, quando ha valor. */
export const NOMES_GERAIS = ['CRON_SECRET'];

/** Secrets por escopo de funcao (os blocos do passo "Configurar secrets nas edges"). */
export const NOMES_POR_ESCOPO = {
  'crm-integration': ['EXTERNAL_SUPABASE_URL', 'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'],
  'promogifts-catalog': ['PROMOGIFTS_SUPABASE_URL', 'PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY'],
  'fetch-link-preview': ['PREVIEW_EGRESS_PROXY_URL', 'PREVIEW_EGRESS_SHARED_SECRET'],
};

/**
 * Nomes que um deploy com este escopo escreveria. FN vazio = deploy total, logo
 * todos os escopos entram.
 */
export function nomesDeSecretsParaEscopo(fn) {
  const alvo = String(fn ?? '').trim();
  const escopos = alvo === '' ? Object.keys(NOMES_POR_ESCOPO) : [alvo];
  const nomes = new Set(NOMES_GERAIS);
  for (const escopo of escopos) {
    for (const nome of NOMES_POR_ESCOPO[escopo] ?? []) nomes.add(nome);
  }
  return [...nomes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Decisao de reescrever. `nomesRemotos` pode ser `null` = leitura falhou.
 * Devolve `{ reescrever, motivo }` -- o motivo vai para o log, sempre.
 */
export function decidirReescrita({ rotateSecrets = false, emRollback = false, emEnsaio = false, nomesRemotos = null, nomesEsperados = [] } = {}) {
  if (emEnsaio) {
    return { reescrever: false, motivo: 'ensaio (dry_run): decisao apenas registrada, nenhum secret sera reescrito' };
  }
  if (emRollback) {
    return { reescrever: false, motivo: 'rollback (source_ref preenchido): secrets inalterados' };
  }
  if (rotateSecrets) {
    return { reescrever: true, motivo: 'rotate_secrets=true: reescrevendo os secrets do escopo' };
  }
  if (nomesRemotos === null) {
    return {
      reescrever: true,
      motivo: 'nao foi possivel ler os secrets do projeto: mantendo o comportamento anterior (reescrever)',
    };
  }
  const remotos = new Set(nomesRemotos);
  const ausentes = nomesEsperados.filter((nome) => !remotos.has(nome));
  if (ausentes.length > 0) {
    return { reescrever: true, motivo: `secrets ausentes no projeto: ${ausentes.join(', ')}` };
  }
  return { reescrever: false, motivo: 'secrets inalterados: nenhum nome esperado esta ausente' };
}

/**
 * Extrai APENAS os nomes do `secrets list`. Tolerante a forma (array de objetos,
 * objeto com `secrets`, ou a tabela NAME/DIGEST do modo texto) porque a forma exata
 * do JSON nao foi medida -- mas nao adivinha: o que nao casar devolve `null`, que a
 * decisao trata como leitura falhada (comportamento anterior preservado).
 */
export function extrairNomesDeSecrets(entrada) {
  const texto = String(entrada ?? '').trim();
  if (texto === '') return null;
  try {
    const dado = JSON.parse(texto);
    const lista = Array.isArray(dado) ? dado : (dado && Array.isArray(dado.secrets) ? dado.secrets : null);
    if (!lista) return null;
    const nomes = lista
      .map((item) => (typeof item === 'string' ? item : (item && (item.name ?? item.Name))))
      .filter((nome) => typeof nome === 'string' && /^[A-Z][A-Z0-9_]*$/.test(nome));
    return nomes.length > 0 ? nomes : null;
  } catch {
    // Tabela de texto: NAME seguido de DIGEST, cabecalho NAME/DIGEST no topo.
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const nomes = linhas
      .map((l) => l.split(/\s+/)[0])
      .filter((nome) => /^[A-Z][A-Z0-9_]*$/.test(nome) && !['NAME', 'DIGEST'].includes(nome));
    return nomes.length > 0 ? nomes : null;
  }
}

// --- CLI (usado pelo passo do workflow) ------------------------------------
if (process.argv[1]?.endsWith('secrets-scope.mjs')) {
  const args = process.argv.slice(2);
  const bandeira = (nome) => args.includes(nome);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const fn = valor('--fn') ?? '';
  const arquivo = valor('--lista');
  const nomesEsperados = nomesDeSecretsParaEscopo(fn);
  let nomesRemotos = null;
  if (arquivo) {
    try {
      nomesRemotos = extrairNomesDeSecrets(readFileSync(arquivo, 'utf8'));
    } catch {
      nomesRemotos = null; // arquivo ausente = leitura falhada, nao "vazio"
    }
  }
  const decisao = decidirReescrita({
    rotateSecrets: bandeira('--rotate'),
    emRollback: bandeira('--rollback'),
    emEnsaio: bandeira('--dry-run'),
    nomesRemotos,
    nomesEsperados,
  });
  console.log(`escopo="${fn || '(total)'}" esperados=${nomesEsperados.length} [${nomesEsperados.join(', ')}]`);
  console.log(`decisao=${decisao.reescrever ? 'REESCREVER' : 'MANTER'} -- ${decisao.motivo}`);
  // A saida consumida pelo workflow e' uma linha so', sem log junto.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `reescrever=${decisao.reescrever}\nmotivo=${decisao.motivo}\n`);
  }
  process.exit(0);
}
