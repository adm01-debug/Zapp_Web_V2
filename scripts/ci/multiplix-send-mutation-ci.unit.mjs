// N-017 (09/10/2026): o runner de mutação do worker do Multiplix
// (scripts/db-audit/multiplix-send-mutation.py) existia no disco e nunca rodava no
// CI — a prova de que os testes do envio pegam erro de verdade dependia de alguém
// rodar à mão. O passo passou a viver no db-guard.yml; este caso trava as três
// regressões que fariam a prova voltar a não valer nada: o passo sumir, o runner ser
// renomeado sem atualizar o workflow, e o passo virar informativo
// (`continue-on-error: true`, como o `mutation-mapa` do ci.yml — lá é de propósito,
// aqui um mutante sobrevivente TEM de derrubar o check).
//
// Por que parsear o YAML em vez de `toContain(caminho)`: uma linha COMENTADA que cite
// o runner (passo desligado, texto de ajuda) passaria por `includes` sem executar
// nada. Aqui o caminho só conta dentro de um bloco `run:` de verdade, e comentário
// dentro do bloco não conta.
//
// Espelha os invariantes de workflow que já vivem em scripts/ci (E97/E98,
// workflow-contracts.unit.mjs) e o parser de blocos `run:`:
// `scripts/ci/check-test-inventory.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_GUARD = join(RAIZ, '.github', 'workflows', 'db-guard.yml');

/** Caminho do runner de mutação, relativo à raiz do repositório. */
export const RUNNER = 'scripts/db-audit/multiplix-send-mutation.py';

/** Passos de um job: cada item começa em `      - ` (6 espaços), igual a `steps:`. */
export function passos(texto) {
  const blocos = [];
  let atual = null;
  for (const linha of texto.split('\n')) {
    if (/^ {6}- /.test(linha)) {
      if (atual) blocos.push(atual.join('\n'));
      atual = [linha];
    } else if (atual) {
      atual.push(linha);
    }
  }
  if (atual) blocos.push(atual.join('\n'));
  return blocos;
}

/** Linhas que o passo REALMENTE executa (blocos `run:` / `run:` de uma linha). */
export function comandos(passo) {
  const linhas = passo.split('\n');
  const saida = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const abertura = /^(\s*)-?\s*run:\s*(.*)$/.exec(linhas[i]);
    if (!abertura) continue;
    const valor = abertura[2].trim();
    if (!valor.startsWith('|') && !valor.startsWith('>')) {
      saida.push(valor);
      continue;
    }
    const recuo = abertura[1].length;
    for (let j = i + 1; j < linhas.length; j += 1) {
      const linha = linhas[j];
      if (linha.trim() === '') continue;
      if (linha.length - linha.trimStart().length <= recuo) break;
      if (linha.trimStart().startsWith('#')) continue; // passo comentado não executa
      saida.push(linha.trim());
    }
  }
  return saida;
}

/** Violações do contrato do passo de mutação do Multiplix no db-guard.yml. */
export function violacoes(texto) {
  const out = [];
  const passosDoWorkflow = passos(texto);
  if (passosDoWorkflow.length === 0) return ['não achei nenhum passo no workflow (parser quebrado?)'];

  const doRunner = passosDoWorkflow.filter((p) =>
    comandos(p).some((c) => c.includes(RUNNER)),
  );

  if (doRunner.length === 0) {
    out.push(
      `nenhum bloco 'run:' executa ${RUNNER} — o runner de mutação voltou a rodar só à mão`,
    );
    return out;
  }

  for (const passo of doRunner) {
    if (/^\s*continue-on-error:\s*true\s*$/m.test(passo)) {
      out.push(
        `o passo que roda ${RUNNER} está com continue-on-error: true — mutante sobrevivente `
          + 'deixaria o check verde (aqui isso é o defeito, não a exceção)',
      );
    }
  }
  return out;
}

test('N-017: o db-guard.yml executa o runner de mutação do Multiplix num passo que pode falhar', () => {
  const texto = readFileSync(DB_GUARD, 'utf8');
  assert.deepEqual(violacoes(texto), []);
  assert.ok(
    existsSync(join(RAIZ, RUNNER)),
    `o workflow aponta para ${RUNNER}, que não existe no repositório`,
  );
});

test('N-017: workflow sem o passo de mutação é reprovado (caso NEGATIVO)', () => {
  const semPasso = [
    'jobs:',
    '  offline-contract:',
    '    steps:',
    '      - name: Simular contrato de acesso e fila do Multiplix',
    '        run: bash scripts/db-audit/multiplix-rls.test.sh',
    '',
  ].join('\n');
  assert.equal(violacoes(semPasso).length, 1);
});

test('N-017: passo informativo (continue-on-error) é reprovado (caso NEGATIVO)', () => {
  const informativo = [
    'jobs:',
    '  offline-contract:',
    '    steps:',
    '      - name: Provar por mutação os testes do worker do Multiplix (N-017)',
    '        continue-on-error: true',
    `        run: python3 ${RUNNER}`,
    '',
  ].join('\n');
  const v = violacoes(informativo);
  assert.equal(v.length, 1);
  assert.match(v[0], /continue-on-error/);
});

test('N-017: caminho do runner só em comentário não conta como passo (caso adversário)', () => {
  const comentado = [
    'jobs:',
    '  offline-contract:',
    '    steps:',
    '      - name: Simular estados e audiencia canônicos do Talk X',
    '        run: bash scripts/db-audit/talkx-campaign-state-transitions.test.sh',
    '        # desligado por enquanto:',
    `        # run: python3 ${RUNNER}`,
    '',
  ].join('\n');
  assert.equal(violacoes(comentado).length, 1);
});
