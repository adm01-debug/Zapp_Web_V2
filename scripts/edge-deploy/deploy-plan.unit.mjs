// E57: o modo de ensaio precisa publicar um plano que nao minta.
//
// O ponto delicado desta etapa: o digest local (source_sha256 do manifesto) e o
// digest remoto (ezbr_sha256 do bundle publicado) sao objetos DIFERENTES. Um
// plano que os comparasse para dizer "inalterada" afirmaria uma igualdade que
// ninguem mediu -- e o operador aprovaria um ensaio com base nela.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digestDoPlano, montarPlano, resumoDoPlano } from './deploy-plan.mjs';

const workflow = await readFile(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const manifesto = {
  functions: [
    { name: 'talkx-send', source_sha256: A },
    { name: 'chatbot-l1', source_sha256: B },
  ],
};
const remoto = {
  project_ref: 'tnnnlkbymytvtqngbbqh',
  observed_at: '2026-10-03T00:00:00.000Z',
  functions: [{ slug: 'talkx-send', version: 7, ezbr_sha256: 'c'.repeat(64) }],
};

test('E57: o plano cobre o escopo e marca o que ainda nao existe no ar', () => {
  const plano = montarPlano({ manifesto, remoto, escopo: '' });
  assert.equal(plano.total, 2);
  assert.equal(plano.novas, 1);
  const porNome = Object.fromEntries(plano.linhas.map((l) => [l.funcao, l]));
  assert.deepEqual(porNome['chatbot-l1'].situacao, 'nova (nao existe no ar)');
  assert.deepEqual(porNome['talkx-send'].situacao, 'existente (publicaria por cima)');
  assert.equal(porNome['talkx-send'].versao_no_ar, 7);
  assert.deepEqual(montarPlano({ manifesto, remoto, escopo: 'talkx-send' }).total, 1);
  assert.deepEqual(montarPlano({ manifesto, remoto, escopo: 'inexistente' }).total, 0);
});

test('E57: os dois digests aparecem lado a lado e NAO sao comparados', () => {
  const plano = montarPlano({ manifesto, remoto, escopo: '' });
  const linha = plano.linhas.find((l) => l.funcao === 'talkx-send');
  assert.equal(linha.source_sha256, A, 'o digest do que este commit publicaria');
  assert.equal(linha.ezbr_sha256_no_ar, 'c'.repeat(64), 'o digest do que esta no ar');
  assert.notEqual(linha.source_sha256, linha.ezbr_sha256_no_ar);
  // O plano nunca afirma igualdade entre os dois: a situacao so' descreve presenca.
  for (const l of plano.linhas) {
    assert.doesNotMatch(l.situacao, /inalterada|igual|mesmo digest/);
  }
});

test('E57: digest do plano e estavel (ordem de entrada e observed_at nao contam)', () => {
  const um = montarPlano({ manifesto, remoto, escopo: '' });
  const outro = montarPlano({
    manifesto: { functions: [...manifesto.functions].reverse() },
    remoto: { ...remoto, observed_at: '2027-01-01T00:00:00.000Z' },
    escopo: '',
  });
  assert.equal(digestDoPlano(um), digestDoPlano(outro), 'a mesma decisao tem de dar o mesmo digest');
  const diferente = montarPlano({
    manifesto: { functions: [{ name: 'talkx-send', source_sha256: 'd'.repeat(64) }, manifesto.functions[1]] },
    remoto,
    escopo: '',
  });
  assert.notEqual(digestDoPlano(um), digestDoPlano(diferente), 'codigo diferente tem de mudar o digest');
  assert.match(digestDoPlano(um), /^[a-f0-9]{64}$/);
});

test('E57: o resumo nomeia o plano e traz o digest para o operador copiar', () => {
  const texto = resumoDoPlano(montarPlano({ manifesto, remoto, escopo: '' }));
  assert.match(texto, /escopo=\(total\) funcoes=2 novas=1/);
  assert.match(texto, /plano_sha256=[a-f0-9]{64}/);
  assert.match(texto, /chatbot-l1: local=b{12} no-ar=ausente/);
});

test('E57: o workflow tem dry_run, publica o plano antes do Deploy e nao escreve no ensaio (pin)', () => {
  assert.match(workflow, /^ {6}dry_run:$/m, 'input dry_run tem de existir');
  const posPlano = workflow.indexOf('Publicar plano do deploy');
  const posDeploy = workflow.indexOf('\n      - name: Deploy\n');
  assert.ok(posPlano > 0, 'passo do plano tem de existir');
  assert.ok(posDeploy > posPlano, 'o plano vem antes do Deploy');
  // Nenhuma escrita acontece no ensaio: o Deploy e todo passo posterior ficam
  // atras do input.
  const depoisDoDeploy = workflow.slice(posDeploy);
  const passos = depoisDoDeploy.split('\n      - name: ').slice(1);
  assert.ok(passos.length >= 5, `esperava os passos pos-deploy, achei ${passos.length}`);
  for (const passo of passos) {
    const nome = passo.split('\n')[0];
    assert.match(passo.slice(0, 400), /inputs\.dry_run != true/, `passo "${nome}" nao esta atras do dry_run`);
  }
});
