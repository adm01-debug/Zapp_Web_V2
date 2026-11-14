import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  COMANDOS_ROOT,
  shimsDeRoot,
  MSG_SHIM_ROOT,
  ambientePermitido,
  configDockerSemCredenciais,
  GITCONFIG_SEM_CREDENCIAL,
  gatilhosDoWorkflow,
  temGatilhoPullRequest,
  semTestesRelacionados,
  encerrarEscalonado,
  inicioDoProcesso,
  donoVivo,
  lerListaContainers,
  shimDocker,
  containersOrfaos,
  lerDiffRawZ,
  migrationsEditadas,
  checarMigrationsEditadas,
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

// ---------------------------------------------------- achado 1: root/sudo
test('requer root: playwright --with-deps/install-deps, caminho absoluto, su/doas/pkexec', () => {
  assert.deepEqual(
    comandosComSudo(
      [
        'bunx playwright@1.64.1 install --with-deps chromium firefox webkit',
        'bunx playwright install-deps chromium',
        'npx playwright install chromium',
        '/usr/bin/sudo -n true',
        'doas ls',
        'su - root -c x',
        'x=1; pkexec y',
        'ls /var/cache/apt',
        'echo sudoers',
        'dpkg -l',
      ].join('\n')
    ),
    [
      'bunx playwright@1.64.1 install --with-deps chromium firefox webkit',
      'bunx playwright install-deps chromium',
      '/usr/bin/sudo -n true',
      'doas ls',
      'su - root -c x',
      'x=1; pkexec y',
      'dpkg -l',
    ]
  );
});

test('job e2e do ci.yml: os dois passos de dependências do Playwright são marcados como root', () => {
  const doc = parseYaml(
    readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  );
  const marcados = doc.jobs.e2e.steps
    .filter((s) => s.run && /playwright/.test(s.run) && /with-deps|install-deps/.test(s.run))
    .map((s) => comandosComSudo(s.run).length);
  assert.ok(marcados.length >= 2, 'o e2e deixou de instalar dependências? revise o teste');
  assert.ok(marcados.every((n) => n > 0));
});

test('shims de root: um por comando, saem com erro e dizem por quê', () => {
  const shims = shimsDeRoot();
  assert.deepEqual(Object.keys(shims).sort(), [...COMANDOS_ROOT].sort());
  for (const nome of ['sudo', 'apt', 'apt-get', 'dpkg', 'su', 'doas', 'pkexec']) {
    assert.match(shims[nome], /^#!\/bin\/sh\n/);
    assert.match(shims[nome], /exit 1\n$/);
    assert.ok(shims[nome].includes(MSG_SHIM_ROOT));
  }
  assert.equal(MSG_SHIM_ROOT, 'requer root — só no GitHub');
});

// ------------------------------------------------- achado 2: credenciais
test('HOME do job: hosts.yml do gh e credenciais do docker/git só com --com-credenciais', () => {
  const sem = planoHomeIsolado('/tmp/h', { HOME: '/home/fulano' }, () => true);
  const porDestino = Object.fromEntries(sem.copias.map((c) => [c.destino, c]));
  assert.deepEqual(porDestino['/tmp/h/.config/gh'].excluir, ['hosts.yml']);
  assert.equal(porDestino['/tmp/h/.docker'].semCredencialDocker, true);
  assert.equal(porDestino['/tmp/h/.gitconfig'].semCredencialGit, true);
  const com = planoHomeIsolado('/tmp/h', { HOME: '/home/fulano' }, () => true, {
    comCredenciais: true,
  });
  for (const c of com.copias) {
    assert.equal(c.excluir, undefined);
    assert.equal(c.semCredencialDocker, undefined);
    assert.equal(c.semCredencialGit, undefined);
  }
  assert.match(GITCONFIG_SEM_CREDENCIAL, /\[credential\]\n\thelper =\n/);
  assert.deepEqual(
    JSON.parse(
      configDockerSemCredenciais(
        JSON.stringify({
          auths: { 'ghcr.io': { auth: 'eDp5' } },
          credsStore: 'desktop.exe',
          credHelpers: { x: 'y' },
          currentContext: 'default',
        })
      )
    ),
    { currentContext: 'default' }
  );
  assert.equal(configDockerSemCredenciais('não é json'), '{}\n');
});

test('ambiente do passo é lista permitida: token e chaves do terminal não passam', () => {
  const env = ambientePermitido({
    PATH: '/usr/bin',
    LANG: 'pt_BR.UTF-8',
    LC_ALL: 'C',
    TERM: 'xterm',
    TZ: 'America/Sao_Paulo',
    GH_TOKEN: 'ghp_x',
    GITHUB_TOKEN: 'ghs_x',
    OPENROUTER_API_KEY: 'sk-x',
    AWS_SECRET_ACCESS_KEY: 'x',
    SSH_AUTH_SOCK: '/tmp/ssh',
    HOME: '/home/fulano',
  });
  assert.deepEqual(Object.keys(env).sort(), ['LANG', 'LC_ALL', 'PATH', 'TERM', 'TZ']);
});

test('gatilho pull_request: string, lista e mapa (e `on` lido como true pelo YAML 1.1)', () => {
  assert.equal(temGatilhoPullRequest({ on: 'pull_request' }), true);
  assert.equal(temGatilhoPullRequest({ on: ['push', 'pull_request'] }), true);
  assert.equal(temGatilhoPullRequest({ on: { pull_request: null, push: {} } }), true);
  assert.equal(temGatilhoPullRequest({ [true]: { pull_request: {} } }), true);
  assert.equal(temGatilhoPullRequest({ on: { push: {}, workflow_dispatch: {} } }), false);
  assert.equal(temGatilhoPullRequest({ on: 'pull_request_target' }), false);
  assert.equal(temGatilhoPullRequest({}), false);
  assert.deepEqual(gatilhosDoWorkflow({ on: { schedule: [], push: {} } }), ['schedule', 'push']);
  for (const wf of ['ci', 'db-guard'])
    assert.ok(
      temGatilhoPullRequest(
        parseYaml(
          readFileSync(new URL(`../../.github/workflows/${wf}.yml`, import.meta.url), 'utf8')
        )
      ),
      `${wf}.yml perdeu o gatilho pull_request`
    );
});

// ------------------------------------------------- achado 3: encerramento
test('encerramento escala SIGINT → SIGTERM → SIGKILL e para quando o processo sai', async () => {
  const dormir = async () => {};
  const enviados = [];
  const teimoso = await encerrarEscalonado({
    sinalizar: (s) => enviados.push(s),
    vivo: () => true,
    esperaMs: 300,
    dormir,
  });
  assert.equal(teimoso, 'SIGKILL');
  assert.deepEqual(enviados, ['SIGINT', 'SIGTERM', 'SIGKILL']);

  const educado = [];
  let vivo = true;
  const r = await encerrarEscalonado({
    sinalizar: (s) => {
      educado.push(s);
      vivo = false;
    },
    vivo: () => vivo,
    esperaMs: 300,
    dormir,
  });
  assert.equal(r, 'SIGINT');
  assert.deepEqual(educado, ['SIGINT']);

  const nada = [];
  assert.equal(
    await encerrarEscalonado({ sinalizar: (s) => nada.push(s), vivo: () => false, dormir }),
    null
  );
  assert.deepEqual(nada, []);

  let esperas = 0;
  const pressa = [];
  await encerrarEscalonado({
    sinalizar: (s) => pressa.push(s),
    vivo: () => true,
    esperaMs: 10_000,
    apressar: () => true,
    dormir: async () => esperas++,
  });
  assert.deepEqual(pressa, ['SIGINT', 'SIGTERM', 'SIGKILL']);
  assert.equal(esperas, 0, 'segundo Ctrl-C não espera');
});

test('lista de containers do docker ps é lida por coluna', () => {
  assert.deepEqual(lerListaContainers('c3\t/tmp/ci-local-x\tci-local-x-db-1\tpostgres:17\n\n'), [
    { id: 'c3', run: '/tmp/ci-local-x', nomes: 'ci-local-x-db-1', imagem: 'postgres:17' },
  ]);
});

test('shim docker: rótulo só em run/create, resto intacto, sem laço com shim que chama `docker`', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'ci-local-teste-shim-docker-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const shims = join(raiz, 'shims');
  const real = join(raiz, 'real');
  const projeto = join(raiz, 'projeto');
  for (const d of [shims, real, projeto]) mkdirSync(d);
  writeFileSync(join(shims, 'docker'), shimDocker(shims), { mode: 0o755 });
  // "docker real": imprime um argumento por linha
  writeFileSync(join(real, 'docker'), '#!/bin/sh\nfor a in "$@"; do echo "$a"; done\n', {
    mode: 0o755,
  });
  const env = {
    PATH: `${shims}:${real}:/usr/bin:/bin`,
    CI_LOCAL_RUN: '/tmp/ci-local-abc123',
    CI_LOCAL_JOB: '/tmp/ci-local-abc123/job-x',
    CI_LOCAL_PID: '4242',
    CI_LOCAL_INICIO: '99',
    CI_LOCAL_DOCKER_REAL: join(real, 'docker'),
  };
  const docker = (args, extra = {}) => {
    const r = spawnSync(join(shims, 'docker'), args, {
      encoding: 'utf8',
      env: { ...env, ...extra },
      timeout: 10_000,
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trimEnd().split('\n');
  };
  const rotulos = [
    '--label',
    'ci-local=1',
    '--label',
    'ci-local.run=/tmp/ci-local-abc123',
    '--label',
    'ci-local.job=/tmp/ci-local-abc123/job-x',
    '--label',
    'ci-local.pid=4242',
    '--label',
    'ci-local.inicio=99',
  ];
  assert.deepEqual(docker(['run', '-d', 'alpine', 'sh', '-c', 'echo "a b"']), [
    'run',
    ...rotulos,
    '-d',
    'alpine',
    'sh',
    '-c',
    'echo "a b"',
  ]);
  assert.deepEqual(docker(['--context', 'x', '-D', 'create', 'img']), [
    '--context',
    'x',
    '-D',
    'create',
    ...rotulos,
    'img',
  ]);
  assert.deepEqual(docker(['container', 'run', 'img']), ['container', 'run', ...rotulos, 'img']);
  assert.deepEqual(docker(['ps', '-a', '--filter', 'label=x']), [
    'ps',
    '-a',
    '--filter',
    'label=x',
  ]);
  assert.deepEqual(docker(['exec', 'c', 'run']), ['exec', 'c', 'run']);
  // docker-shim de projeto em $HOME/.local/bin que chama `docker` PELO NOME: sem laço,
  // a segunda passagem vai direto ao real (caminho absoluto resolvido no início).
  writeFileSync(join(projeto, 'docker'), '#!/bin/sh\necho PROJETO\nexec docker "$@"\n', {
    mode: 0o755,
  });
  const viaProjeto = docker(['run', 'img'], { PATH: `${shims}:${projeto}:${real}:/usr/bin:/bin` });
  assert.equal(viaProjeto[0], 'PROJETO');
  assert.equal(viaProjeto.filter((l) => l === 'PROJETO').length, 1);
  assert.equal(viaProjeto[1], 'run');
  assert.ok(viaProjeto.includes('ci-local.run=/tmp/ci-local-abc123'));
  // sem docker nenhum: erro claro, não laço (PATH só com o shim e o bash)
  const soBash = join(raiz, 'so-bash');
  mkdirSync(soBash);
  symlinkSync(
    spawnSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim(),
    join(soBash, 'bash')
  );
  const sem = spawnSync(join(shims, 'docker'), ['ps'], {
    encoding: 'utf8',
    env: { ...env, PATH: `${shims}:${soBash}`, CI_LOCAL_DOCKER_REAL: '' },
    timeout: 10_000,
  });
  assert.equal(sem.status, 127, sem.stderr);
  assert.match(sem.stderr, /docker não encontrado/);
});

// --------------------------------------------- achado 4: restos de execuções
test('restos de execuções: dono = pid + início do processo (pid reaproveitado não engana)', () => {
  const inicio = inicioDoProcesso(process.pid);
  assert.match(String(inicio), /^\d+$/);
  assert.equal(donoVivo({ pid: process.pid, inicio }), true);
  assert.equal(donoVivo({ pid: process.pid, inicio: `${inicio}9` }), false, 'pid reaproveitado');
  assert.equal(donoVivo({ pid: 0 }), false);
  assert.equal(donoVivo(null), false);
  assert.equal(
    // campo 22 = 19º depois do estado (campo 3); o nome pode ter ")" e espaço
    inicioDoProcesso(42, () => `42 (nome com ) e espaço) S ${'1 '.repeat(18)}777 0 0`),
    '777'
  );
  const vivos = new Set(['10']);
  const orfaos = containersOrfaos(
    [
      'c1\t10\t5\tci-local-db-guard-postgres-10',
      'c2\t20\t5\tci-local-db-guard-postgres-20',
      'c3\t\t\tci-local-db-guard-postgres-30',
      'c4\t\t\tci-local-db-guard-postgres-10',
      'c5\t\t\tsem-pid-no-nome',
    ].join('\n'),
    (d) => vivos.has(String(d.pid))
  );
  assert.deepEqual(
    orfaos.map((c) => c.id),
    ['c2', 'c3']
  );
});

// ------------------------------------------------------- achado 5: rápido
test('--rapido: saída do vitest sem teste relacionado é reconhecida', () => {
  assert.equal(semTestesRelacionados('No test files found, exiting with code 0\n'), true);
  assert.equal(semTestesRelacionados('No affected test files found'), true);
  assert.equal(semTestesRelacionados(' Test Files  3 passed (3)'), false);
});

// ---------------------------------------- db-guard: migration existente editada
test('lerDiffRawZ: M, rename com e sem edição e A (saída -z, sem aspas)', () => {
  const z = (...c) => `${c.join('\0')}\0`;
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  assert.deepEqual(
    lerDiffRawZ(
      z(
        `:100644 100644 ${a} ${b} M`,
        'supabase/migrations/20260101000000_x.sql',
        `:100644 100644 ${a} ${b} R093`,
        'velho.sql',
        'novo "com aspas".sql',
        `:100644 100644 ${a} ${a} R100`,
        'p.sql',
        'q.sql',
        `:000000 100644 ${'0'.repeat(40)} ${b} A`,
        'n.sql'
      )
    ).map((e) => [e.status, e.origem, e.arquivo, e.blobAntes === e.blobDepois]),
    [
      [
        'M',
        'supabase/migrations/20260101000000_x.sql',
        'supabase/migrations/20260101000000_x.sql',
        false,
      ],
      ['R', 'velho.sql', 'novo "com aspas".sql', false],
      ['R', 'p.sql', 'q.sql', true],
      ['A', 'n.sql', 'n.sql', false],
    ]
  );
});

test('migrationsEditadas: mesmos critérios e exceções do passo do db-guard.yml', () => {
  const M = 'supabase/migrations';
  const e = (status, arquivo, mudou = true) => ({
    status,
    arquivo,
    origem: arquivo,
    blobAntes: 'a',
    blobDepois: mudou ? 'b' : 'a',
  });
  const bases = {
    [`${M}/20260101000001_stub.sql`]: '-- so comentario\n\n  -- outro\n',
    [`${M}/20260101000000_real.sql`]: 'create table t();\n',
  };
  const evidencia = {
    exceptions: [
      { filename: '20260101000002_pin.sql', kind: 'ledger-only/name-and-file-pinned' },
      { filename: '20260101000003_rep.sql', kind: 'ledger-divergence/pinned-replay' },
      { filename: '20260101000004_mk.sql', kind: 'ledger-divergence/pinned-sql-marker' },
    ],
  };
  const v = migrationsEditadas(
    [
      e('M', `${M}/20260101000000_real.sql`),
      e('R', `${M}/20260202000000_renomeada.sql`),
      e('R', `${M}/20260202000001_rename_puro.sql`, false),
      e('M', `${M}/20260101000001_stub.sql`),
      e('M', `${M}/20260101000002_pin.sql`),
      e('R', `${M}/20260101000003_rep.sql`),
      e('M', `${M}/20260101000004_mk.sql`),
      e('M', `${M}/20260101000005_sem_base.sql`),
      e('M', `${M}/20260101000006_so_modo.sql`, false),
      e('A', `${M}/20260101000007_nova.sql`),
      e('D', `${M}/20260101000008_apagada.sql`),
      e('M', `${M}/_foreign/20260101000009_x.sql`),
      e('M', `${M}/2026010100001_curta.sql`),
    ],
    { evidencia, conteudoBase: (f) => bases[f] ?? null }
  );
  assert.deepEqual(v, [
    `${M}/20260101000000_real.sql`,
    `${M}/20260202000000_renomeada.sql`,
    `${M}/20260101000004_mk.sql`,
    `${M}/20260101000005_sem_base.sql`,
  ]);
});

test('checarMigrationsEditadas: repo git real (rename+edição rejeita; rename puro e stub promovido passam)', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'ci-local-migrations-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const g = (...a) => {
    const r = spawnSync(
      'git',
      [
        '-c',
        'user.name=ci',
        '-c',
        'user.email=ci@local',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...a,
      ],
      { cwd: raiz, encoding: 'utf8' }
    );
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const M = 'supabase/migrations';
  // >= 50% de similaridade: o git (e o GitHub) ainda veem rename, não remove+add.
  const sql = Array.from({ length: 10 }, (_, i) => `create table t${i} (id int);\n`).join('');
  g('init', '-q', '-b', 'main');
  mkdirSync(join(raiz, M), { recursive: true });
  mkdirSync(join(raiz, 'scripts/db-audit'), { recursive: true });
  writeFileSync(join(raiz, 'scripts/db-audit/migration-evidence.json'), '{"exceptions":[]}');
  writeFileSync(join(raiz, M, '20260101000000_real.sql'), sql);
  writeFileSync(join(raiz, M, '20260101000001_stub.sql'), '-- aplicada via MCP\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  const base = g('rev-parse', 'HEAD');
  const caso = (mudar) => {
    g('reset', '-q', '--hard', base);
    mudar();
    g('add', '-A');
    g('commit', '-q', '-m', 'caso');
    return checarMigrationsEditadas(raiz, base);
  };
  const p = (f) => join(raiz, M, f);
  assert.deepEqual(
    caso(() => {
      g('mv', p('20260101000000_real.sql'), p('20260202000000_real.sql'));
      writeFileSync(p('20260202000000_real.sql'), `${sql}alter table t add column x int;\n`);
    }),
    [`${M}/20260202000000_real.sql`]
  );
  assert.deepEqual(
    caso(() => g('mv', p('20260101000000_real.sql'), p('20260202000000_real.sql'))),
    []
  );
  assert.deepEqual(
    caso(() => writeFileSync(p('20260101000001_stub.sql'), sql)),
    []
  );
  // --incluir-nao-commitado: edição e rename+edição AINDA NÃO commitados também são barrados.
  const semCommit = (mudar) => {
    g('reset', '-q', '--hard', base);
    g('clean', '-qfd');
    mudar();
    return [
      checarMigrationsEditadas(raiz, base),
      checarMigrationsEditadas(raiz, base, { workingTree: true }),
    ];
  };
  assert.deepEqual(
    semCommit(() => writeFileSync(p('20260101000000_real.sql'), `${sql}-- mudou\n`)),
    [[], [`${M}/20260101000000_real.sql`]]
  );
  assert.deepEqual(
    semCommit(() => {
      g('mv', p('20260101000000_real.sql'), p('20260202000000_real.sql'));
      writeFileSync(p('20260202000000_real.sql'), `${sql}alter table t add column x int;\n`);
    }),
    [[], [`${M}/20260202000000_real.sql`]]
  );
  assert.deepEqual(
    semCommit(() => writeFileSync(p('20260303000000_nova.sql'), sql)),
    [[], []]
  );
  g('reset', '-q', '--hard', base);
  g('clean', '-qfd');
  assert.deepEqual(
    caso(() => writeFileSync(p('20260101000000_real.sql'), `${sql}-- mudou\n`)),
    [`${M}/20260101000000_real.sql`]
  );
});
