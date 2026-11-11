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
  assert.throws(
    () => avaliarExpressao("contains(github.event_name, 'pull')", ctx),
    ExpressaoNaoSuportada
  );
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
