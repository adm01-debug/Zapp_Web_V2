import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  avaliarExpressao,
  avaliarCondicao,
  interpolar,
  expandirMatriz,
  ordenarJobs,
  lerArquivoEnv,
  comandoShell,
  separarOpcoesDocker,
  arquivosParaVitestRelated,
  ExpressaoNaoSuportada,
  ambienteIsolado,
  planoHomeIsolado,
  avaliarBooleano,
  avaliarMinutos,
  usaFuncaoStatus,
  comandosComSudo,
  mascarar,
  arquivosDoDiffZ,
  portaLocal,
  paraNumero,
} from './ci-local-lib.mjs';

const ctx = {
  env: { POSTGRES_TEST_IMAGE: 'postgres:17', VAZIO: '' },
  matrix: { shard: 2 },
  secrets: { VITE_SUPABASE_URL: 'https://x.supabase.co' },
  github: {
    event_name: 'pull_request',
    event: { pull_request: { draft: false, base: { sha: 'abc123' } } },
  },
  needs: { build: { result: 'success' }, typecheck: { result: 'failure' } },
  steps: { relatorio: { outcome: 'success', outputs: { total: '3' } } },
};

test('interpola matrix, env, secrets e github no texto', () => {
  const r = interpolar(
    'bun vitest run --shard=${{ matrix.shard }}/3 base=${{ github.event.pull_request.base.sha }} img=${{ env.POSTGRES_TEST_IMAGE }} url=${{secrets.VITE_SUPABASE_URL}}',
    ctx
  );
  assert.equal(
    r.texto,
    'bun vitest run --shard=2/3 base=abc123 img=postgres:17 url=https://x.supabase.co'
  );
  assert.deepEqual(r.faltando, []);
});

test('referência sem valor vira vazio e é reportada', () => {
  const r = interpolar('token=${{ secrets.NAO_EXISTE }}!', ctx);
  assert.equal(r.texto, 'token=!');
  assert.deepEqual(r.faltando, ['secrets.NAO_EXISTE']);
});

test('comparações, negação e operadores lógicos como no Actions', () => {
  assert.equal(avaliarExpressao("github.event_name == 'pull_request'", ctx), true);
  assert.equal(avaliarExpressao("github.event_name != 'push'", ctx), true);
  assert.equal(avaliarExpressao('github.event.pull_request.draft != true', ctx), true);
  assert.equal(
    avaliarExpressao("needs.typecheck.result == 'success' || needs.build.result == 'success'", ctx),
    true
  );
  assert.equal(avaliarExpressao("!(needs.typecheck.result == 'success')", ctx), true);
  assert.equal(avaliarExpressao("steps.relatorio.outcome == 'success' && env.VAZIO", ctx), '');
  assert.equal(
    avaliarExpressao("'Pull_Request' == github.event_name", ctx),
    true,
    'comparação de string ignora caixa'
  );
});

test('funções de status seguem o estado do job', () => {
  assert.equal(avaliarCondicao('${{ always() }}', { ...ctx, estadoJob: 'failure' }), true);
  assert.equal(avaliarCondicao('failure()', { ...ctx, estadoJob: 'failure' }), true);
  assert.equal(avaliarCondicao('success()', { ...ctx, estadoJob: 'failure' }), false);
  assert.equal(
    avaliarCondicao("${{ !cancelled() && steps.relatorio.outcome == 'success' }}", ctx),
    true
  );
});

test('if ausente é verdadeiro; if de job draft é falso', () => {
  assert.equal(avaliarCondicao(undefined, ctx), true);
  assert.equal(avaliarCondicao('github.event.pull_request.draft == true', ctx), false);
});

test('função desconhecida não é inventada: lança ExpressaoNaoSuportada', () => {
  assert.throws(() => avaliarExpressao("hashFiles('bun.lock')", ctx), ExpressaoNaoSuportada);
  assert.throws(() => avaliarExpressao('contexto_inventado.x', ctx), ExpressaoNaoSuportada);
  assert.throws(() => avaliarCondicao("hashFiles('x') != ''", ctx), ExpressaoNaoSuportada);
});

// Exemplos da documentação oficial (Expressions → Operators / Functions).
test('coerção de tipos conforme a especificação (== entre tipos diferentes vira número)', () => {
  const casos = [
    ["true == 'true'", false],
    ['true == 1', true],
    ['null == 0', true],
    ["'' == 0", true],
    ["'' == false", true],
    ["'1' == 1", true],
    ["'0x10' == 16", true],
    ['1.5e2 == 150', true],
    ["'abc' == 'ABC'", true],
    ['NaN == NaN', false],
    ["'a' != 'A'", false],
    ['1 < 2', true],
    ["'a' < 'B'", true],
    ["'2' >= 10", false],
    ["'x' < 1", false],
    ['!0', true],
    ["!''", true],
  ];
  for (const [e, esperado] of casos) assert.equal(avaliarExpressao(e, ctx), esperado, e);
  assert.equal(avaliarExpressao("inputs.flag == 'true'", { inputs: { flag: true } }), false);
  assert.equal(paraNumero(' 12 '), 12);
  assert.ok(Number.isNaN(paraNumero('abc')));
});

test('funções puras da documentação: contains, startsWith, endsWith, format, join, toJSON, fromJSON', () => {
  const c = { github: { event: { issue: { labels: [{ name: 'bug' }, { name: 'Docs' }] } } } };
  assert.equal(avaliarExpressao("contains('Hello world', 'llo')", c), true);
  assert.equal(avaliarExpressao("contains(github.event.issue.labels.*.name, 'docs')", c), true);
  assert.equal(
    avaliarExpressao('contains(fromJSON(\'["push", "pull_request"]\'), \'push\')', c),
    true
  );
  assert.equal(avaliarExpressao("startsWith('Hello world', 'he')", c), true);
  assert.equal(avaliarExpressao("endsWith('Hello world', 'ld')", c), true);
  assert.equal(
    avaliarExpressao("format('Hello {0} {1} {2}', 'Mona', 'the', 'Octocat')", c),
    'Hello Mona the Octocat'
  );
  assert.equal(
    avaliarExpressao("format('{{Hello {0} {1} {2}!}}', 'Mona', 'the', 'Octocat')", c),
    '{Hello Mona the Octocat!}'
  );
  assert.equal(avaliarExpressao("join(github.event.issue.labels.*.name, ', ')", c), 'bug, Docs');
  assert.equal(avaliarExpressao('fromJSON(\'{"a": 3}\').a', c), 3);
  assert.equal(avaliarExpressao('github.event.issue.labels[1].name', c), 'Docs');
});

test('status implícito: if sem função de status vale success() && (if)', () => {
  const falhou = { ...ctx, status: { success: false, failure: true } };
  assert.equal(usaFuncaoStatus('!cancelled()'), true);
  assert.equal(usaFuncaoStatus("github.event_name == 'cancelled'"), false);
  assert.equal(avaliarCondicao("github.event_name == 'pull_request'", falhou), false);
  assert.equal(avaliarCondicao('${{ !cancelled() }}', falhou), true);
  assert.equal(avaliarCondicao(undefined, falhou), false);
  assert.equal(avaliarCondicao('true', falhou), false);
  assert.equal(avaliarCondicao("failure() && contains(github.event_name, 'pull')", ctx), false);
});

test('continue-on-error e timeout-minutes avaliam expressão (a string false é falsa)', () => {
  assert.equal(avaliarBooleano('${{ matrix.exp }}', { matrix: { exp: false } }), false);
  assert.equal(avaliarBooleano('${{ matrix.exp }}', { matrix: { exp: 'false' } }), false);
  assert.equal(avaliarBooleano(true, {}), true);
  assert.equal(avaliarBooleano(undefined, {}), false);
  assert.equal(avaliarMinutos('${{ matrix.t }}', { matrix: { t: 75 } }), 75);
  assert.equal(avaliarMinutos(undefined, {}), undefined);
  assert.throws(() => avaliarMinutos('${{ matrix.nada }}', { matrix: {} }), ExpressaoNaoSuportada);
});

test('matriz: produto cartesiano, exclude e include', () => {
  assert.deepEqual(expandirMatriz({ strategy: { matrix: { shard: [1, 2, 3] } } }), [
    { shard: 1 },
    { shard: 2 },
    { shard: 3 },
  ]);
  const m = expandirMatriz({
    strategy: {
      matrix: {
        node: ['20', '22'],
        bun: ['1', 'latest'],
        exclude: [{ node: '20', bun: 'latest' }],
        include: [{ node: '22', bun: 'latest', primary: true }],
      },
    },
  });
  assert.equal(m.length, 3);
  assert.ok(m.some((c) => c.node === '22' && c.bun === 'latest' && c.primary === true));
  assert.deepEqual(expandirMatriz({}), [{}]);
});

test('matriz: exemplo fruit/animal da documentação oficial dá 6 combinações', () => {
  const m = expandirMatriz({
    strategy: {
      matrix: {
        fruit: ['apple', 'pear'],
        animal: ['cat', 'dog'],
        include: [
          { color: 'green' },
          { color: 'pink', animal: 'cat' },
          { fruit: 'apple', shape: 'circle' },
          { fruit: 'banana' },
          { fruit: 'banana', animal: 'cat' },
        ],
      },
    },
  });
  assert.deepEqual(m, [
    { fruit: 'apple', animal: 'cat', color: 'pink', shape: 'circle' },
    { fruit: 'apple', animal: 'dog', color: 'green', shape: 'circle' },
    { fruit: 'pear', animal: 'cat', color: 'pink' },
    { fruit: 'pear', animal: 'dog', color: 'green' },
    { fruit: 'banana' },
    { fruit: 'banana', animal: 'cat' },
  ]);
});

test('matriz: include só com chaves novas anexa em todas; só include não cria {} extra', () => {
  assert.deepEqual(
    expandirMatriz({ strategy: { matrix: { os: ['l', 'w'], include: [{ color: 'g' }] } } }),
    [
      { os: 'l', color: 'g' },
      { os: 'w', color: 'g' },
    ]
  );
  assert.deepEqual(
    expandirMatriz({ strategy: { matrix: { include: [{ site: 'a' }, { site: 'b' }] } } }),
    [{ site: 'a' }, { site: 'b' }]
  );
  // exemplo "Expanding or adding matrix configurations" da documentação
  const m = expandirMatriz({
    strategy: {
      matrix: {
        os: ['windows-latest', 'ubuntu-latest'],
        node: [14, 16],
        include: [{ os: 'windows-latest', node: 16, npm: 6 }],
      },
    },
  });
  assert.equal(m.length, 4);
  assert.deepEqual(
    m.filter((c) => c.npm === 6),
    [{ os: 'windows-latest', node: 16, npm: 6 }]
  );
  assert.throws(
    () => expandirMatriz({ strategy: { matrix: '${{ fromJSON(needs.x.outputs.m) }}' } }, {}),
    /JSON|mapa/
  );
});

test('ordena jobs pelas dependências (needs)', () => {
  const ordem = ordenarJobs({
    gate: { needs: ['build', 'test'] },
    test: {},
    build: { needs: 'test' },
  });
  assert.ok(ordem.indexOf('test') < ordem.indexOf('build'));
  assert.ok(ordem.indexOf('build') < ordem.indexOf('gate'));
  assert.throws(() => ordenarJobs({ a: { needs: 'b' }, b: { needs: 'a' } }), /ciclo/);
});

test('lê GITHUB_ENV com KEY=VAL e heredoc', () => {
  assert.deepEqual(lerArquivoEnv('A=1\nB=x=y\nC<<EOF\nlinha 1\nlinha 2\nEOF\n'), {
    A: '1',
    B: 'x=y',
    C: 'linha 1\nlinha 2',
  });
  assert.throws(() => lerArquivoEnv('C<<EOF\nsem fim\n'), /não foi fechado/);
});

test('shell padrão igual ao runner Linux do GitHub', () => {
  assert.deepEqual(comandoShell(undefined), ['bash', ['-e', '{0}']]);
  assert.deepEqual(comandoShell('bash'), [
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', '{0}'],
  ]);
  assert.deepEqual(comandoShell('bash --noprofile --norc -euo pipefail {0}'), [
    'bash',
    ['--noprofile', '--norc', '-euo', 'pipefail', '{0}'],
  ]);
  assert.deepEqual(comandoShell('python'), ['python3', ['{0}']]);
});

test('options de service respeitam aspas', () => {
  assert.deepEqual(
    separarOpcoesDocker('--health-cmd "pg_isready -U postgres" --health-interval 5s'),
    ['--health-cmd', 'pg_isready -U postgres', '--health-interval', '5s']
  );
});

test('git diff -z: nomes com espaço, aspas e acento chegam intactos', () => {
  assert.deepEqual(arquivosDoDiffZ("src/a b.ts\0src/x'$(id)'.ts\0src/ação.ts\0"), [
    'src/a b.ts',
    "src/x'$(id)'.ts",
    'src/ação.ts',
  ]);
  assert.deepEqual(arquivosParaVitestRelated(['src/ação.ts', 'src/ação.ts', 'a.md']), [
    'src/ação.ts',
  ]);
});

test('sudo/apt é detectado (comentário e palavra parecida não)', () => {
  assert.deepEqual(
    comandosComSudo(
      'echo a\nsudo apt-get update -qq && x\n# sudo nada\nlaptop install\napt install y'
    ),
    ['sudo apt-get update -qq && x', 'apt install y']
  );
});

test('segredos mascarados e portas de service só em 127.0.0.1', () => {
  assert.equal(mascarar('token=abc123 e abc123', ['abc123', '', 'x']), 'token=*** e ***');
  assert.equal(portaLocal('5432:5432'), '127.0.0.1:5432:5432');
  assert.equal(portaLocal(6379), '127.0.0.1::6379');
  assert.equal(portaLocal('0.0.0.0:80:80'), '0.0.0.0:80:80');
});

test('modo rápido: só código de front/scripts (edge functions têm job próprio)', () => {
  assert.deepEqual(
    arquivosParaVitestRelated(
      'src/a.tsx\nsrc/b.ts\nREADME.md\nsupabase/functions/x/index.ts\nscripts/y.mjs\n'
    ),
    ['src/a.tsx', 'src/b.ts', 'scripts/y.mjs']
  );
});

test('todas as condições dos workflows padrão são avaliáveis (nada é rodado no escuro)', () => {
  for (const wf of ['ci', 'db-guard']) {
    const doc = parseYaml(
      readFileSync(new URL(`../../.github/workflows/${wf}.yml`, import.meta.url), 'utf8')
    );
    for (const [jobId, job] of Object.entries(doc.jobs)) {
      const conds = [job.if, ...(job.steps ?? []).map((s) => s.if)].filter((c) => c !== undefined);
      for (const c of conds) {
        assert.doesNotThrow(
          () => avaliarCondicao(c, { ...ctx, estadoJob: 'success' }),
          `${wf}/${jobId}: if não suportado: ${c}`
        );
      }
    }
  }
});

test('cada job roda com HOME descartável: nada do workflow escreve no HOME real', () => {
  const env = ambienteIsolado(
    '/tmp/ci-local-home-x',
    { HOME: '/home/fulano', PATH: '/usr/bin:/home/fulano/.local/bin' },
    () => true,
    { pythonUserSite: '/home/fulano/.local/lib/python3.12/site-packages', tmpdir: '/tmp/run/tmp' }
  );
  assert.equal(env.HOME, '/tmp/ci-local-home-x');
  // ~/.local/bin do HOME descartável vem antes de tudo: um `cp x "$HOME/.local/bin/docker"`
  // (docker-shim do db-guard) fica preso ao job e não troca o docker da máquina.
  assert.ok(env.PATH.startsWith('/tmp/ci-local-home-x/.local/bin:'));
  assert.ok(!env.PATH.split(':')[0].startsWith('/home/fulano'));
  // caches continuam os reais; configurações graváveis são CÓPIAS dentro do HOME do job
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, '/home/fulano/.cache/ms-playwright');
  assert.equal(env.GIT_CONFIG_GLOBAL, '/tmp/ci-local-home-x/.gitconfig');
  assert.equal(env.GH_CONFIG_DIR, '/tmp/ci-local-home-x/.config/gh');
  assert.equal(env.DOCKER_CONFIG, '/tmp/ci-local-home-x/.docker');
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/ci-local-home-x/.config');
  // pip do usuário visível só para leitura; instalação vai para o HOME do job
  assert.equal(env.PYTHONPATH, '/home/fulano/.local/lib/python3.12/site-packages');
  assert.equal(env.PYTHONUSERBASE, '/tmp/ci-local-home-x/.local');
  assert.equal(env.TMPDIR, '/tmp/run/tmp');
  const { copias } = planoHomeIsolado('/tmp/h', { HOME: '/home/fulano' }, () => true);
  assert.deepEqual(
    copias.map((c) => [c.origem, c.destino]),
    [
      ['/home/fulano/.gitconfig', '/tmp/h/.gitconfig'],
      ['/home/fulano/.config/gh', '/tmp/h/.config/gh'],
      ['/home/fulano/.docker', '/tmp/h/.docker'],
    ]
  );
});

test('todas as interpolações de run/env dos workflows padrão são avaliáveis', () => {
  for (const wf of ['ci', 'db-guard']) {
    const doc = parseYaml(
      readFileSync(new URL(`../../.github/workflows/${wf}.yml`, import.meta.url), 'utf8')
    );
    for (const [jobId, job] of Object.entries(doc.jobs)) {
      const textos = [
        ...Object.values({ ...(doc.env ?? {}), ...(job.env ?? {}) }),
        ...(job.steps ?? [])
          .filter((s) => s.run)
          .flatMap((s) => [s.run, ...Object.values(s.env ?? {})]),
      ];
      for (const t of textos) {
        const r = interpolar(t, { ...ctx, estadoJob: 'success' });
        assert.deepEqual(r.erros, [], `${wf}/${jobId}: ${String(t).slice(0, 80)}`);
      }
    }
  }
});

test('isolamento não inventa caminho de cache inexistente', () => {
  const env = ambienteIsolado('/tmp/h', { HOME: '/home/fulano', PATH: '/usr/bin' }, () => false);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, undefined);
  assert.equal(env.HOME, '/tmp/h');
});
