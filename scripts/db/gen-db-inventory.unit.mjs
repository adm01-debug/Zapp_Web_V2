import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGO, DOC, LINHAS, tabelaDeContagens, documentoAtualizado } from './gen-db-inventory.mjs';

const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'));
const doc = readFileSync(DOC, 'utf8');

test('o documento commitado ja esta em dia com o catalogo (o gerador e idempotente)', () => {
  assert.equal(documentoAtualizado(doc, catalogo), doc,
    'rode `node scripts/db/gen-db-inventory.mjs` e commite o resultado');
});

test('a tabela sai com uma linha por chave presente no catalogo, na ordem declarada', () => {
  const linhas = tabelaDeContagens(catalogo).split('\n');
  assert.equal(linhas[0], '| Objeto | Quantidade |');
  assert.equal(linhas[1], '|---|---|');
  const chaves = linhas.slice(2).map((l) => l.match(/`([a-z_]+)`/u)[1]);
  assert.deepEqual(chaves, LINHAS.map(([k]) => k).filter((k) => catalogo[k] !== undefined));
});

test('contagem nova no catalogo aparece no documento', () => {
  const inflado = { ...catalogo, columns: [...(catalogo.columns ?? []), { nome: 'coluna_de_teste' }] };
  const saida = documentoAtualizado(doc, inflado);
  const esperado = (catalogo.columns?.length ?? 0) + 1;
  assert.match(saida, new RegExp(`\\\\| Colunas \\\\(\`columns\`\\\\) \\\\| ${esperado} \\\\|`, 'u'));
  assert.notEqual(saida, doc);
});

test('o gerador NAO mexe no inventario de tabelas nem no resto do documento', () => {
  const inflado = { ...catalogo, functions: [...(catalogo.functions ?? []), { nome: 'f_de_teste' }] };
  const saida = documentoAtualizado(doc, inflado);
  const corte = (t) => t.slice(t.indexOf('## Tabelas'));
  assert.equal(corte(saida), corte(doc), 'a secao de tabelas tem de sair intacta');
  assert.equal(saida.slice(0, saida.indexOf('## Objetos por tipo')), doc.slice(0, doc.indexOf('## Objetos por tipo')));
});

test('documento sem a secao de contagens falha alto, em vez de ser reescrito errado', () => {
  assert.throws(() => documentoAtualizado('# so um titulo\n', catalogo), /Objetos por tipo/u);
  assert.throws(() => documentoAtualizado('## Objetos por tipo\n\ntexto sem tabela\n\n## Fim\n', catalogo), /tabela de contagens/u);
});
