import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ESTADOS,
  ESTADOS_FORCADOS,
  FORCED_STATE_SRC,
  SAIDA,
  coberturaEstadoForcado,
  lerEstadoForcadoDoCodigo,
  matriz,
  renderMarkdown,
  telasDoModulo,
  varrerTela,
} from './gen-estados.mjs';

/**
 * X055 — a matriz tela × estado tem de sair do CÓDIGO (com arquivo:linha), não
 * de um texto à mão. Estes testes montam um diretório de telas de fixture e
 * provam a leitura de linhas, o filtro de arquivos e a estabilidade da saída —
 * e, por fim, que o `docs/talkx/ESTADOS.md` commitado bate com o repositório.
 */

function dirComTelas(arquivos) {
  const dir = mkdtempSync(join(tmpdir(), 'estados-telas-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(dir, nome), conteudo);
  return dir;
}

test('varrerTela devolve a linha (1-based) de cada estado adotado', () => {
  const texto = [
    "import { TalkXEmptyState } from './kit/states';", // 1 — import, não é adoção
    '', // 2
    'export function TalkXFixture() {', // 3
    '  return <TalkXEmptyState />;', // 4
    '}', // 5
    'function Outra() {', // 6
    '  return <TalkXSkeletonRows rows={4} />;', // 7
    '}', // 8
  ].join('\n');

  const achados = varrerTela(texto);

  assert.deepEqual(achados.empty, [4]);
  assert.deepEqual(achados.loading, [7]);
  // estados que a fixture não adota ficam vazios (não viram "0")
  assert.deepEqual(achados.error, []);
  assert.deepEqual(achados.perm, []);
});

test('varrerTela aceita o vazio por filtro e o skeleton de KPI', () => {
  const texto = '<TalkXFilteredEmptyState onClearFilters={x} />\n<KpiCardSkeleton />';
  const achados = varrerTela(texto);

  assert.deepEqual(achados.empty, [1]);
  assert.deepEqual(achados.loading, [2]);
});

test('telasDoModulo pega só TalkX*.tsx e ordena', () => {
  const dir = dirComTelas({
    'TalkXZebra.tsx': 'export const a = 1;',
    'TalkXAlfa.tsx': 'export const b = 2;',
    'talkxShared.ts': 'export const c = 3;',
    'TalkXAlfa.test.tsx': 'x',
    'useCampaignEditor.ts': 'y',
  });

  assert.deepEqual(telasDoModulo(dir), ['TalkXAlfa.tsx', 'TalkXZebra.tsx']);
});

test('renderMarkdown escreve arquivo:linha e marca com — o estado ausente', () => {
  const dir = dirComTelas({
    'TalkXAlfa.tsx': 'const x = <TalkXEmptyState />;\nconst y = <TalkXCrmUnavailableState />;',
    'TalkXZebra.tsx': 'const z = <TalkXQueryBoundary {...props} />;',
  });

  const linhas = matriz(dir);
  const markdown = renderMarkdown(linhas, ESTADOS, dir);

  assert.match(markdown, /TalkXAlfa\.tsx\` \| \`1\`/);
  assert.match(markdown, /TalkXAlfa\.tsx\` \| \`1\`[^|]*\|[^|]*\|[^|]*\| \`2\`/);
  assert.match(markdown, /\| — \|/);
  assert.match(markdown, /\*\*Vazio\*\*: 1 de 2 telas/);
  assert.match(markdown, /node scripts\/talkx\/gen-estados\.mjs --check/);
});

test('renderMarkdown é estável (mesma entrada → mesma saída)', () => {
  const dir = dirComTelas({ 'TalkXAlfa.tsx': 'const x = <TalkXEmptyState />;' });

  assert.equal(renderMarkdown(matriz(dir), ESTADOS, dir), renderMarkdown(matriz(dir), ESTADOS, dir));
});

test('os valores de ?talkxState= são exatamente os seis estados do sistema', () => {
  assert.deepEqual(ESTADOS_FORCADOS, ESTADOS.map((e) => e.id));
  assert.deepEqual([...ESTADOS_FORCADOS].sort(), ['crm', 'empty', 'error', 'loading', 'perm', 'wa']);
});

test('o estado forçado do doc é lido do código (forcedState.ts real)', () => {
  const forcado = lerEstadoForcadoDoCodigo();
  assert.equal(forcado.param, 'talkxState');
  assert.deepEqual(forcado.valores, ['empty', 'loading', 'error', 'crm', 'wa', 'perm']);
  assert.deepEqual(forcado.valores, ESTADOS_FORCADOS);
});

test('se ?talkxState for renomeado, o doc regenerado muda junto (--check quebra)', () => {
  const dir = dirComTelas({ 'TalkXAlfa.tsx': 'const x = 1;' });
  const linhas = matriz(dir);
  const real = readFileSync(FORCED_STATE_SRC, 'utf8');
  const renomeado = real.split("talkxState").join("novoParam");
  const fake = join(dir, 'forcedState.ts');
  writeFileSync(fake, renomeado);
  const forcado = lerEstadoForcadoDoCodigo(fake);
  assert.equal(forcado.param, "novoParam");
  assert.deepEqual(forcado.valores, ESTADOS_FORCADOS);
  assert.deepEqual(forcado.valores, ESTADOS_FORCADOS);
  const markdown = renderMarkdown(linhas, ESTADOS, dir, forcado);
  assert.ok(markdown.includes('?novoParam='), 'o doc renomeado tem de citar o parametro novo');
  const atual = renderMarkdown(linhas, ESTADOS, dir);
  assert.ok(!atual.includes('?novoParam='), 'o doc atual nao pode conter o parametro renomeado');
});

test('a cobertura do estado forçado lista arquivo:linha reais do código', () => {
  const pontos = coberturaEstadoForcado();
  assert.ok(pontos.length > 0);
  assert.ok(pontos.some((pt) => pt.startsWith('src/components/talkx/kit/forcedState.ts:')));
  assert.ok(pontos.some((pt) => pt.startsWith('src/components/talkx/kit/states.tsx:')));
});

test('docs/talkx/ESTADOS.md commitado bate com o código do repositório', () => {
  const dir = join(import.meta.dirname, '..', '..', 'src', 'components', 'talkx');
  const esperado = renderMarkdown(matriz(dir), ESTADOS, dir);
  const atual = readFileSync(SAIDA, 'utf8');

  assert.equal(atual, esperado, 'rode `node scripts/talkx/gen-estados.mjs` e commite o resultado');
});
