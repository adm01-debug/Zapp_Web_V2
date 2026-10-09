// IA-005 / SL-060 — as 12 metas de qualidade de IA precisam ser VERIFICÁVEIS.
//
// O documento `docs/ia/IA-005-metas-de-qualidade.md` propõe 12 metas (M1..M12) e separa o
// que é BASE (medido no repositório) do que é PROPOSTA e do que é A MEDIR. O buraco que
// sobrou no inventário de 07/10/2026 era exatamente esse: "Latência e custo 'a medir';
// conjunto de avaliação IA-188 inexistente" — as metas existiam só como prosa: nenhuma
// guarda impedia (a) uma meta ser declarada cumprida sem medição, (b) M8/M9 ganharem teto
// numérico sem medição de referência, (c) o alvo do M4 (>=95% em 200 casos) ser apagado,
// ou (d) a seção de estado citar uma prova que não existe no repositório.
//
// Esta guarda trava as quatro pontas. Ela NÃO mede qualidade e NÃO declara número nenhum:
// a medição do M4 depende do conjunto reservado de IA-188 (referência humana) e a de
// M8/M9 depende do ensaio de carga/orçamento IA-189 — medição concluída e meta atingida
// são estados diferentes (mesma distinção do guarda `catalog-ct73-docs.unit.mjs`).
//
// Convenção da casa: guardas de documentação moram em `scripts/ci/*.unit.mjs` e rodam no
// passo "Test CI and Edge deployment guards" do ci.yml (`node --test scripts/ci/*.unit.mjs`).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = join(RAIZ, 'docs', 'ia', 'IA-005-metas-de-qualidade.md');

const DOC_TXT = readFileSync(DOC, 'utf8');
const IDS = Array.from({ length: 12 }, (_, i) => `M${i + 1}`);

// Seção do documento a partir de "## <n>." (até a próxima seção de mesmo nível).
function secao(texto, n) {
  const partes = texto.split(new RegExp(`^##\\s*${n}\\.`, 'm'));
  return partes[1] ? partes[1].split(/^##\s/m)[0] : '';
}

// Linhas de tabela de uma seção, agrupadas por id de meta (`| M4 | ... |`).
function linhasDeMeta(texto) {
  const porId = new Map();
  for (const linha of texto.split('\n')) {
    const m = /^\|\s*(M\d{1,2})\s*\|/.exec(linha);
    if (!m) continue;
    if (!porId.has(m[1])) porId.set(m[1], []);
    porId.get(m[1]).push(linha);
  }
  return porId;
}

// Células de uma linha de tabela Markdown (sem as barras externas).
function celulas(linha) {
  return linha
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
}

// Meta declarada como CUMPRIDA/ATINGIDA sem medição datada. Devolve os ids infratores.
// "Medir" não é "cumprir": quem declara a meta cumprida tem de nomear a data e a fonte.
export function cumpridasSemMedicao(texto) {
  const infratores = [];
  for (const [id, linhas] of linhasDeMeta(texto)) {
    for (const linha of linhas) {
      if (!/cumprid|atingid|aprovad[oa]\b|medid[oa]\b/i.test(linha)) continue;
      const temData = /20\d\d-\d\d-\d\d/.test(linha);
      const temFonte = /fonte|origem|ambiente|comando|ensaio/i.test(linha);
      if (!temData || !temFonte) infratores.push(id);
    }
  }
  return infratores;
}

test('§2 propõe exatamente as 12 metas M1..M12, cada uma uma vez', () => {
  const porId = linhasDeMeta(secao(DOC_TXT, 2));
  for (const id of IDS) {
    const linhas = porId.get(id);
    assert.ok(linhas, `a meta ${id} sumiu do §2 de IA-005-metas-de-qualidade.md`);
    assert.equal(linhas.length, 1, `a meta ${id} aparece ${linhas.length}x no §2 (esperado 1x)`);
  }
  assert.equal(porId.size, 12, `o §2 tem ${porId.size} metas distintas (esperado 12)`);
});

test('M4 preserva o alvo proposto (>=95% factual em 200 casos) e a dependência IA-188', () => {
  const linha = linhasDeMeta(secao(DOC_TXT, 2)).get('M4')[0];
  assert.match(linha, /95\s*%/, 'o alvo ">= 95%" do M4 sumiu');
  assert.match(linha, /200\s*casos/i, 'o conjunto mínimo de 200 casos do M4 sumiu');
  assert.match(linha, /IA-188/, 'o M4 perdeu a dependência do conjunto de avaliação IA-188');
});

test('M8 (latência) e M9 (custo) continuam A MEDIR, sem teto numérico inventado', () => {
  const porId = linhasDeMeta(secao(DOC_TXT, 2));
  for (const id of ['M8', 'M9']) {
    const linha = porId.get(id)[0];
    assert.match(linha, /A MEDIR/i, `${id} deixou de declarar "A MEDIR"`);
    assert.doesNotMatch(linha, /\d+\s*ms\b/i, `${id} ganhou teto de latência sem medição de referência`);
    assert.doesNotMatch(linha, /R\$|\d+\s*(centavos|reais)/i, `${id} ganhou teto de custo sem medição de referência`);
  }
});

test('§5 dá a cada meta uma prova rastreável (arquivo existente) ou nomeia a etapa que a mede', () => {
  const porId = linhasDeMeta(secao(DOC_TXT, 5));
  assert.ok(porId.size > 0, 'falta a seção "## 5." com o estado de cada meta');
  for (const id of IDS) {
    const linha = porId.get(id)?.[0];
    assert.ok(linha, `a seção §5 não tem linha para ${id}`);
    const onde = celulas(linha)[1] ?? '';
    const falta = celulas(linha)[2] ?? '';
    if (/A MEDIR/i.test(onde)) {
      assert.match(falta, /IA-\d{3}/, `${id} está A MEDIR mas não nomeia a etapa que produz a medição`);
      continue;
    }
    const caminhos = [...onde.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    assert.ok(caminhos.length > 0, `${id} precisa citar ao menos um arquivo de prova entre crases`);
    const existentes = caminhos.filter((c) => existsSync(join(RAIZ, c)));
    assert.ok(
      existentes.length > 0,
      `${id} só cita caminho(s) que não existem no repositório: ${caminhos.join(', ')}`,
    );
  }
});

test('nenhuma meta é declarada cumprida sem medição datada (e a guarda pega quem tentar)', () => {
  // Fixtures: o defeito que a guarda existe para pegar.
  const semMedicao = '| M4 | fato | **CUMPRIDA** | conjunto revisado | IA-188 |';
  assert.deepEqual(cumpridasSemMedicao(semMedicao), ['M4'], 'a guarda não pegou "CUMPRIDA" sem data/fonte');
  const comMedicao =
    '| M4 | fato | **CUMPRIDA** em 2026-11-01 (fonte: ensaio IA-188, 200 casos) | conjunto revisado | IA-188 |';
  assert.deepEqual(cumpridasSemMedicao(comMedicao), [], 'a guarda recusou medição datada com fonte');
  // E o documento real: hoje nenhuma das 12 metas está declarada cumprida.
  assert.deepEqual(
    cumpridasSemMedicao(DOC_TXT),
    [],
    'IA-005 declara meta cumprida sem medição datada — medição concluída não é meta atingida',
  );
});
