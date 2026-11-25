import test from 'node:test';
import assert from 'node:assert/strict';
import { ESPERA_MS, MARCADOR_TRANSITORIO, coletarPins, commitDaTag, falhaTransitoria, lsRemoteComRetry, verificarPins } from './check-workflow-pins-resolvem.mjs';

const REAL = 'f49aabe0b5af0936a0987cfb85d86b75731b0186';
const INVENTADO = 'f49aabe0b5af0936a0987cfb85d86b75b3f07db4'; // o pin do scorecard.yml até 15/10/2026
const TAG_OBJ = 'ea651e62978af7915d09fe2e282747c798bf2dab';
const LS_ANOTADA = `${TAG_OBJ}\trefs/tags/v2.4.1\n${REAL}\trefs/tags/v2.4.1^{}\n`;

test('coleta pins únicos, com subcaminho de Action e o arquivo de origem', () => {
  const pins = coletarPins([
    ['a.yml', `      - uses: github/codeql-action/init@${REAL} # v4.38.3\n      - uses: github/codeql-action/analyze@${REAL} # v4.38.3`],
    ['b.yml', `        uses: ossf/scorecard-action@${INVENTADO} # v2.4.1`],
    ['c.yml', `        uses: actions/checkout@${REAL}`],
  ]);
  assert.equal(pins.length, 3);
  assert.deepEqual(pins.map((p) => [p.repo, p.tag]), [['github/codeql-action', 'v4.38.3'], ['ossf/scorecard-action', 'v2.4.1'], ['actions/checkout', null]]);
});

test('commit da tag: anotada usa o ^{}; leve usa o próprio ref', () => {
  assert.equal(commitDaTag(LS_ANOTADA, 'v2.4.1'), REAL);
  assert.equal(commitDaTag(`${REAL}\trefs/tags/v1.0.0\n`, 'v1.0.0'), REAL);
  assert.equal(commitDaTag('', 'v9.9.9'), null);
});

test('reprova o pin inventado do scorecard (32 caracteres certos, 8 inventados)', async () => {
  const problemas = await verificarPins(
    [{ repo: 'ossf/scorecard-action', sha: INVENTADO, tag: 'v2.4.1', arquivos: new Set(['scorecard.yml']) }],
    async () => LS_ANOTADA,
  );
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /≠ commit real da tag f49aabe0b5af0936a0987cfb85d86b75731b0186/);
});

test('aprova o pin real; reprova tag inexistente, pin sem comentário e falha de consulta', async () => {
  const ok = await verificarPins([{ repo: 'ossf/scorecard-action', sha: REAL, tag: 'v2.4.1', arquivos: new Set(['x.yml']) }], async () => LS_ANOTADA);
  assert.deepEqual(ok, []);
  const ruins = await verificarPins([
    { repo: 'o/r', sha: REAL, tag: 'v0.0.0-nao-existe', arquivos: new Set(['x.yml']) },
    { repo: 'o/r', sha: REAL, tag: null, arquivos: new Set(['y.yml']) },
    { repo: 'o/falha', sha: REAL, tag: 'v1', arquivos: new Set(['z.yml']) },
  ], async (repo) => {
    if (repo === 'o/falha') throw new Error('rede');
    return '';
  });
  assert.equal(ruins.length, 3);
  assert.match(ruins[0], /a tag não existe/);
  assert.match(ruins[1], /pin sem comentário/);
  assert.match(ruins[2], /não foi possível consultar/);
});

// O runner respondeu 403 no `git ls-remote` da PR #3376 e o job passou no rerun sem
// nenhuma mudança de código: aquilo era limite de IP, não pin errado.
const ERRO_403 = { stderr: "fatal: unable to access 'https://github.com/actions/checkout/': The requested URL returned error: 403" };

test('403/429/5xx e falha de rede contam como transitórias; repositório ou tag inexistente não', () => {
  for (const mensagem of [
    "fatal: unable to access 'https://github.com/actions/checkout/': The requested URL returned error: 403",
    "fatal: unable to access 'https://github.com/actions/checkout/': The requested URL returned error: 429",
    "fatal: unable to access 'https://github.com/actions/checkout/': The requested URL returned error: 503",
    'fatal: unable to access https://github.com/x/y: Could not resolve host: github.com',
    'fatal: the remote end hung up unexpectedly',
  ]) assert.equal(falhaTransitoria(mensagem), true, mensagem);

  assert.equal(falhaTransitoria("fatal: repository 'https://github.com/o/nao-existe/' not found"), false);
  assert.equal(falhaTransitoria('fatal: couldn\'t find remote ref refs/tags/v9.9.9'), false);
});

test('transitória repete com backoff e devolve a saída quando a rede volta', async () => {
  let execucoes = 0;
  const esperas = [];
  const saida = await lsRemoteComRetry('actions/checkout', 'v7.0.1', {
    executar: () => {
      execucoes += 1;
      if (execucoes <= 2) throw Object.assign(new Error('git'), ERRO_403);
      return LS_ANOTADA;
    },
    dormir: async (ms) => { esperas.push(ms); },
  });
  assert.equal(saida, LS_ANOTADA);
  assert.equal(execucoes, 3);
  assert.deepEqual(esperas, ESPERA_MS.slice(0, 2));
});

test('sem insistência disponível o 403 sai marcado como limite do runner, não como pin errado', async () => {
  let execucoes = 0;
  const esperas = [];
  await assert.rejects(
    () => lsRemoteComRetry('actions/checkout', 'v7.0.1', {
      executar: () => { execucoes += 1; throw Object.assign(new Error('git'), ERRO_403); },
      dormir: async (ms) => { esperas.push(ms); },
      orcamento: { restantes: 0 },
    }),
    (erro) => erro.transitorio === true && /403/.test(erro.message),
  );
  assert.equal(execucoes, 1);
  assert.deepEqual(esperas, []);

  const problemas = await verificarPins(
    [{ repo: 'actions/checkout', sha: REAL, tag: 'v7.0.1', arquivos: new Set(['ci.yml']) }],
    () => lsRemoteComRetry('actions/checkout', 'v7.0.1', { executar: () => { throw Object.assign(new Error('git'), ERRO_403); }, dormir: async () => {}, orcamento: { restantes: 0 } }),
  );
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], new RegExp(MARCADOR_TRANSITORIO));
});

test('erro definitivo (repositório inexistente) não espera nem repete', async () => {
  let execucoes = 0;
  const esperas = [];
  await assert.rejects(
    () => lsRemoteComRetry('o/nao-existe', 'v1', {
      executar: () => { execucoes += 1; throw Object.assign(new Error('git'), { stderr: "fatal: repository 'https://github.com/o/nao-existe/' not found" }); },
      dormir: async (ms) => { esperas.push(ms); },
    }),
    (erro) => erro.transitorio === false && /not found/.test(erro.message),
  );
  assert.equal(execucoes, 1);
  assert.deepEqual(esperas, []);
});
