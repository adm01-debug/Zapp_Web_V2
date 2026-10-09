import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// ---------------------------------------------------------------------------
// X197 (docs/talkx/v4/etapas/F16-qualidade-e-release.md:68-77) — a documentação
// do módulo Talk X misturava HISTÓRIA e PLANO, e o arquivo dos predecessores
// seguia pendente. O aceite da etapa pede duas coisas verificáveis:
//
//   (a) "Mover os três planos antigos e os documentos de sessão para
//        `docs/talkx/_arquivo/`" — os planos substituídos não podem continuar na
//        raiz do módulo, onde são lidos como estado vigente (o README antigo
//        listava o V3 e o E01–E100 lado a lado com o plano vigente);
//   (b) "Acrescentar ao CI um verificador que falha se um documento de
//        `docs/talkx/` citar arquivo de código que não existe" — a auditoria de
//        29/09 refutou 40+ afirmações, inclusive componentes que NUNCA existiram
//        (`TalkXSegmentBuilder.tsx`, `TalkXCampaignPaused.tsx`).
//
// Este arquivo É o verificador: `ci.yml:90` roda `node --test scripts/ci/*.unit.mjs`,
// então a regra entra no CI sem tocar workflow. A regra é uma função pura sobre a
// árvore de documentos (`violacoes`), exercitada por fixtures de árvore virtual nos
// dois lados (o que ela recusa e o que ela aceita) e depois aplicada à árvore REAL
// de `docs/talkx/`.
//
// Escopo declarado: o verificador de referências cobre os documentos CORRENTES do
// módulo — os que dizem o que o módulo TEM. `_arquivo/`, `v4/etapas/` e
// `v4/inventario/` descrevem o que o módulo DEVE ter (plano e inventário) e ficam
// fora; por isso a raiz do módulo não aceita documento não classificado: ou é
// corrente (lista abaixo), ou vai para o arquivo.

const RAIZ = join(fileURLToPath(import.meta.url), '..', '..', '..');
const DOCS = join(RAIZ, 'docs', 'talkx');
const ARQUIVO = '_arquivo';

/** Documentos substituídos: planos antigos e documentos de sessão (X197). */
export const PREDECESSORES = [
  'PLANO_IMPLEMENTACAO_TALKX_100.md',
  'PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md',
  'PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md',
  'AUDITORIA_PLANO_TALKX_2026-09-29.md',
  'HANDOFF_SESSAO_03.md',
];

/** Documentos correntes do módulo (caminho relativo a `docs/talkx/`). */
export const DOCS_CORRENTES = [
  'README.md',
  'PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md',
  'ARQUITETURA.md',
  'OPERACAO.md',
  'PARIDADE.md',
  'CHANGELOG_TALKX.md',
  'CONVERSOES.md',
  'v4/README.md',
  'v4/STATUS.md',
  'v4/DECISOES.md',
];

/** Caminho com cara de arquivo do repositório (o que a auditoria refutou). */
const CAMINHO_DE_CODIGO =
  /(?:^|[\s(`'"\[])((?:src|supabase|scripts|e2e|tests|public|\.github)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|sql|ya?ml|sh|py))(?![A-Za-z0-9_])/gim;

/** Padrões de PASTA do `.gitignore` (sem curinga e sem negação) = artefato gerado. */
export function diretoriosGerados(raiz) {
  return readFileSync(join(raiz, '.gitignore'), 'utf8')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(
      (linha) =>
        linha !== '' &&
        !linha.startsWith('#') &&
        !linha.startsWith('!') &&
        linha.endsWith('/') &&
        !linha.includes('*') &&
        !linha.includes('?'),
    )
    .map((linha) => linha.replace(/^\//, ''));
}

const ehGerado = (caminho, gerados) => gerados.some((dir) => caminho.startsWith(dir));

/**
 * Violações das regras. Lista vazia = a documentação do módulo está no lugar.
 *
 * @param {object} arvore
 * @param {Record<string,string>} arvore.docs caminho relativo a `docs/talkx/` -> conteúdo
 * @param {(caminho: string) => boolean} arvore.existeNoRepositorio caminho relativo à raiz do repo
 * @param {string[]} [arvore.gerados] pastas de artefato gerado (padrões do `.gitignore`)
 */
export function violacoes({ docs, existeNoRepositorio, gerados = [] }) {
  const falhas = [];
  const temDoc = (caminho) => Object.prototype.hasOwnProperty.call(docs, caminho);

  // ── 1) os predecessores estão no arquivo, e só nele ──
  for (const nome of PREDECESSORES) {
    if (temDoc(nome)) {
      falhas.push(
        `docs/talkx/${nome} continua na raiz do módulo: plano substituído tem de estar em docs/talkx/${ARQUIVO}/${nome}`,
      );
    }
    if (!temDoc(`${ARQUIVO}/${nome}`)) {
      falhas.push(`predecessor não arquivado: falta docs/talkx/${ARQUIVO}/${nome}`);
    }
  }

  // ── 2) o índice do arquivo existe e nomeia cada documento arquivado ──
  const indice = docs[`${ARQUIVO}/README.md`];
  if (indice === undefined) {
    falhas.push(`falta o índice do arquivo: docs/talkx/${ARQUIVO}/README.md`);
  } else {
    for (const nome of PREDECESSORES) {
      if (temDoc(`${ARQUIVO}/${nome}`) && !indice.includes(nome)) {
        falhas.push(`o índice do arquivo não registra ${nome}`);
      }
    }
    for (const caminho of Object.keys(docs)) {
      if (!caminho.startsWith(`${ARQUIVO}/`) || caminho === `${ARQUIVO}/README.md`) continue;
      const nome = caminho.slice(ARQUIVO.length + 1);
      if (!indice.includes(nome)) {
        falhas.push(`documento arquivado sem registro no índice: docs/talkx/${caminho}`);
      }
    }
  }

  // ── 3) a raiz do módulo só tem documento CORRENTE ──
  for (const caminho of Object.keys(docs)) {
    if (caminho.includes('/')) continue;
    if (!DOCS_CORRENTES.includes(caminho)) {
      falhas.push(
        `documento não classificado na raiz do módulo: docs/talkx/${caminho} (corrente: entrada em DOCS_CORRENTES; substituído: docs/talkx/${ARQUIVO}/)`,
      );
    }
  }

  // ── 4) o README do módulo aponta para o arquivo e para cada documento corrente ──
  const indiceModulo = docs['README.md'];
  if (indiceModulo !== undefined) {
    if (!indiceModulo.includes(`${ARQUIVO}/`)) {
      falhas.push(`docs/talkx/README.md não aponta para docs/talkx/${ARQUIVO}/`);
    }
    for (const caminho of DOCS_CORRENTES) {
      if (caminho === 'README.md') continue;
      if (!indiceModulo.includes(caminho)) {
        falhas.push(`docs/talkx/README.md não cita o documento corrente ${caminho}`);
      }
    }
  }

  // ── 5) documento corrente só cita arquivo de código que existe ──
  for (const caminho of DOCS_CORRENTES) {
    const conteudo = docs[caminho];
    if (conteudo === undefined) {
      falhas.push(`documento corrente ausente: falta docs/talkx/${caminho}`);
      continue;
    }
    CAMINHO_DE_CODIGO.lastIndex = 0;
    const citados = new Set();
    let achado;
    while ((achado = CAMINHO_DE_CODIGO.exec(conteudo)) !== null) citados.add(achado[1]);
    for (const citado of citados) {
      if (existeNoRepositorio(citado) || ehGerado(citado, gerados)) continue;
      falhas.push(`docs/talkx/${caminho} cita arquivo de código que não existe: ${citado}`);
    }
  }

  return falhas;
}

function arvoreReal() {
  const docs = {};
  const varrer = (relativo) => {
    const absoluto = join(DOCS, relativo);
    if (statSync(absoluto).isDirectory()) {
      for (const entrada of readdirSync(absoluto)) {
        varrer(relativo === '' ? entrada : `${relativo}/${entrada}`);
      }
      return;
    }
    if (relativo.endsWith('.md')) docs[relativo] = readFileSync(absoluto, 'utf8');
  };
  varrer('');
  return {
    docs,
    existeNoRepositorio: (caminho) => {
      try {
        return statSync(join(RAIZ, caminho)).isFile();
      } catch {
        return false;
      }
    },
    gerados: diretoriosGerados(RAIZ),
  };
}

function assertAcusa(arvore, trecho, contexto) {
  const falhas = violacoes(arvore);
  assert.ok(
    falhas.some((f) => f.includes(trecho)),
    `${contexto}: esperava violação contendo "${trecho}", veio ${JSON.stringify(falhas)}`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures: árvore virtual, para provar os dois lados sem depender do repo.
// ---------------------------------------------------------------------------

const CORPO_README = [
  '# Talk X · Campanhas',
  '',
  '| Arquivo | Conteúdo |',
  '|---|---|',
  ...DOCS_CORRENTES.filter((c) => c !== 'README.md' && !c.startsWith('v4/')).map(
    (c) => `| [${c}](./${c}) | corrente |`,
  ),
  `| [${ARQUIVO}/](./${ARQUIVO}/README.md) | planos substituídos |`,
  ...DOCS_CORRENTES.filter((c) => c.startsWith('v4/')).map((c) => `| [${c}](./${c}) | corrente |`),
  ...PREDECESSORES.map((p) => `| [${p}](./${ARQUIVO}/${p}) | arquivado |`),
].join('\n');

const INDICE_ARQUIVO = ['# Arquivo', '', ...PREDECESSORES.map((p) => `- [${p}](./${p})`)].join('\n');

function arvoreBoa({ existe = () => true, gerados = [] } = {}) {
  const docs = { 'README.md': CORPO_README, [`${ARQUIVO}/README.md`]: INDICE_ARQUIVO };
  for (const caminho of DOCS_CORRENTES) docs[caminho] ??= `# ${caminho}\n`;
  for (const nome of PREDECESSORES) docs[`${ARQUIVO}/${nome}`] = `# ${nome}\n`;
  return { docs, existeNoRepositorio: existe, gerados };
}

test('fixture: árvore íntegra passa', () => {
  assert.deepEqual(violacoes(arvoreBoa()), []);
});

test('fixture: predecessor na raiz do módulo é recusado', () => {
  const arvore = arvoreBoa();
  arvore.docs[PREDECESSORES[0]] = '# plano antigo';
  assertAcusa(arvore, 'continua na raiz do módulo', 'plano antigo não arquivado');
});

test('fixture: predecessor sem arquivo é recusado', () => {
  const arvore = arvoreBoa();
  delete arvore.docs[`${ARQUIVO}/${PREDECESSORES[1]}`];
  assertAcusa(arvore, 'predecessor não arquivado', 'arquivo vazio');
});

test('fixture: documento arquivado fora do índice é recusado', () => {
  const arvore = arvoreBoa();
  arvore.docs[`${ARQUIVO}/ANOTACOES.md`] = '# solto';
  assertAcusa(arvore, 'documento arquivado sem registro no índice', 'índice incompleto');
});

test('fixture: documento novo na raiz do módulo é recusado', () => {
  const arvore = arvoreBoa();
  arvore.docs['PLANO_TALKX_V5_100_ETAPAS.md'] = '# plano novo';
  assertAcusa(arvore, 'documento não classificado na raiz do módulo', 'plano sem classificação');
});

test('fixture: README sem o arquivo é recusado', () => {
  const arvore = arvoreBoa();
  arvore.docs['README.md'] = '# Talk X';
  assertAcusa(arvore, `não aponta para docs/talkx/${ARQUIVO}/`, 'índice sem o arquivo');
});

test('fixture: citação de código inexistente é recusada', () => {
  const arvore = arvoreBoa({ existe: (caminho) => caminho !== 'src/components/talkx/TalkXView.ts' });
  arvore.docs['ARQUITETURA.md'] = 'Ver `src/components/talkx/TalkXView.ts`.';
  assertAcusa(arvore, 'cita arquivo de código que não existe', 'componente que nunca existiu');
});

test('fixture: citação de código existente passa', () => {
  const arvore = arvoreBoa({ existe: (caminho) => caminho === 'src/components/talkx/TalkXView.tsx' });
  arvore.docs['ARQUITETURA.md'] = 'Ver `src/components/talkx/TalkXView.tsx`.';
  assert.deepEqual(violacoes(arvore), []);
});

test('fixture: artefato gerado (ignorado pelo git) não é código ausente', () => {
  const sessionPath = `${['e2e', '.auth'].join('/')}/user.json`;
  const arvore = arvoreBoa({ existe: () => false, gerados: [`${['e2e', '.auth'].join('/')}/`] });
  arvore.docs['OPERACAO.md'] = `> a geração de \`${sessionPath}\` falha sem \`--project\`.`;
  assert.deepEqual(violacoes(arvore), []);
  const semIgnorar = arvoreBoa({ existe: () => false });
  semIgnorar.docs['OPERACAO.md'] = `> a geração de \`${sessionPath}\` falha sem \`--project\`.`;
  assertAcusa(semIgnorar, 'cita arquivo de código que não existe', 'mesmo caminho sem .gitignore');
});

// ---------------------------------------------------------------------------
// Documentação real do módulo.
// ---------------------------------------------------------------------------

test('docs/talkx: predecessores arquivados e documentos correntes sem citação falsa', () => {
  const arvore = arvoreReal();
  assert.ok(
    Object.keys(arvore.docs).length > 5,
    'a árvore de docs/talkx/ está vazia — o verificador não está lendo o repositório',
  );
  assert.deepEqual(
    violacoes(arvore),
    [],
    'a documentação do módulo Talk X ainda mistura história/plano ou cita código inexistente',
  );
});

test('docs/talkx: o arquivo existe no disco e o .gitignore cobre o caminho gerado citado', () => {
  const gerados = diretoriosGerados(RAIZ);
  assert.ok(
    gerados.length > 0,
    'nenhum padrão de pasta do .gitignore foi lido — o caminho gerado citado seria acusado por engano',
  );
  for (const nome of PREDECESSORES) {
    assert.ok(
      statSync(join(DOCS, ARQUIVO, nome)).isFile(),
      `docs/talkx/${ARQUIVO}/${nome} não existe no disco`,
    );
  }
});
