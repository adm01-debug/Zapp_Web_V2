/**
 * Prova do comando único das provas de banco do chat interno
 * (`scripts/ci/team-chat-local-gates.sh`, N-069; fonte E07 + F21-F26).
 *
 * O defeito: `scripts/ci/team-chat-local-gates.sh` não existia, então não havia
 * um comando só que rodasse o conjunto `scripts/db-audit/team-*.test.sh` da
 * frente de chat interno — e nada provava que o conjunto passa. O comando tem de
 * ser fail-closed: qualquer prova que falhe derruba o comando (exit 1), e
 * "nenhuma prova encontrada" também é falha.
 *
 * Como prova: o script DE VERDADE é executado em child process (`/bin/bash`) com
 * provas FALSAS no lugar das reais — nenhuma toca Docker nem banco. As provas
 * falsas escrevem um marcador antes de sair, então "rodou" é medido, não suposto.
 *
 * Por que uma árvore temporária: o script resolve `scripts/db-audit` a partir da
 * própria posição, e é esse caminho PADRÃO (sem `TEAM_CHAT_GATES_DIR`) que o uso
 * real percorre. A árvore monta `<tmp>/scripts/ci` + `<tmp>/scripts/db-audit` e
 * recebe os BYTES do script versionado (lidos aqui, não reescritos), de modo que
 * o caminho padrão é exercitado sem encostar no repositório.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = join(RAIZ, 'scripts/ci/team-chat-local-gates.sh');
// Sem o script (o estado anterior ao cartão) o módulo nem carrega: é o vermelho.
const FONTE = readFileSync(GATE, 'utf8');

// /bin/bash explícito, não 'bash': o primeiro argumento de spawnSync não pode ser
// um literal resolvido por PATH (javascript:S4036, CWE-427).
const BASH = '/bin/bash';

/** Prova falsa que passa e registra no marcador que foi executada. */
function provaOk(nome) {
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    `printf 'PROVA OK: ${nome}\\n'`,
    `printf '%s\\n' '${nome}' >> "$MARCADOR"`,
    '',
  ].join('\n');
}

/** Prova falsa que registra a execução e FALHA (exit 1). */
function provaQuebrada(nome) {
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    `printf 'PROVA OK: ${nome}\\n'`,
    `printf '%s\\n' '${nome}' >> "$MARCADOR"`,
    `printf '[FAIL] ${nome}: contrato quebrado de proposito\\n' >&2`,
    'exit 1',
    '',
  ].join('\n');
}

/**
 * Monta `<tmp>/scripts/{ci,db-audit}` com o script versionado e provas falsas.
 * `provas` são escritas em `scripts/db-audit` (0644 de propósito: só `bash
 * <prova>` as executa, então o bit de execução não é o que faz o comando rodar).
 */
function montarArvore({ provas = {}, extras = [] } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'team-chat-gates-'));
  mkdirSync(join(repo, 'scripts/ci'), { recursive: true });
  mkdirSync(join(repo, 'scripts/db-audit'), { recursive: true });
  writeFileSync(join(repo, 'scripts/ci/team-chat-local-gates.sh'), FONTE, { mode: 0o755 });
  for (const [nome, corpo] of Object.entries(provas)) {
    writeFileSync(join(repo, 'scripts/db-audit', nome), corpo, { mode: 0o644 });
  }
  for (const { caminho, corpo = '', diretorio = false } of extras) {
    const destino = join(repo, caminho);
    if (diretorio) {
      mkdirSync(destino, { recursive: true });
    } else {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, corpo, { mode: 0o644 });
    }
  }
  return repo;
}

/** Executa o comando numa árvore; devolve status e saída (stdout+stderr juntos). */
function rodarGate(repo, env = {}) {
  const herdado = { ...process.env };
  delete herdado.TEAM_CHAT_GATES_DIR; // hermeticidade: nada de override do ambiente
  const r = spawnSync(BASH, [join(repo, 'scripts/ci/team-chat-local-gates.sh')], {
    encoding: 'utf8',
    env: { ...herdado, ...env },
  });
  return { status: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

let ultimoMarcador = 0;
function caminhoMarcador() {
  ultimoMarcador += 1;
  return join(mkdtempSync(join(tmpdir(), 'team-chat-gates-marcador-')), `marcador-${ultimoMarcador}.txt`);
}

/** Provas que o comando realmente executou (o marcador é escrito por elas). */
function executadas(marcador) {
  if (!existsSync(marcador)) return [];
  return readFileSync(marcador, 'utf8').split('\n').filter(Boolean).sort();
}

test('roda todas as provas team-*.test.sh e sai 0 quando todas passam', () => {
  const marcador = caminhoMarcador();
  const repo = montarArvore({
    provas: {
      'team-alfa.test.sh': provaOk('alfa'),
      'team-beta.test.sh': provaOk('beta'),
    },
  });
  try {
    const r = rodarGate(repo, { MARCADOR: marcador });

    assert.equal(r.status, 0, `esperava exit 0, veio ${r.status}: ${r.saida}`);
    assert.match(r.saida, /Provas de banco do chat interno: 2/);
    assert.match(r.saida, /\[PASSOU\] team-alfa\.test\.sh/);
    assert.match(r.saida, /\[PASSOU\] team-beta\.test\.sh/);
    // Execução medida, não só listagem: as duas provas rodaram de verdade.
    assert.deepEqual(executadas(marcador), ['alfa', 'beta']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('sai 1 quando qualquer prova falha, nomeia a que falhou e roda as demais', () => {
  const marcador = caminhoMarcador();
  const repo = montarArvore({
    provas: {
      'team-era.test.sh': provaQuebrada('era'),
      'team-omega.test.sh': provaOk('omega'),
    },
  });
  try {
    const r = rodarGate(repo, { MARCADOR: marcador });

    assert.equal(r.status, 1, `esperava exit 1, veio ${r.status}: ${r.saida}`);
    assert.match(r.saida, /\[FALHOU\] team-era\.test\.sh \(exit 1\)/);
    assert.match(r.saida, /RESULTADO: 1 de 2 prova\(s\) de banco do chat interno FALHARAM/);
    // `era` falha e `omega` roda mesmo assim: o comando confere o conjunto todo.
    assert.deepEqual(executadas(marcador), ['era', 'omega']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('sem nenhuma prova encontrada é falha (fail-closed), mesmo com nomes parecidos', () => {
  const marcador = caminhoMarcador();
  const repo = montarArvore({
    extras: [
      { caminho: 'scripts/db-audit/team-anotacoes.sh', corpo: provaOk('anotacoes') },
      { caminho: 'scripts/db-audit/team-chat-rls.sql', corpo: '-- nao e prova\n' },
      { caminho: 'scripts/db-audit/team-x.test.sh.bak', corpo: provaOk('bak') },
    ],
  });
  try {
    const r = rodarGate(repo, { MARCADOR: marcador });

    assert.equal(r.status, 1, `esperava exit 1, veio ${r.status}: ${r.saida}`);
    assert.match(r.saida, /nenhuma prova de banco do chat interno/);
    // Nenhum nome parecido foi executado: o glob não é mais largo que team-*.test.sh.
    assert.deepEqual(executadas(marcador), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('o glob ancora em team-*.test.sh: diretório homônimo não é contado nem executado', () => {
  const marcador = caminhoMarcador();
  const repo = montarArvore({
    provas: { 'team-ok.test.sh': provaOk('ok') },
    extras: [{ caminho: 'scripts/db-audit/team-sub.test.sh', diretorio: true }],
  });
  try {
    const r = rodarGate(repo, { MARCADOR: marcador });

    // Sem o guard `-f` o diretório entraria como prova e `bash <diretorio>` faria
    // o comando sair 1 por motivo alheio ao módulo.
    assert.equal(r.status, 0, `esperava exit 0, veio ${r.status}: ${r.saida}`);
    assert.match(r.saida, /Provas de banco do chat interno: 1/);
    assert.doesNotMatch(r.saida, /team-sub/);
    assert.deepEqual(executadas(marcador), ['ok']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('usa o scripts/db-audit do próprio script, e TEAM_CHAT_GATES_DIR troca o diretório', () => {
  const marcador = caminhoMarcador();
  const repo = montarArvore({
    provas: { 'team-ok.test.sh': provaOk('ok') },
    extras: [
      { caminho: 'scripts/db-audit-outro/team-decoy.test.sh', corpo: provaQuebrada('decoy') },
      { caminho: 'provas-externas/team-externa.test.sh', corpo: provaOk('externa') },
    ],
  });
  try {
    const padrao = rodarGate(repo, { MARCADOR: marcador });

    assert.equal(padrao.status, 0, `esperava exit 0, veio ${padrao.status}: ${padrao.saida}`);
    assert.deepEqual(executadas(marcador), ['ok']); // o decoy de outro diretório não entra
    assert.doesNotMatch(padrao.saida, /decoy/);

    // O diretório das provas vem do ambiente (usado pelo teste), não de constante
    // escondida: com o override, o conjunto é o de lá.
    writeFileSync(marcador, '');
    const trocado = rodarGate(repo, {
      MARCADOR: marcador,
      TEAM_CHAT_GATES_DIR: join(repo, 'provas-externas'),
    });

    assert.equal(trocado.status, 0, `esperava exit 0, veio ${trocado.status}: ${trocado.saida}`);
    assert.match(trocado.saida, /\[PASSOU\] team-externa\.test\.sh/);
    assert.deepEqual(executadas(marcador), ['externa']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
