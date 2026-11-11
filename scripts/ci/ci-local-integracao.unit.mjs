// Testes de ponta a ponta do CI local (scripts/ci/ci-local.mjs) em repositórios
// git temporários com workflows sintéticos. Sem docker e sem rede: o "origin" é
// um repositório bare local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ci-local.mjs');
const GIT = ['-c', 'user.name=ci', '-c', 'user.email=ci@local', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];

function envLimpo(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return { ...env, ...extra };
}

function git(cwd, ...args) {
  const r = spawnSync('git', [...GIT, ...args], { cwd, encoding: 'utf8', env: envLimpo() });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Repositório com origin bare, main publicada e uma branch com um commit a mais. */
function repo(t, workflows, arquivosBranch = { 'src/a.ts': 'export const a = 1;\n' }) {
  const raiz = mkdtempSync(join(tmpdir(), 'ci-local-teste-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const bare = join(raiz, 'origin.git');
  const src = join(raiz, 'src');
  mkdirSync(src);
  git(raiz, 'init', '-q', '--bare', bare);
  git(src, 'init', '-q', '-b', 'main');
  writeFileSync(join(src, 'README.md'), 'base\n');
  mkdirSync(join(src, '.github', 'workflows'), { recursive: true });
  for (const [nome, yml] of Object.entries(workflows))
    writeFileSync(join(src, '.github', 'workflows', `${nome}.yml`), yml);
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'base');
  git(src, 'remote', 'add', 'origin', bare);
  git(src, 'push', '-q', 'origin', 'main');
  git(src, 'fetch', '-q', 'origin');
  git(src, 'checkout', '-q', '-b', 'feat');
  for (const [arq, conteudo] of Object.entries(arquivosBranch)) {
    mkdirSync(dirname(join(src, arq)), { recursive: true });
    writeFileSync(join(src, arq), conteudo);
  }
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'mudanca');
  return { raiz, src, bare };
}

function rodar(cwd, args, env = {}) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: envLimpo(env),
    timeout: 120_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, ms: Date.now() - inicio };
}

const temporarios = (out) => /temporários: (\S+)/.exec(out)?.[1];

function logsDoPasso(src) {
  const base = join(src, '.ci-local');
  const exec = readdirSync(base).sort().pop();
  const dir = join(base, exec);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

const wf = (jobs, topo = '') => `name: teste\non: pull_request\n${topo}jobs:\n${jobs}`;

test('roda num clone descartável: git fetch --depth=1 de um passo não toca o .git real', (t) => {
  const { src } = repo(t, {
    raso: wf(`  a:
    runs-on: ubuntu-24.04
    steps:
      - run: |
          git fetch --no-tags --depth=1 origin main
          test "$(git rev-parse --is-shallow-repository)" = true
          git config --global user.name passo-do-job
`),
  });
  const refsAntes = git(src, 'for-each-ref', '--format=%(refname) %(objectname)');
  const r = rodar(src, ['--workflow', 'raso']);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(src, 'rev-parse', '--is-shallow-repository'), 'false');
  assert.equal(existsSync(join(src, '.git', 'shallow')), false);
  assert.equal(git(src, 'for-each-ref', '--format=%(refname) %(objectname)'), refsAntes);
  assert.notEqual(
    spawnSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8' }).stdout.trim(),
    'passo-do-job'
  );
  assert.equal(existsSync(temporarios(r.out)), false, 'temporários apagados');
});

test('avisa que testa o HEAD commitado; --incluir-nao-commitado inclui o working tree', (t) => {
  const { src } = repo(t, {
    wt: wf(`  a:
    runs-on: ubuntu-24.04
    steps:
      - run: test -f novo.txt
`),
  });
  writeFileSync(join(src, 'novo.txt'), 'x');
  const sem = rodar(src, ['--workflow', 'wt']);
  assert.equal(sem.code, 1, sem.out);
  assert.match(sem.out, /testado o HEAD commitado/);
  const com = rodar(src, ['--workflow', 'wt', '--incluir-nao-commitado']);
  assert.equal(com.code, 0, com.out);
});

test('passo com sudo/apt não roda na máquina: pulado com aviso e comando listado', (t) => {
  const { src } = repo(t, {
    sudo: wf(`  a:
    runs-on: ubuntu-24.04
    steps:
      - name: Instalar ripgrep
        run: sudo apt-get update -qq && sudo apt-get install -y ripgrep
      - run: echo depois
`),
  });
  const r = rodar(src, ['--workflow', 'sudo']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /requer sudo — pulado \(só no GitHub\)/);
  assert.match(r.out, /sudo apt-get install -y ripgrep/);
});

test('argumentos inválidos saem com 2 (job/workflow inexistente ou sem valor)', (t) => {
  const { src } = repo(t, { ci: wf(`  a:\n    runs-on: x\n    steps:\n      - run: 'true'\n`) });
  for (const args of [['--workflow', 'ci', '--job', 'nao-existe'], ['--workflow', 'nao-existe'], ['--workflow'], ['--job']]) {
    const r = rodar(src, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
  }
});

test('semântica do Actions: !cancelled(), status implícito, needs com falha e continue-on-error', (t) => {
  const { src } = repo(t, {
    sem: wf(`  a:
    runs-on: x
    steps:
      - run: exit 3
      - name: sem-if
        run: echo NAO-DEVIA-RODAR-SEM-IF
      - name: nao-cancelado
        if: \${{ !cancelled() }}
        run: echo RODOU-NAO-CANCELADO
      - name: if-sem-status
        if: github.event_name == 'pull_request'
        run: echo NAO-DEVIA-RODAR-IF-SEM-STATUS
  b:
    runs-on: x
    steps:
      - name: so-em-falha
        if: failure() && contains(github.event_name, 'pull')
        run: echo NAO-DEVIA-RODAR-EM-SUCESSO
      - name: bool-string
        if: github.event.pull_request.draft == 'false'
        run: echo NAO-DEVIA-RODAR-BOOL-STRING
  c:
    runs-on: x
    strategy:
      matrix:
        exp: [false]
    steps:
      - continue-on-error: \${{ matrix.exp }}
        run: exit 1
  e:
    needs: a
    runs-on: x
    steps:
      - run: echo NAO-DEVIA-RODAR-NEEDS
  f:
    needs: a
    if: failure()
    runs-on: x
    steps:
      - run: echo RODOU-F-FAILURE
`),
  });
  const r = rodar(src, ['--workflow', 'sem']);
  assert.equal(r.code, 1, r.out);
  const logs = logsDoPasso(src);
  assert.match(logs, /RODOU-NAO-CANCELADO/);
  assert.match(logs, /RODOU-F-FAILURE/);
  assert.doesNotMatch(logs, /NAO-DEVIA-RODAR/);
  assert.match(r.out, /❌ sem \/ c \(false\)/, 'continue-on-error: false (expressão) não mascara');
  assert.match(r.out, /e: pulado \(needs sem sucesso: a\)/);
});

test('continue-on-error de job não bloqueia; tudo pulado sai com 3', (t) => {
  const { src } = repo(t, {
    coe: wf(`  d:
    runs-on: x
    continue-on-error: true
    steps:
      - run: exit 1
`),
    nada: wf(`  z:
    if: github.event_name == 'workflow_dispatch'
    runs-on: x
    steps:
      - run: 'true'
`),
  });
  const r = rodar(src, ['--workflow', 'coe']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /não bloqueia/);
  const n = rodar(src, ['--workflow', 'nada']);
  assert.equal(n.code, 3, n.out);
  assert.match(n.out, /NENHUM job rodou/);
  const d = rodar(src, ['--workflow', 'nada', '--evento', 'workflow_dispatch']);
  assert.equal(d.code, 0, d.out);
});

test('expressão não avaliável não roda no escuro: o job falha com aviso', (t) => {
  const { src } = repo(t, {
    hf: wf(`  a:
    runs-on: x
    steps:
      - if: hashFiles('x') != ''
        run: echo NAO-DEVIA-RODAR
      - run: echo "\${{ hashFiles('y') }}"
`),
  });
  const r = rodar(src, ['--workflow', 'hf']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /não avaliável localmente — passo NÃO rodou/);
  assert.doesNotMatch(logsDoPasso(src), /NAO-DEVIA-RODAR/);
});

test('timeout mata o grupo de processos (netos inclusive) e o orçamento é do job', (t) => {
  const { src } = repo(t, {
    to: wf(`  passo:
    runs-on: x
    steps:
      - timeout-minutes: 0.02
        run: bash -c 'sleep 30'
  orcamento:
    runs-on: x
    timeout-minutes: 0.04
    steps:
      - run: sleep 1
      - run: sleep 1
      - run: sleep 1
      - run: sleep 1
  expressao:
    runs-on: x
    timeout-minutes: \${{ matrix.t }}
    strategy:
      matrix:
        include:
          - t: 5
    steps:
      - run: sleep 1; echo OK-COM-TIMEOUT-EXPRESSAO
`),
  });
  const r = rodar(src, ['--workflow', 'to']);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.ms < 20_000, `demorou ${r.ms} ms: o neto segurou o pipe`);
  assert.match(r.out, /timeout do passo/);
  assert.match(r.out, /timeout do job/);
  assert.match(r.out, /✅ to \/ expressao \(5\)/);
});

test('working-directory, defaults e arquivos do runner (GITHUB_ENV/OUTPUT/PATH)', (t) => {
  const { src } = repo(t, {
    wd: wf(
      `  a:
    runs-on: x
    steps:
      - id: s1
        run: |
          case "$PWD" in */sub) ;; *) echo "PWD errado: $PWD"; exit 1;; esac
          { echo 'MULTI<<EOF'; echo l1; echo l2; echo EOF; } >> "$GITHUB_ENV"
          echo 'out1=valor' >> "$GITHUB_OUTPUT"
          mkdir -p "$RUNNER_TEMP/p1" "$RUNNER_TEMP/p2"
          printf '#!/bin/sh\\necho p1\\n' > "$RUNNER_TEMP/p1/qual"; printf '#!/bin/sh\\necho p2\\n' > "$RUNNER_TEMP/p2/qual"
          chmod +x "$RUNNER_TEMP/p1/qual" "$RUNNER_TEMP/p2/qual"
          echo "$RUNNER_TEMP/p1" >> "$GITHUB_PATH"; echo "$RUNNER_TEMP/p2" >> "$GITHUB_PATH"
      - working-directory: .
        run: |
          test "$MULTI" = "$(printf 'l1\\nl2')"
          test "\${{ steps.s1.outputs.out1 }}" = valor
          test "$(qual)" = p2
          test -f README.md
`,
      'defaults:\n  run:\n    working-directory: sub\n'
    ),
  }, { 'sub/.keep': '' });
  const r = rodar(src, ['--workflow', 'wd']);
  assert.equal(r.code, 0, r.out);
});

test('shell ausente falha o passo com mensagem clara, sem derrubar o CI local', (t) => {
  const { src } = repo(t, {
    sh: wf(`  a:
    runs-on: x
    steps:
      - shell: shell-que-nao-existe-zz {0}
        run: echo oi
`),
  });
  const r = rodar(src, ['--workflow', 'sh']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /"shell-que-nao-existe-zz" não encontrado/);
  assert.equal(existsSync(temporarios(r.out)), false);
});

test('valores de secrets são mascarados nos logs', (t) => {
  const { src } = repo(t, {
    sec: wf(`  a:
    runs-on: x
    steps:
      - env:
          TOKEN: \${{ secrets.MEU_SEGREDO }}
        run: echo "valor=$TOKEN"
`),
  });
  writeFileSync(join(src, '.env.ci.local'), 'MEU_SEGREDO=supersecreto-123\n');
  const r = rodar(src, ['--workflow', 'sec']);
  assert.equal(r.code, 0, r.out);
  const logs = logsDoPasso(src);
  assert.doesNotMatch(logs, /supersecreto-123/);
  assert.match(logs, /valor=\*\*\*/);
});

test('--rapido: nomes com aspas/acento/espaço vão como argumentos (sem shell) e sem merge-base sai com 2', (t) => {
  const { src, raiz } = repo(
    t,
    {
      ci: wf(`  unit-tests:
    runs-on: x
    strategy:
      matrix:
        shard: [1, 2]
    steps:
      - run: bun vitest run --shard=\${{ matrix.shard }}/2
`),
    },
    {
      "src/x'$(touch PWNED)'.ts": '',
      'src/ação b.ts': '',
      'README.md': 'mudou\n',
    }
  );
  const fake = join(raiz, 'bin');
  mkdirSync(fake);
  const registro = join(raiz, 'bun-args');
  writeFileSync(join(fake, 'bun'), `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > "${registro}"\n`);
  chmodSync(join(fake, 'bun'), 0o755);
  const r = rodar(src, ['--rapido', '--workflow', 'ci'], { PATH: `${fake}:${process.env.PATH}` });
  assert.equal(r.code, 0, r.out);
  const recebidos = readFileSync(registro, 'utf8').split('\0').filter(Boolean);
  assert.deepEqual(recebidos.slice(0, 3), ['vitest', 'related', '--run']);
  assert.deepEqual(recebidos.slice(3).sort(), ["src/x'$(touch PWNED)'.ts", 'src/ação b.ts'].sort());
  assert.equal(existsSync(join(src, 'PWNED')), false);
  assert.match(r.out, /unit-tests \(rápido\)/);
  const semBase = rodar(src, ['--rapido', '--workflow', 'ci', '--base', 'origin/nao-existe']);
  assert.equal(semBase.code, 2, semBase.out);
  assert.doesNotMatch(semBase.out, /nenhum arquivo/);
});

test('Ctrl-C (SIGINT) mata os passos e apaga os temporários', async (t) => {
  const marcas = mkdtempSync(join(tmpdir(), 'ci-local-teste-pid-'));
  t.after(() => rmSync(marcas, { recursive: true, force: true }));
  const { src } = repo(t, {
    longo: wf(`  a:
    runs-on: x
    steps:
      - run: |
          echo $$ > "${join(marcas, 'pid')}"
          sleep 60 &
          echo $! > "${join(marcas, 'pid-neto')}"
          wait
`),
  });
  const filho = spawn(process.execPath, [SCRIPT, '--workflow', 'longo'], { cwd: src, env: envLimpo() });
  let out = '';
  filho.stdout.on('data', (d) => (out += d));
  filho.stderr.on('data', (d) => (out += d));
  const fim = new Promise((ok) => filho.on('exit', (code) => ok(code)));
  for (let i = 0; i < 200 && !existsSync(join(marcas, 'pid-neto')); i++)
    await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(existsSync(join(marcas, 'pid-neto')), out);
  await new Promise((ok) => setTimeout(ok, 200));
  filho.kill('SIGINT');
  assert.equal(await fim, 130, out);
  const vivo = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  await new Promise((ok) => setTimeout(ok, 300));
  for (const f of ['pid', 'pid-neto'])
    assert.equal(vivo(Number(readFileSync(join(marcas, f), 'utf8'))), false, `${f} sobreviveu`);
  assert.equal(existsSync(temporarios(out)), false, 'temporários apagados');
});
