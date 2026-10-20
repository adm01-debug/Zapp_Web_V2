import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// X033 — contrato do template n8n versionado docs/talkx/n8n/talkx-alerts.json.
// O template NAO e importado nem ativado aqui: o teste roda 100% offline sobre o JSON em disco.
// No HTTP Request 4.2 uma resposta array e EXPANDIDA em itens; logo cada `$json` e um objeto de
// alerta e nao possui `length`. O IF precisa operar sobre a colecao de itens recebidos, aceitar
// somente o contrato minimo de alerta e o Code node so pode agregar itens validos, uma unica vez.
//
// O contrato e verificado EXECUTANDO as expressoes reais do template (a condicao do IF e o jsCode
// do Code node), nunca reimplementando o predicado no teste: assim o teste falha quando o template
// muda e passa quando o template volta a cumprir o contrato.

const RAIZ = join(fileURLToPath(import.meta.url), '../../..');
const CAMINHO_TEMPLATE = join(RAIZ, 'docs/talkx/n8n/talkx-alerts.json');

const lerBruto = () => readFileSync(CAMINHO_TEMPLATE, 'utf8');
const lerWorkflow = () => JSON.parse(lerBruto());

const alerta = (id, kind, openedAt) => ({ id, kind, campaign_id: null, payload: null, opened_at: openedAt });

// Objeto de erro/resposta invalida: nem 2xx, nem alerta.
const RESPOSTA_INVALIDA = { statusCode: 401, message: 'Invalid API key', error: 'Unauthorized', code: 'PGRST301' };

// Modela a saida do HTTP Request 4.2: cada elemento do array vira um item (item.json = objeto).
function expandirResposta(corpo) {
  const elementos = Array.isArray(corpo) ? corpo : [corpo];
  return elementos.map((json) => ({ json }));
}

const noPorNome = (wf, nome) => {
  const no = wf.nodes.find((n) => n.name === nome);
  assert.ok(no, `no "${nome}" nao encontrado no template`);
  return no;
};

// Complementa o operador do IF v2 (semantica do n8n, nao do template). So os operadores usados
// pelo template sao modelados; qualquer operador novo falha alto em vez de passar em silencio.
function aplicarOperador(esquerda, direita, operador) {
  const { type, operation } = operador ?? {};
  if (type === 'number' && operation === 'gt') return Number(esquerda) > Number(direita);
  if (type === 'boolean' && operation === 'true') return esquerda === true;
  if (type === 'boolean' && operation === 'false') return esquerda === false;
  if (type === 'string' && operation === 'equals') return String(esquerda) === String(direita);
  if (type === 'string' && operation === 'notEmpty') return String(esquerda ?? '') !== '';
  throw new Error(`operador nao modelado no teste: ${JSON.stringify(operador)}`);
}

// Avalia o IF v2 executando a expressao REAL do template, item a item, com $json e $input disponiveis.
function avaliarIf(noIf, itens) {
  const condicoes = noIf.parameters?.conditions?.conditions;
  assert.ok(Array.isArray(condicoes) && condicoes.length > 0, 'IF sem condicoes');
  const combinator = noIf.parameters?.conditions?.combinator ?? 'and';
  const avaliarCondicao = (cond, item) => {
    const fonte = String(cond.leftValue).trim().replace(/^=\{\{/, '').replace(/\}\}$/, '');
    const fn = new Function('$input', '$json', `"use strict"; return (${fonte});`);
    return aplicarOperador(fn({ all: () => itens }, item.json), cond.rightValue, cond.operator);
  };
  return itens.map((item) => {
    const veredito = condicoes.map((c) => avaliarCondicao(c, item));
    return combinator === 'and' ? veredito.every(Boolean) : veredito.some(Boolean);
  });
}

// Executa o Code node REAL (Run Once for All Items) com os itens que chegaram nele.
function executarCode(noCode, itens) {
  const fn = new Function('$input', noCode.parameters.jsCode);
  return fn({ all: () => itens });
}

test('X033: dois alertas abertos seguem pelo ramo verdadeiro e o Code agrega uma unica vez', () => {
  const wf = lerWorkflow();
  const noIf = noPorNome(wf, 'Tem alerta aberto?');
  const noCode = noPorNome(wf, 'Montar resumo');

  const itens = expandirResposta([
    alerta('a1', 'falha_envio', '2026-10-05T01:00:00Z'),
    alerta('a2', 'optout', '2026-10-05T02:00:00Z'),
  ]);

  const resultados = avaliarIf(noIf, itens);
  assert.deepEqual(
    resultados,
    [true, true],
    'com a resposta expandida por item, os dois alertas precisam ir pelo ramo verdadeiro',
  );

  const ramoVerdadeiro = itens.filter((_, i) => resultados[i]);
  const saida = executarCode(noCode, ramoVerdadeiro);
  assert.equal(saida.length, 1, 'o Code node deve agregar tudo em um unico item');
  assert.equal(saida[0].json.total, 2, 'os dois alertas validos precisam ser contados');
  assert.match(saida[0].json.texto, /falha_envio/);
  assert.match(saida[0].json.texto, /optout/);
});

test('X033: objeto de erro/resposta invalida nunca vira alerta', () => {
  const wf = lerWorkflow();
  const noIf = noPorNome(wf, 'Tem alerta aberto?');
  const noCode = noPorNome(wf, 'Montar resumo');

  const itens = expandirResposta(RESPOSTA_INVALIDA);
  const resultados = avaliarIf(noIf, itens);
  assert.deepEqual(resultados, [false], 'resposta invalida nao pode seguir pelo ramo verdadeiro');

  const ramoVerdadeiro = itens.filter((_, i) => resultados[i]);
  assert.equal(ramoVerdadeiro.length, 0);

  // Mesmo se o objeto invalido chegasse ao Code node, ele nao pode ser contado.
  const saida = executarCode(noCode, itens);
  assert.equal(saida.length, 1);
  assert.equal(saida[0].json.total, 0, 'objeto de erro/resposta invalida nao pode ser contado como alerta');
});

test('X033: resposta expandida mista conta so o contrato minimo, mesmo no ramo verdadeiro', () => {
  const wf = lerWorkflow();
  const noIf = noPorNome(wf, 'Tem alerta aberto?');
  const noCode = noPorNome(wf, 'Montar resumo');

  const itens = expandirResposta([
    alerta('a1', 'falha_envio', '2026-10-05T01:00:00Z'),
    RESPOSTA_INVALIDA,
    alerta('a2', 'optout', '2026-10-05T02:00:00Z'),
  ]);

  const resultados = avaliarIf(noIf, itens);
  assert.deepEqual(
    resultados,
    [true, true, true],
    'havendo alerta valido, o ramo verdadeiro e seguido por todos os itens do lote',
  );

  // O item invalido pode viajar pelo ramo verdadeiro junto com os validos: quem barra e o Code.
  const saida = executarCode(noCode, itens);
  assert.equal(saida.length, 1, 'uma unica agregacao');
  assert.equal(saida[0].json.total, 2, 'so os dois itens do contrato minimo contam');
  assert.doesNotMatch(saida[0].json.texto, /Invalid API key|statusCode|Unauthorized/);
});

test('X033: template segue inativo e sem $json.length', () => {
  const bruto = lerBruto();
  assert.equal(lerWorkflow().active, false, 'o template versionado deve continuar active: false');
  const alvo = '$json' + '.length';
  assert.equal(bruto.includes(alvo), false, 'nao pode restar $json.length no template');
});

test('X033: grafo preservado — IF roteia verdadeiro para Montar resumo e falso para Nada a fazer', () => {
  const wf = lerWorkflow();
  const saidas = wf.connections['Tem alerta aberto?']?.main ?? [];
  assert.deepEqual(
    saidas.map((ramo) => ramo.map((c) => c.node)),
    [['Montar resumo'], ['Nada a fazer']],
  );
});
