#!/usr/bin/env node
// SL-184 / etapa 11 da AUDITORIA_MIGRACAO_DB_2026-08-28.md — `docs/DB-INVENTORY.md`.
//
// A auditoria de 28/08 registrou que o `docs/DB-INVENTORY.md` pedido no plano de 27/08
// "ainda não foi criado (vira etapa 11)" e descreveu o que ele tem de conter:
// "tabela → propósito → status (ativo/parcial/roadmap) → consumidores conhecidos".
//
// Um inventário só serve se não puder mentir em nenhuma das duas direções:
//   (a) objeto do banco que não aparece no documento → o inventário deixa de ser o
//       inventário do banco e vira uma lista parcial que ninguém sabe que é parcial;
//   (b) linha que aponta consumidor inexistente, ou consumidor que não cita o objeto →
//       quem for conferir perde a confiança no documento inteiro;
//   (c) status que não corresponde ao que o repositório diz hoje → a coluna vira enfeite.
//
// Este teste lê o catálogo REAL (`supabase/schema-catalog.json`, snapshot de `public`) e os
// arquivos REAIS do repositório, e acusa os três lados. A varredura é textual de propósito:
// o objeto pode ser alcançado por `.from()`, por SQL ou por RPC (`clear_login_attempts` de
// `login_attempts`, por exemplo), então "o código cita o objeto" — e não "o código chama
// `.from(<objeto>)`" — é o que a coluna mede. O `src/integrations/supabase/types.ts` é
// gerado e cita todas as tabelas: contá-lo como consumidor não diz nada, então ele fica fora.
// Pelo mesmo motivo, arquivo que cita `LIMITE_ESPELHO` ou mais objetos (baseline de grants/RLS,
// varredura de teste) é espelho do schema e não dá consumidor a ninguém.
//
// As fixtures rodam a MESMA regra do documento real e provam o lado negativo (documento
// vazio, seção ausente, tabela faltando, tabela inventada, status errado, consumidor
// inexistente, consumidor que não cita o objeto, propósito em branco, contagem errada).
//
// Objeto novo no banco → atualize este documento na MESMA PR (etapa 12 da auditoria).

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DOC = 'docs/DB-INVENTORY.md';
export const CATALOGO = 'supabase/schema-catalog.json';

// Código de produto = o que o app e as Edge Functions usam de verdade.
export const DIRS_PRODUTO = ['src', 'supabase/functions'];
// Ferramental do repositório: cita o objeto sem ser consumidor de produto.
export const DIRS_FERRAMENTA = ['scripts', 'tests', 'e2e', '.github'];
export const DIRS = [...DIRS_PRODUTO, ...DIRS_FERRAMENTA];

const EXTENSOES = /\.(ts|tsx|js|mjs|cjs|jsx|sql|yml|yaml|sh|json|md)$/u;

// Gerados/derivados e diretórios de máquina: não são consumidores.
// `src/integrations/supabase/types.ts` cita TODAS as tabelas (é a tipagem do schema).
// A própria guarda fica fora: ela é o instrumento de medida, não consumidor.
const IGNORAR = [
  'node_modules',
  '.git',
  '.tmp',
  'dist',
  'coverage',
  'src/integrations/supabase/types.ts',
  'scripts/ci/db-inventory-doc.unit.mjs',
];

// Arquivo que cita isto ou mais objetos é espelho do schema (baseline de grants/RLS, varredura
// de testes, snapshot de publicação): ele cita tudo e por isso não diz nada sobre quem usa o quê.
// Fora da conta de consumidores — senão toda tabela teria "consumidor" e o status viraria enfeite.
export const LIMITE_ESPELHO = 30;

// Chaves do catálogo que o documento declara em `## Objetos por tipo`.
export const CONTAGENS_OBRIGATORIAS = [
  'tables',
  'views',
  'columns',
  'functions',
  'function_signatures',
  'trigger_functions',
  'check_constraints',
];

export const STATUS_VALIDOS = ['ativo', 'parcial', 'roadmap'];
export const LIMITE_CONSUMIDORES = 3;
export const SEM_CONSUMIDOR = '—';

/** Regex de citação: nome exato do objeto, sem casar `calls` dentro de `supercalls`. */
export function reCitacao(tabela) {
  return new RegExp(`(?<![A-Za-z0-9_])${tabela}(?![A-Za-z0-9_])`, 'u');
}

export function citam(tabela, conteudo) {
  return reCitacao(tabela).test(String(conteudo ?? ''));
}

/** Corpus real: catálogo + arquivos do repositório que podem citar objetos. */
export function corpusReal() {
  const catalogo = JSON.parse(readFileSync(path.join(RAIZ, CATALOGO), 'utf8'));
  const arquivos = new Map();
  const anda = (dir) => {
    let itens;
    try {
      itens = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of itens) {
      const abs = path.join(dir, item);
      const rel = path.relative(RAIZ, abs).split(path.sep).join('/');
      if (IGNORAR.some((i) => rel === i || rel.startsWith(`${i}/`))) continue;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) anda(abs);
      else if (EXTENSOES.test(rel)) {
        try {
          arquivos.set(rel, readFileSync(abs, 'utf8'));
        } catch {
          /* binário ou ilegível: fora da varredura */
        }
      }
    }
  };
  for (const d of DIRS) anda(path.join(RAIZ, d));
  return { tabelas: [...catalogo.tables].sort(), catalogo, arquivos };
}

/**
 * Mapa de citações do corpus, calculado UMA vez por corpus: por tabela, os arquivos que a citam
 * (fora os espelhos do schema) e o conjunto de espelhos.
 */
function referencias(corpus) {
  if (corpus.__refs) return corpus.__refs;
  const nomes = [...corpus.tabelas].sort((a, b) => b.length - a.length);
  const re = nomes.length
    ? new RegExp(`(?<![A-Za-z0-9_])(?:${nomes.join('|')})(?![A-Za-z0-9_])`, 'gu')
    : null;
  const porTabela = new Map(corpus.tabelas.map((t) => [t, []]));
  const espelhos = new Set();
  if (re) {
    for (const [arquivo, conteudo] of corpus.arquivos) {
      const achados = new Set();
      for (const m of String(conteudo).matchAll(re)) achados.add(m[0]);
      if (!achados.size) continue;
      if (achados.size >= LIMITE_ESPELHO) {
        espelhos.add(arquivo);
        continue;
      }
      for (const t of achados) porTabela.get(t).push(arquivo);
    }
  }
  const refs = { porTabela, espelhos };
  corpus.__refs = refs;
  return refs;
}

/** Citações do objeto, código de produto primeiro e depois o ferramental (ordem alfabética). */
export function citantesDe(tabela, corpus) {
  const citantes = [...(referencias(corpus).porTabela.get(tabela) ?? [])];
  const produto = citantes.filter(emCodigoDeProduto).sort();
  const resto = citantes.filter((a) => !emCodigoDeProduto(a)).sort();
  return [...produto, ...resto];
}

function emCodigoDeProduto(arquivo) {
  return DIRS_PRODUTO.some((d) => arquivo.startsWith(`${d}/`));
}

/** ativo = citada em código de produto; parcial = só ferramental; roadmap = ninguém cita. */
export function statusCalculado(tabela, corpus) {
  const citantes = citantesDe(tabela, corpus);
  return citantes.some(emCodigoDeProduto) ? 'ativo' : citantes.length ? 'parcial' : 'roadmap';
}

/** Consumidores que o documento deve listar: os primeiros `limite`, e se houve corte. */
export function consumidoresEsperados(tabela, corpus) {
  const citantes = citantesDe(tabela, corpus);
  return {
    lista: citantes.slice(0, LIMITE_CONSUMIDORES),
    total: citantes.length,
    truncado: citantes.length > LIMITE_CONSUMIDORES,
  };
}

/**
 * Linhas da seção `## Tabelas` (até o próximo `##`), ou `null` se a seção não existe.
 * Devolve os objetos crus da tabela: `{ tabela, proposito, status, consumidores }`.
 */
export function linhasDoInventario(doc) {
  const linhas = String(doc ?? '').split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Tabelas\b/u.test(l));
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^##\s/u.test(l));
  const secao = resto.slice(0, fim === -1 ? resto.length : fim);
  const out = [];
  for (const linha of secao) {
    const t = linha.trim();
    if (!t.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/u.test(t)) continue; // separador do cabeçalho
    const celulas = t
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (celulas[0] === 'Tabela') continue; // cabeçalho
    if (celulas.length !== 4) continue;
    out.push({
      tabela: celulas[0].replace(/`/gu, '').trim(),
      proposito: celulas[1],
      status: celulas[2],
      consumidores: celulas[3],
    });
  }
  return out;
}

/**
 * Números declarados na seção `## Objetos por tipo`, por chave do catálogo. A seção é lida
 * isolada de propósito: a tabela de tabelas não pode entrar na conta.
 */
export function contagensDoDocumento(doc) {
  const linhas = String(doc ?? '').split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Objetos por tipo\b/u.test(l));
  if (inicio === -1) return new Map();
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^##\s/u.test(l));
  const secao = resto.slice(0, fim === -1 ? resto.length : fim).join('\n');
  const out = new Map();
  for (const m of secao.matchAll(/\|\s*[^|\n]*`([a-z_]+)`[^|\n]*\|\s*(\d+)\s*\|/gu)) {
    out.set(m[1], Number(m[2]));
  }
  return out;
}

function caminhosCitados(celula) {
  return [...String(celula).matchAll(/`([^`]+)`/gu)].map((m) => m[1].trim());
}

/**
 * Violações do inventário contra o corpus. Lista vazia = o documento cobre o catálogo, sem
 * linha inventada, com status e consumidores que o repositório sustenta. Exportada para as
 * fixtures rodarem a MESMA regra do documento real.
 */
export function violacoesDoInventario(doc, corpus) {
  const violacoes = [];
  const texto = String(doc ?? '');
  if (texto.trim() === '') return ['o inventário está vazio ou ausente'];

  const linhas = linhasDoInventario(texto);
  if (!linhas) return ['falta a seção "## Tabelas"'];

  const vistos = new Set();
  for (const linha of linhas) {
    const tabela = linha.tabela;
    if (!corpus.tabelas.includes(tabela)) {
      violacoes.push(`"${tabela}" está no documento, mas não existe no catálogo do banco`);
      continue;
    }
    if (vistos.has(tabela)) violacoes.push(`"${tabela}" aparece mais de uma vez no documento`);
    vistos.add(tabela);

    const proposito = linha.proposito.replace(/\s+/gu, ' ').trim();
    if (proposito.length < 8 || proposito === tabela) {
      violacoes.push(`"${tabela}" está sem propósito (a coluna é o que o objeto guarda)`);
    }

    const status = linha.status;
    if (!STATUS_VALIDOS.includes(status)) {
      violacoes.push(`"${tabela}" tem status "${status}", fora de ${STATUS_VALIDOS.join(' / ')}`);
      continue;
    }
    const esperado = statusCalculado(tabela, corpus);
    if (status !== esperado) {
      violacoes.push(`"${tabela}" está como "${status}", mas o repositório diz "${esperado}"`);
    }

    const caminhos = caminhosCitados(linha.consumidores);
    const { lista, total } = consumidoresEsperados(tabela, corpus);
    const citantes = citantesDe(tabela, corpus);
    if (total === 0) {
      if (linha.consumidores.trim() !== SEM_CONSUMIDOR) {
        violacoes.push(`"${tabela}" não é citada por nenhum arquivo, então a coluna é "${SEM_CONSUMIDOR}"`);
      }
      continue;
    }
    if (caminhos.length === 0) {
      violacoes.push(`"${tabela}" não lista nenhum consumidor (o repositório cita em ${total} arquivo(s))`);
      continue;
    }
    // Até `LIMITE_CONSUMIDORES` exemplos: o documento não é obrigado a listar todos (o
    // repositório ganha consumidor novo sem que isto vire falha de CI), mas o corte tem de ser
    // verdadeiro — "…" promete que existe mais.
    if (linha.consumidores.includes('…') && total <= caminhos.length) {
      violacoes.push(
        `"${tabela}" marca corte com "…", mas o repositório cita exatamente ${total} arquivo(s)`,
      );
    }
    if (caminhos.length > lista.length) {
      violacoes.push(
        `"${tabela}" lista ${caminhos.length} consumidor(es); a coluna leva no máximo ${LIMITE_CONSUMIDORES}`,
      );
    }
    for (const caminho of caminhos) {
      if (!corpus.arquivos.has(caminho)) {
        violacoes.push(`"${tabela}" lista "${caminho}", que não existe no repositório`);
        continue;
      }
      if (!citantes.includes(caminho)) {
        violacoes.push(`"${tabela}" lista "${caminho}", mas esse arquivo não cita o objeto`);
      }
    }
    if (esperado === 'ativo' && !caminhos.some((c) => DIRS_PRODUTO.some((d) => c.startsWith(`${d}/`)))) {
      violacoes.push(
        `"${tabela}" é "ativo", mas nenhum consumidor listado é código de produto (src/ ou supabase/functions/)`,
      );
    }
  }

  for (const tabela of corpus.tabelas) {
    if (!vistos.has(tabela)) violacoes.push(`"${tabela}" está no banco e não aparece no inventário`);
  }

  const contagens = contagensDoDocumento(texto);
  for (const chave of CONTAGENS_OBRIGATORIAS) {
    if (!contagens.has(chave)) {
      violacoes.push(`falta a contagem de "${chave}" em "## Objetos por tipo"`);
      continue;
    }
    const real = corpus.catalogo[chave].length;
    if (contagens.get(chave) !== real) {
      violacoes.push(`a contagem de "${chave}" é ${contagens.get(chave)}; o catálogo tem ${real}`);
    }
  }
  for (const [chave, valor] of contagens) {
    if (!Array.isArray(corpus.catalogo[chave])) {
      violacoes.push(`a contagem de "${chave}" não corresponde a nenhuma lista do catálogo`);
      continue;
    }
    if (valor !== corpus.catalogo[chave].length) {
      violacoes.push(`a contagem de "${chave}" é ${valor}; o catálogo tem ${corpus.catalogo[chave].length}`);
    }
  }

  return violacoes;
}

/** Corpus de mentira, do tamanho mínimo que a regra precisa para julgar. */
function corpusFalso({ tabelas = ['contacts', 'zumbi'], arquivos = {}, catalogo = null } = {}) {
  const base = {
    tables: tabelas,
    views: ['v_email'],
    columns: ['contacts.id:uuid'],
    functions: ['f_a'],
    function_signatures: ['f_a()'],
    trigger_functions: [],
    check_constraints: [],
  };
  return {
    tabelas: [...tabelas].sort(),
    catalogo: catalogo ?? base,
    arquivos: new Map(Object.entries(arquivos)),
  };
}

const CONTAGENS_OK = [
  '| Objeto | Quantidade |',
  '|---|---|',
  '| Tabelas (`tables`) | 2 |',
  '| Views (`views`) | 1 |',
  '| Colunas (`columns`) | 1 |',
  '| Funções (`functions`) | 1 |',
  '| Assinaturas de função (`function_signatures`) | 1 |',
  '| Funções de gatilho (`trigger_functions`) | 0 |',
  '| Restrições de verificação (`check_constraints`) | 0 |',
];

const DOC_OK = [
  '# Inventário de objetos do banco',
  '',
  '## Objetos por tipo',
  '',
  ...CONTAGENS_OK,
  '',
  '## Tabelas',
  '',
  '| Tabela | Propósito | Status | Consumidores conhecidos |',
  '|---|---|---|---|',
  '| `contacts` | Cadastro central de contatos | ativo | `src/a.ts` |',
  '| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |',
  '',
].join('\n');

const CORPUS_OK = corpusFalso({
  arquivos: { 'src/a.ts': 'supabase.from("contacts").select()' },
});

test('o catálogo de produção carrega e não tem tabela duplicada', () => {
  const corpus = corpusReal();
  assert.ok(corpus.tabelas.length > 100, `esperava mais de 100 tabelas, veio ${corpus.tabelas.length}`);
  assert.equal(new Set(corpus.tabelas).size, corpus.tabelas.length, 'catálogo com tabela duplicada');
  assert.ok(!corpus.arquivos.has('src/integrations/supabase/types.ts'), 'types.ts gerado entrou na varredura');
});

test('a regra aceita um inventário coerente (lado positivo)', () => {
  assert.deepEqual(violacoesDoInventario(DOC_OK, CORPUS_OK), []);
});

test('docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir', () => {
  const doc = existsSync(path.join(RAIZ, DOC)) ? readFileSync(path.join(RAIZ, DOC), 'utf8') : '';
  assert.deepEqual(violacoesDoInventario(doc, corpusReal()), []);
});

test('documento vazio e documento sem a seção de tabelas são recusados', () => {
  assert.deepEqual(violacoesDoInventario('', CORPUS_OK), ['o inventário está vazio ou ausente']);
  assert.deepEqual(violacoesDoInventario('# só título\n', CORPUS_OK), ['falta a seção "## Tabelas"']);
});

test('tabela do catálogo que falta no documento é acusada', () => {
  const semZumbi = DOC_OK.replace('| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |\n', '');
  assert.deepEqual(violacoesDoInventario(semZumbi, CORPUS_OK), [
    '"zumbi" está no banco e não aparece no inventário',
  ]);
});

test('tabela inventada (ou duplicada) é acusada', () => {
  const comFantasma = DOC_OK.replace(
    '| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |',
    '| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |\n| `nao_existe` | Objeto que o catálogo não tem | ativo | `src/a.ts` |\n| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |',
  );
  const violacoes = violacoesDoInventario(comFantasma, CORPUS_OK);
  assert.ok(
    violacoes.includes('"nao_existe" está no documento, mas não existe no catálogo do banco'),
    violacoes.join(' | '),
  );
  assert.ok(violacoes.includes('"zumbi" aparece mais de uma vez no documento'), violacoes.join(' | '));
});

test('status que o repositório não sustenta é acusado nos dois sentidos', () => {
  const mentiuAtivo = DOC_OK.replace('| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |', '| `zumbi` | Objeto sem nenhuma citação no repositório | ativo | `src/a.ts` |');
  assert.ok(
    violacoesDoInventario(mentiuAtivo, CORPUS_OK).includes(
      '"zumbi" está como "ativo", mas o repositório diz "roadmap"',
    ),
  );

  const mentiuRoadmap = DOC_OK.replace('`contacts` | Cadastro central de contatos | ativo', '`contacts` | Cadastro central de contatos | roadmap');
  assert.ok(
    violacoesDoInventario(mentiuRoadmap, CORPUS_OK).includes(
      '"contacts" está como "roadmap", mas o repositório diz "ativo"',
    ),
  );

  const semStatus = DOC_OK.replace('| Cadastro central de contatos | ativo |', '| Cadastro central de contatos | em uso |');
  assert.ok(
    violacoesDoInventario(semStatus, CORPUS_OK).some((v) => v.includes('fora de ativo / parcial / roadmap')),
  );
});

test('objeto citado só por ferramental é "parcial", não "ativo"', () => {
  const corpus = corpusFalso({
    arquivos: {
      'src/a.ts': 'supabase.from("contacts").select()',
      'scripts/ci/limpa.sh': 'psql -c "delete from zumbi where id is null"',
    },
  });
  assert.equal(statusCalculado('zumbi', corpus), 'parcial');
  assert.equal(statusCalculado('contacts', corpus), 'ativo');
  const doc = DOC_OK.replace(
    '| `zumbi` | Objeto sem nenhuma citação no repositório | roadmap | — |',
    '| `zumbi` | Objeto sem nenhuma citação no repositório | parcial | `scripts/ci/limpa.sh` |',
  );
  assert.deepEqual(violacoesDoInventario(doc, corpus), []);
});

test('consumidor inexistente ou que não cita o objeto é acusado', () => {
  const naoExiste = DOC_OK.replace('| `src/a.ts` |', '| `src/nao-existe.ts` |');
  assert.ok(
    violacoesDoInventario(naoExiste, CORPUS_OK).includes(
      '"contacts" lista "src/nao-existe.ts", que não existe no repositório',
    ),
  );

  const naoCita = DOC_OK.replace('| `src/a.ts` |', '| `src/b.ts` |');
  const corpus = corpusFalso({
    arquivos: { 'src/a.ts': 'supabase.from("contacts").select()', 'src/b.ts': 'nada aqui' },
  });
  const violacoes = violacoesDoInventario(naoCita, corpus);
  assert.ok(
    violacoes.includes('"contacts" lista "src/b.ts", mas esse arquivo não cita o objeto'),
    violacoes.join(' | '),
  );

  // Documento que lista menos consumidores do que o repositório tem: continua válido (a coluna
  // é uma amostra de até LIMITE_CONSUMIDORES), desde que listados sejam consumidores reais.
  const curto = DOC_OK.replace('| `src/a.ts` |', '| `src/a.ts`, `src/b.ts` |');
  const dois = corpusFalso({
    arquivos: { 'src/a.ts': 'contacts', 'src/b.ts': 'contacts' },
  });
  const so = curto.replace('| `src/a.ts`, `src/b.ts` |', '| `src/a.ts` |');
  assert.deepEqual(violacoesDoInventario(so, dois), []);
  assert.deepEqual(violacoesDoInventario(curto, dois), []);
});

test('arquivo espelho do schema não conta como consumidor de ninguém', () => {
  const tabelas = [
    'contacts',
    ...Array.from({ length: LIMITE_ESPELHO }, (_, i) => `t${String(i).padStart(2, '0')}`),
  ];
  const espelho = `-- espelho do schema\n${tabelas.join(' ')}\n`;
  const corpus = corpusFalso({
    tabelas,
    arquivos: {
      'scripts/db-audit/grants-baseline.json': espelho,
      'src/a.ts': 'supabase.from("contacts")',
    },
  });
  assert.equal(statusCalculado('t00', corpus), 'roadmap', 'espelho não deve dar consumidor à tabela');
  assert.deepEqual(consumidoresEsperados('t00', corpus).lista, [], 'espelho não entra na coluna de consumidores');
  assert.equal(statusCalculado('contacts', corpus), 'ativo');

  // Um arquivo abaixo do limite continua valendo como citação de ferramental.
  const quase = corpusFalso({
    tabelas,
    arquivos: { 'scripts/ci/limpa.sh': `psql -c "delete from t00"`, 'src/a.ts': 'contacts' },
  });
  assert.equal(statusCalculado('t00', quase), 'parcial');
});

test('objeto "ativo" que só lista ferramental é acusado', () => {
  const soFerramenta = DOC_OK.replace('| `src/a.ts` |', '| `scripts/ci/limpa.sh` |');
  const corpus = corpusFalso({
    arquivos: { 'src/a.ts': 'contacts', 'scripts/ci/limpa.sh': 'contacts' },
  });
  assert.ok(
    violacoesDoInventario(soFerramenta, corpus).includes(
      '"contacts" é "ativo", mas nenhum consumidor listado é código de produto (src/ ou supabase/functions/)',
    ),
    violacoesDoInventario(soFerramenta, corpus).join(' | '),
  );
});

test('objeto citado sem listar consumidor, e corte "…" mentiroso, são acusados', () => {
  const semConsumidor = DOC_OK.replace('| Cadastro central de contatos | ativo | `src/a.ts` |', '| Cadastro central de contatos | ativo | — |');
  assert.ok(
    violacoesDoInventario(semConsumidor, CORPUS_OK).some((v) => v.includes('não lista nenhum consumidor')),
  );

  const tres = corpusFalso({ arquivos: { 'src/a.ts': 'contacts', 'src/b.ts': 'contacts', 'src/c.ts': 'contacts' } });
  const doc3 = DOC_OK.replace(
    '| `src/a.ts` |',
    '| `src/a.ts`, `src/b.ts`, `src/c.ts` |',
  );
  assert.deepEqual(violacoesDoInventario(doc3, tres), [], 'listar todos, sem "…", está certo');

  // "…" promete que existe mais: com exatamente 3 citantes, o corte é falso.
  const comCorteFalso = doc3.replace('`src/c.ts` |', '`src/c.ts` … |');
  assert.ok(
    violacoesDoInventario(comCorteFalso, tres).includes(
      '"contacts" marca corte com "…", mas o repositório cita exatamente 3 arquivo(s)',
    ),
    violacoesDoInventario(comCorteFalso, tres).join(' | '),
  );

  // Com um quarto citante, o mesmo texto com "…" passa ser verdadeiro.
  const quatro = corpusFalso({
    arquivos: { 'src/a.ts': 'contacts', 'src/b.ts': 'contacts', 'src/c.ts': 'contacts', 'src/d.ts': 'contacts' },
  });
  assert.deepEqual(violacoesDoInventario(comCorteFalso, quatro), []);

  // Mais de LIMITE_CONSUMIDORES caminhos listados não cabem na coluna.
  const demais = doc3.replace('`src/c.ts` |', '`src/c.ts`, `src/d.ts` |');
  assert.ok(
    violacoesDoInventario(demais, quatro).includes('"contacts" lista 4 consumidor(es); a coluna leva no máximo 3'),
    violacoesDoInventario(demais, quatro).join(' | '),
  );
});

test('propósito em branco é acusado', () => {
  const semProposito = DOC_OK.replace('| Cadastro central de contatos |', '|  |');
  assert.ok(
    violacoesDoInventario(semProposito, CORPUS_OK).some((v) => v.includes('está sem propósito')),
  );
});

test('contagem de objetos que não bate com o catálogo é acusada', () => {
  const errada = DOC_OK.replace('| Tabelas (`tables`) | 2 |', '| Tabelas (`tables`) | 3 |');
  assert.ok(
    violacoesDoInventario(errada, CORPUS_OK).includes('a contagem de "tables" é 3; o catálogo tem 2'),
  );
  const semContagem = DOC_OK.replace('| Funções (`functions`) | 1 |\n', '');
  assert.ok(
    violacoesDoInventario(semContagem, CORPUS_OK).includes('falta a contagem de "functions" em "## Objetos por tipo"'),
  );

  // Contagem escrita FORA da seção não vale: a seção é o que o documento declara.
  const foraDaSecao = `${semContagem}\n## Outra seção\n\n| Objeto | Quantidade |\n|---|---|\n| Funções (\`functions\`) | 1 |\n`;
  assert.ok(
    violacoesDoInventario(foraDaSecao, CORPUS_OK).includes('falta a contagem de "functions" em "## Objetos por tipo"'),
    violacoesDoInventario(foraDaSecao, CORPUS_OK).join(' | '),
  );
});

test('nome de objeto dentro de outro nome não conta como citação', () => {
  const corpus = corpusFalso({
    arquivos: { 'src/a.ts': 'tabela supercontacts e calls_x' },
  });
  assert.equal(statusCalculado('contacts', corpus), 'roadmap');
  assert.equal(statusCalculado('zumbi', corpus), 'roadmap');
  assert.equal(citam('contacts', 'supercontacts'), false);
  assert.equal(citam('contacts', 'from("contacts")'), true);
});
