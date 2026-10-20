// E92 (auditoria de GitHub Actions, 2026-10-01): os templates de issue e de PR
// apontavam para fora da realidade do projeto — a "Documentacao" mandava para
// `adm01-debug/zapp-web` (repo que nao e' este), o "Suporte" abria um WhatsApp
// com telefone placeholder (`5511999999999`) e o template de PR pedia "testei no
// ambiente de staging", que neste projeto NAO EXISTE.
//
// Por que isto virou teste: "Verificacao: revisao" nao sobrevive a proxima
// edicao. Um link errado so' e' descoberto quando alguem clica e cai no vazio, e
// o pedido de staging faz o autor marcar uma caixa que nao corresponde a nada.
// Aqui os invariantes ficam presos e a regressao aparece no CI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CONFIG = new URL('../../.github/ISSUE_TEMPLATE/config.yml', import.meta.url);
const PR_TEMPLATE = new URL('../../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url);
const REPO = 'adm01-debug/Zapp_Web_V2';

test('E92: todo link de contato aponta para ESTE repositorio', async () => {
  const yml = await readFile(CONFIG, 'utf8');
  const urls = [...yml.matchAll(/^\s*url:\s*(\S+)\s*$/gm)].map((m) => m[1]);

  assert.ok(urls.length >= 1, 'o config.yml ficou sem nenhum link de contato');
  for (const url of urls) {
    assert.ok(
      url.includes(REPO),
      `link de contato aponta para outro repo: ${url} (o correto contem ${REPO})`,
    );
  }
});

test('E92: sem telefone placeholder no template de issue', async () => {
  const yml = await readFile(CONFIG, 'utf8');

  assert.doesNotMatch(yml, /wa\.me/, 'o link de WhatsApp placeholder voltou');
  assert.doesNotMatch(yml, /9999999/, 'telefone placeholder voltou ao config.yml');
});

test('E92: o template de PR nao pede teste em staging', async () => {
  const md = await readFile(PR_TEMPLATE, 'utf8');

  assert.doesNotMatch(
    md,
    /staging/i,
    'nao existe ambiente de staging neste projeto — a caixa faz o autor marcar algo que nao existe',
  );
});

test('E92: o template de PR cobra os passos pos-merge de banco e Edge', async () => {
  const md = await readFile(PR_TEMPLATE, 'utf8');

  assert.match(md, /Migration\?/, 'falta a pergunta de migration');
  assert.match(md, /ledger/, 'migration sem registro no ledger nao fecha o ciclo');
  assert.match(md, /Edge\?/, 'falta a pergunta de Edge Function');
  assert.match(md, /deploy-functions/, 'o passo pos-merge da Edge precisa ser nomeado, nao implicito');
});

test('E92: o template de PR continua sendo markdown de checklist', async () => {
  // Guarda contra "conserto" que apaga o arquivo: um template vazio e' pior que
  // o errado, porque nao ha' o que o autor siga.
  const md = await readFile(PR_TEMPLATE, 'utf8');

  const caixas = (md.match(/^- \[ \]/gm) ?? []).length;
  assert.ok(caixas >= 10, `o template perdeu checkboxes (achei ${caixas})`);
});
