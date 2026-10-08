// Guarda da revisão final dos documentos de Telefonia (T92 do plano
// `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`).
//
// O aceite do T92 é "nenhuma afirmação sem linha de código correspondente".
// Documento de módulo só vale enquanto cada caminho que ele cita existir: a
// revisão de 08/10/2026 mediu que `useSipConnection.ts` mudou de pasta (de
// `src/hooks/communication/` para `src/hooks/sip/`) e que a linha do
// `handleCallEvent` andou — citação morta em documento é afirmação sem código.
//
// Duas regras, só apertando:
//   1. os dois documentos carregam a linha de revisão com data e commit;
//   2. toda citação de arquivo resolve para um arquivo do repositório e, quando
//      traz `:linha`, a linha existe no arquivo — e o caminho é completo a
//      partir da raiz (nome solto não diz de onde é depois que a pasta muda:
//      foi exatamente o defeito medido em 08/10).
//
// Vermelho antes de revisar `docs/telefonia/CAPACIDADES.md` e
// `docs/telefonia/CONTRATO.md`; verde depois.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DOCS = [
  'docs/telefonia/CAPACIDADES.md',
  'docs/telefonia/CONTRATO.md',
];

const EXTENSOES = 'ts|tsx|mjs|sh|md|json|sql|yml|yaml';

/** `caminho/arquivo.ext`, `caminho/arquivo.ext:12` ou `...:12-20` dentro de crase. */
const CITACAO = new RegExp(
  '`([A-Za-z0-9_][A-Za-z0-9_./-]*\\.(?:' + EXTENSOES + '))(:(\\d+)(?:-(\\d+))?)?`',
  'g',
);

/** Linha de revisão: "Revisão final ... dd/mm/aaaa ... <commit de 7 a 40 hex>". */
const REVISAO = /Revis[ãa]o final/i;

function ler(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

function citacoes(texto) {
  const achados = [];
  for (const m of texto.matchAll(CITACAO)) {
    achados.push({ arquivo: m[1], linha: m[3] ? Number(m[3]) : null, fim: m[4] ? Number(m[4]) : null });
  }
  return achados;
}

test('T92: os dois documentos carregam a Revisão final com data e commit', () => {
  for (const doc of DOCS) {
    const texto = ler(doc);
    const linhas = texto.split('\n').filter((l) => REVISAO.test(l));
    assert.ok(linhas.length > 0, `${doc}: sem linha de "Revisão final" (o aceite do T92 pede data e commit)`);
    const linha = linhas[0];
    assert.match(linha, /\d{2}\/\d{2}\/\d{4}/, `${doc}: a linha de revisão precisa da data (dd/mm/aaaa)`);
    assert.match(linha, /(?:commit|cabe[çc]a)[^0-9a-f]*[0-9a-f]{7,40}/i,
      `${doc}: a linha de revisão precisa do commit (7 a 40 hex após "commit"/"cabeça")`);
  }
});

test('T92: toda citação de arquivo existe no repositório', () => {
  for (const doc of DOCS) {
    for (const { arquivo } of citacoes(ler(doc))) {
      assert.ok(arquivo.includes('/'),
        `${doc}: citação "${arquivo}" é nome solto; use o caminho a partir da raiz (nome solto não é conferível)`);
      assert.ok(fs.existsSync(path.join(RAIZ, arquivo)),
        `${doc}: citação de arquivo que não existe: ${arquivo}`);
    }
  }
});

test('T92: citação com linha aponta para linha que existe no arquivo', () => {
  for (const doc of DOCS) {
    for (const { arquivo, linha, fim } of citacoes(ler(doc))) {
      if (linha === null) continue;
      const caminho = path.join(RAIZ, arquivo);
      assert.ok(fs.existsSync(caminho), `${doc}: citação com linha de arquivo inexistente: ${arquivo}`);
      const total = ler(arquivo).split('\n').length;
      assert.ok(linha <= total, `${doc}: ${arquivo}:${linha} passa do fim do arquivo (${total} linhas)`);
      if (fim !== null) {
        assert.ok(fim >= linha, `${doc}: ${arquivo}:${linha}-${fim} tem fim antes do início`);
        assert.ok(fim <= total, `${doc}: ${arquivo}:${linha}-${fim} passa do fim do arquivo (${total} linhas)`);
      }
    }
  }
});
