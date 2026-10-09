#!/usr/bin/env node
// SL-223: o `docs/COMPLETE_SYSTEM_FEATURES.md` ficou congelado nas 34 seções de
// 2026-03-15. O `docs/FORGOTTEN_FEATURES_REPORT.md` (2026-03-17) apontou 14 módulos
// que existem na navegação e 5 Edge Functions que existem em `supabase/functions/`
// mas que não constavam do documento — quem lia a doc concluía que o produto tinha
// metade das telas que tem de verdade.
//
// Este guarda trava as duas pontas ao mesmo tempo:
//   (a) o TEXTO do documento tem de listar as 14 seções (35..48) e as 5 funções;
//   (b) as ÂNCORAS que o documento cita (arquivos .tsx/.ts) têm de continuar existindo
//       no repositório — uma renomeação passa a dar teste vermelho na hora.
//
// Os dois lados ficam provados por fixtures em string (documento sem as seções falha;
// documento completo passa), além das asserções sobre o arquivo real.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = 'docs/COMPLETE_SYSTEM_FEATURES.md';
const doc = fs.readFileSync(path.join(raiz, DOC), 'utf8');

// Seções 35..48 que o relatório de funcionalidades esquecidas manda documentar.
const SECOES_ESPERADAS = [
  { n: 35, titulo: 'Campanhas de Mensagens em Massa' },
  { n: 36, titulo: 'Chatbot / Fluxos Automatizados' },
  { n: 37, titulo: 'Pipeline de Vendas (CRM)' },
  { n: 38, titulo: 'Base de Conhecimento' },
  { n: 39, titulo: 'Hub de Integrações' },
  { n: 40, titulo: 'Links de Pagamento' },
  { n: 41, titulo: 'Conformidade LGPD' },
  { n: 42, titulo: 'WhatsApp Flows Builder' },
  { n: 43, titulo: 'Diagnósticos do Sistema' },
  { n: 44, titulo: 'Meta Conversions API (CAPI)' },
  { n: 45, titulo: 'Gestão de Agentes' },
  { n: 46, titulo: 'Sequências de Follow-up' },
  { n: 47, titulo: 'API Pública' },
  { n: 48, titulo: 'Componentes Cognitivos (UX)' },
];

// Edge Functions que existem no código e faltavam no documento.
const FUNCOES_ESPERADAS = [
  'ai-auto-tag',
  'ai-enhance-message',
  'chatbot-l1',
  'public-api',
  'send-email',
];

const TITULO_SECAO_RE = /^## (\d+)\.\s+(.+?)\s*$/;

/** Seções esperadas ausentes/renomeadas no markdown. */
export function secoesFaltantes(markdown, esperadas = SECOES_ESPERADAS) {
  const porNumero = new Map();
  for (const linha of String(markdown).split('\n')) {
    const m = TITULO_SECAO_RE.exec(linha);
    if (m) porNumero.set(Number(m[1]), m[2]);
  }
  return esperadas
    .filter(({ n, titulo }) => porNumero.get(n) !== titulo)
    .map(({ n, titulo }) => ({ n, titulo, encontrado: porNumero.get(n) ?? null }));
}

/** Edge Functions esperadas que o markdown não cita. */
export function funcoesFaltantes(markdown, nomes = FUNCOES_ESPERADAS) {
  const texto = String(markdown);
  return nomes.filter((nome) => !texto.includes(nome));
}

/** Índice de nomes de arquivo do repositório (basenames), para tokens citados sem caminho. */
function indexarBasenames() {
  const nomes = new Set();
  const raizes = ['src', 'docs', 'supabase', 'scripts'].map((r) => path.join(raiz, r));
  const pilha = raizes.filter((p) => fs.existsSync(p));
  while (pilha.length > 0) {
    const atual = pilha.pop();
    for (const entrada of fs.readdirSync(atual, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        if (!['node_modules', '.git', 'dist'].includes(entrada.name)) pilha.push(path.join(atual, entrada.name));
      } else {
        nomes.add(entrada.name);
      }
    }
  }
  return nomes;
}

const basenames = indexarBasenames();

/** Arquivos `*.ts(x)`/`*.sql` citados no trecho e que não existem no repositório. */
export function arquivosCitadosInexistentes(trecho, indice = basenames, raizRepo = raiz) {
  const tokens = [...String(trecho).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const arquivos = tokens.filter((t) => /^[\w./-]+\.(md|ts|tsx|sql|json)$/.test(t));
  return arquivos.filter((token) => {
    if (token.includes('/')) return !fs.existsSync(path.join(raizRepo, token));
    return !indice.has(token);
  });
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado do documento.
// ---------------------------------------------------------------------------

const DOC_COMPLETO_FIXTURE = [
  '## 34. Edge Functions',
  ...FUNCOES_ESPERADAS.map((f) => `| 34.x | \`${f}\` | descrição |`),
  ...SECOES_ESPERADAS.map(({ n, titulo }) => `## ${n}. ${titulo}\n\nconteúdo`),
].join('\n');

const DOC_SEM_35_FIXTURE = DOC_COMPLETO_FIXTURE.replace('## 35. Campanhas de Mensagens em Massa\n\nconteúdo\n', '');
const DOC_SEM_FUNCAO_FIXTURE = DOC_COMPLETO_FIXTURE.replace('`send-email`', '`outra-coisa`');

test('SL-223 (fixture): documento completo não acusa seção faltante', () => {
  assert.deepEqual(secoesFaltantes(DOC_COMPLETO_FIXTURE), []);
  assert.deepEqual(funcoesFaltantes(DOC_COMPLETO_FIXTURE), []);
});

test('SL-223 (fixture): documento sem a seção 35 é reprovado', () => {
  const faltantes = secoesFaltantes(DOC_SEM_35_FIXTURE);
  assert.deepEqual(faltantes.map((f) => f.n), [35]);
  assert.equal(faltantes[0].encontrado, null);
});

test('SL-223 (fixture): documento sem uma Edge Function é reprovado', () => {
  assert.deepEqual(funcoesFaltantes(DOC_SEM_FUNCAO_FIXTURE), ['send-email']);
});

test('SL-223 (fixture): citação de arquivo que não existe é reprovada', () => {
  assert.deepEqual(arquivosCitadosInexistentes('veja `src/nao-existe/Arquivo.tsx`'), [
    'src/nao-existe/Arquivo.tsx',
  ]);
});

// ---------------------------------------------------------------------------
// Asserções sobre o documento real.
// ---------------------------------------------------------------------------

test('COMPLETE_SYSTEM_FEATURES.md documenta as 14 seções (35..48) do relatório', () => {
  const faltantes = secoesFaltantes(doc);
  assert.deepEqual(
    faltantes,
    [],
    `seções ausentes/renomeadas: ${faltantes.map((f) => `#${f.n} (${f.encontrado ?? 'ausente'})`).join(', ')}`,
  );
});

test('COMPLETE_SYSTEM_FEATURES.md cita as 5 Edge Functions que faltavam', () => {
  const faltantes = funcoesFaltantes(doc);
  assert.deepEqual(faltantes, [], `Edge Functions não citadas na doc: ${faltantes.join(', ')}`);
  for (const nome of FUNCOES_ESPERADAS) {
    assert.ok(
      fs.existsSync(path.join(raiz, 'supabase', 'functions', nome)),
      `a doc cita \`${nome}\`, mas a pasta supabase/functions/${nome} não existe`,
    );
  }
});

test('COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe', () => {
  // Recorte só do bloco novo (seções 35..48 + as 5 funções), que é o que este cartão
  // passou a afirmar. O resto do documento é histórico de 2026-03-15.
  const inicio = doc.indexOf('## 35. Campanhas de Mensagens em Massa');
  assert.ok(inicio > 0, 'o documento perdeu a seção 35 (o teste perdeu o alvo)');
  const trecho = doc.slice(inicio);
  const inexistentes = arquivosCitadosInexistentes(trecho);
  assert.deepEqual(inexistentes, [], `o documento cita arquivos que não existem: ${inexistentes.join(', ')}`);
});
