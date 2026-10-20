import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  RAIZ_REPO,
  RAIZES_PERMITIDAS,
  estaDentro,
  resolverCaminhoPermitido,
  resolverExecutavel,
} from './seguranca-processo.mjs';

test('resolverExecutavel devolve caminho absoluto existente igual ao do shell', () => {
  const resolvido = resolverExecutavel('node');
  assert.equal(path.isAbsolute(resolvido), true, 'caminho resolvido nao e absoluto: ' + resolvido);
  assert.equal(fs.existsSync(resolvido), true, 'binario nao existe: ' + resolvido);

  // `which` resolvido pelo mesmo helper: o que se compara aqui e o que cada um
  // acha para `node`, nao a busca em si — `which` faz a propria busca no PATH.
  const which = spawnSync(resolverExecutavel('which'), ['node'], { encoding: 'utf8' });
  assert.equal(which.status, 0, which.stderr);
  const doShell = which.stdout.trim();
  // E o MESMO binario que o shell resolveria: nao pode pegar outro shim do PATH.
  assert.equal(resolvido, doShell);
});

test('resolverExecutavel lanca para comando inexistente', () => {
  assert.throws(
    () => resolverExecutavel('comando-que-nao-existe-xyz'),
    /comando nao encontrado no PATH: comando-que-nao-existe-xyz/,
  );
});

test('estaDentro aceita a raiz e subpastas', () => {
  assert.equal(estaDentro('/a/b', '/a/b'), true, 'a propria raiz conta como dentro');
  assert.equal(estaDentro('/a/b', '/a/b/sub'), true);
  assert.equal(estaDentro('/a/b', '/a/b/sub/deep'), true);
});

test('estaDentro recusa ".." puro, irmao com prefixo igual e caminho fora', () => {
  // '..' puro relativo a raiz nao esta dentro dela.
  assert.equal(estaDentro('/a/b', path.join('/a/b', '..')), false);
  // Erro classico do prefixo de string: '/a/bc' NAO e subpasta de '/a/b'.
  assert.equal(estaDentro('/a/b', '/a/bc/x'), false);
  assert.equal(estaDentro('/a/b', '/etc/passwd'), false);
});

test('resolverCaminhoPermitido aceita caminho do repositorio e do tmpdir', () => {
  const doRepo = path.join(RAIZ_REPO, 'package.json');
  assert.equal(resolverCaminhoPermitido(doRepo, 'recurso'), doRepo);

  const doTmp = path.join(os.tmpdir(), 'seguranca-processo-teste.json');
  assert.equal(resolverCaminhoPermitido(doTmp, 'recurso'), doTmp);
});

test('resolverCaminhoPermitido recusa ".." relativo, absoluto fora e escape do repo', () => {
  assert.throws(
    () => resolverCaminhoPermitido('../../etc/passwd', 'entrada'),
    /fora das raizes permitidas/,
  );
  assert.throws(
    () => resolverCaminhoPermitido('/etc/passwd', 'entrada'),
    /fora das raizes permitidas/,
  );
  assert.throws(
    () => resolverCaminhoPermitido(path.join(RAIZ_REPO, '..', 'fora.json'), 'entrada'),
    /fora das raizes permitidas/,
  );
});

test('resolverCaminhoPermitido respeita o array de raizes explicito do chamador', () => {
  const sub = path.join(RAIZ_REPO, 'scripts');
  const dentro = path.join(sub, 'lib', 'seguranca-processo.mjs');
  assert.equal(resolverCaminhoPermitido(dentro, 'entrada', [sub]), dentro);
  // Um caminho valido do repo, mas FORA da raiz explicita, tem de ser recusado.
  assert.throws(
    () => resolverCaminhoPermitido(path.join(RAIZ_REPO, 'package.json'), 'entrada', [sub]),
    /fora das raizes permitidas/,
  );
});

test('RAIZ_REPO aponta para o pacote Zapp_Web_V2 e esta entre as raizes permitidas', () => {
  const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'package.json'), 'utf8'));
  assert.equal(pacote.name, 'zapp-web-v2');
  assert.equal(RAIZES_PERMITIDAS.includes(RAIZ_REPO), true);
});
