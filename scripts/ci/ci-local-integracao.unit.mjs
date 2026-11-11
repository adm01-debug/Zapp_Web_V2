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
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ci-local.mjs');
const GIT = [
  '-c',
  'user.name=ci',
  '-c',
  'user.email=ci@local',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

// Os testes nunca falam com o docker da máquina: um `docker` que falha vem antes
// no PATH (o CI local trata como "docker indisponível" e não lista nem remove nada).
const SEM_DOCKER = mkdtempSync(join(tmpdir(), 'ci-local-teste-sem-docker-'));
writeFileSync(join(SEM_DOCKER, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.on('exit', () => rmSync(SEM_DOCKER, { recursive: true, force: true }));
const pathCom = (dir) => `${dir}:${SEM_DOCKER}:${process.env.PATH}`;

function envLimpo(extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))
  );
  return { ...env, PATH: `${SEM_DOCKER}:${process.env.PATH}`, ...extra };
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
  assert.match(r.out, /requer sudo\/root — pulado \(só no GitHub\)/);
  assert.match(r.out, /sudo apt-get install -y ripgrep/);
});

test('argumentos inválidos saem com 2 (job/workflow inexistente ou sem valor)', (t) => {
  const { src } = repo(t, { ci: wf(`  a:\n    runs-on: x\n    steps:\n      - run: 'true'\n`) });
  for (const args of [
    ['--workflow', 'ci', '--job', 'nao-existe'],
    ['--workflow', 'nao-existe'],
    ['--workflow'],
    ['--job'],
  ]) {
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
  const { src } = repo(
    t,
    {
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
    },
    { 'sub/.keep': '' }
  );
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
  writeFileSync(
    join(fake, 'bun'),
    `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > "${registro}"\n`
  );
  chmodSync(join(fake, 'bun'), 0o755);
  const r = rodar(src, ['--rapido', '--workflow', 'ci'], { PATH: pathCom(fake) });
  assert.equal(r.code, 0, r.out);
  const recebidos = readFileSync(registro, 'utf8').split('\0').filter(Boolean);
  assert.deepEqual(recebidos.slice(0, 4), ['vitest', 'related', '--run', '--passWithNoTests']);
  assert.deepEqual(recebidos.slice(4).sort(), ["src/x'$(touch PWNED)'.ts", 'src/ação b.ts'].sort());
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
  const filho = spawn(process.execPath, [SCRIPT, '--workflow', 'longo'], {
    cwd: src,
    env: envLimpo(),
  });
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

// ------------------------------------------------- achado 1: root nunca roda
test('root nunca roda: playwright --with-deps/install-deps pulados; sudo/apt escondidos caem no shim', (t) => {
  const { src, raiz } = repo(t, {
    root: wf(`  a:
    runs-on: x
    steps:
      - name: Install Playwright
        run: bunx playwright@1.64.1 install --with-deps chromium
      - name: Deps do Playwright
        run: bunx playwright install-deps chromium
      - name: sudo falso via GITHUB_PATH
        run: |
          mkdir -p "$RUNNER_TEMP/p"
          printf '#!/bin/sh\\necho SUDO-DO-GITHUB-PATH\\n' > "$RUNNER_TEMP/p/sudo"
          chmod +x "$RUNNER_TEMP/p/sudo"
          echo "$RUNNER_TEMP/p" >> "$GITHUB_PATH"
      - name: comandos escondidos do detector
        run: |
          test "$SUDO_ASKPASS" = /bin/false
          for c in $(echo c3VkbyBhcHQgYXB0LWdldCBkcGtnIHN1IGRvYXMgcGtleGVj | base64 -d); do
            if "$c" -n true; then echo "NAO-BARROU $c"; exit 1; fi
          done
          echo SHIM-OK
`),
  });
  // "sudo" da máquina (o real tem NOPASSWD): se o passo chegasse nele, deixaria marca.
  const fake = join(raiz, 'bin');
  mkdirSync(fake);
  const marca = join(raiz, 'sudo-real-chamado');
  for (const nome of ['sudo', 'apt-get', 'bunx'])
    writeFileSync(join(fake, nome), `#!/bin/sh\necho "${nome} $*" >> "${marca}"\n`, {
      mode: 0o755,
    });
  const r = rodar(src, ['--workflow', 'root'], { PATH: pathCom(fake) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Install Playwright — requer sudo\/root — pulado/);
  assert.match(r.out, /Deps do Playwright — requer sudo\/root — pulado/);
  const logs = logsDoPasso(src);
  assert.match(logs, /SHIM-OK/);
  assert.match(logs, /"sudo -n true" requer root — só no GitHub/);
  assert.match(logs, /"pkexec -n true" requer root — só no GitHub/);
  assert.doesNotMatch(logs, /SUDO-DO-GITHUB-PATH|NAO-BARROU/);
  assert.equal(existsSync(marca), false, 'sudo/apt-get/bunx da máquina foram chamados');
  assert.match(r.out, /cai num shim que FALHA/);
});

// ------------------------------------------------- achado 2: credenciais
test('credenciais não vazam: hosts.yml, auths do docker, helper do git, ambiente e secrets do terminal', (t) => {
  const passo = (comCred) => `  a:
    runs-on: x
    steps:
      - env:
          T: \${{ secrets.GH_TOKEN }}
        run: |
          ${comCred ? 'test -f "$GH_CONFIG_DIR/hosts.yml"' : 'test ! -e "$GH_CONFIG_DIR/hosts.yml"'}
          test -f "$GH_CONFIG_DIR/config.yml"
          ${comCred ? 'grep -q auths "$DOCKER_CONFIG/config.json"' : 'if grep -q -e auths -e credsStore "$DOCKER_CONFIG/config.json"; then exit 1; fi'}
          grep -q currentContext "$DOCKER_CONFIG/config.json"
          h=$(git config --global --get-all credential.helper | tail -n1)
          ${comCred ? 'test "$h" = store' : 'test -z "$h"'}
          test -z "\${GH_TOKEN:-}\${SEGREDO_DO_TERMINAL:-}\${T:-}"
          echo CRED-OK
`;
  const { src, raiz } = repo(t, { cred: wf(passo(false)), comcred: wf(passo(true)) });
  const home = join(raiz, 'home');
  mkdirSync(join(home, '.config', 'gh'), { recursive: true });
  mkdirSync(join(home, '.docker'));
  writeFileSync(
    join(home, '.config', 'gh', 'hosts.yml'),
    'github.com:\n  oauth_token: gho_FALSO\n'
  );
  writeFileSync(join(home, '.config', 'gh', 'config.yml'), 'git_protocol: https\n');
  writeFileSync(
    join(home, '.docker', 'config.json'),
    JSON.stringify({
      auths: { 'ghcr.io': { auth: 'eDp5' } },
      credsStore: 'pass',
      currentContext: 'default',
    })
  );
  writeFileSync(join(home, '.gitconfig'), '[credential]\n\thelper = store\n');
  const env = {
    HOME: home,
    GH_CONFIG_DIR: undefined,
    DOCKER_CONFIG: undefined,
    GIT_CONFIG_GLOBAL: undefined,
    GH_TOKEN: 'gho_DO_TERMINAL',
    SEGREDO_DO_TERMINAL: 'vazou',
  };
  const r = rodar(src, ['--workflow', 'cred'], env);
  assert.equal(r.code, 0, r.out);
  assert.match(logsDoPasso(src), /CRED-OK/);
  // o HOME real (falso, aqui) não foi alterado
  assert.match(readFileSync(join(home, '.docker', 'config.json'), 'utf8'), /auths/);
  // --com-credenciais copia o login (só o GH_TOKEN do terminal continua de fora)
  const c = rodar(src, ['--workflow', 'comcred', '--com-credenciais'], env);
  assert.equal(c.code, 0, c.out);
});

test('workflow sem gatilho pull_request só roda com --permitir-workflow-sem-pr', (t) => {
  const { src } = repo(t, {
    deploy: `name: deploy\non:\n  push:\n    branches: [main]\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: echo PUBLICOU\n`,
  });
  const r = rodar(src, ['--workflow', 'deploy']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /deploy\.yml não tem gatilho pull_request \(on: push\)/);
  assert.match(r.out, /--permitir-workflow-sem-pr/);
  assert.equal(rodar(src, ['--workflow', 'deploy', '--listar']).code, 0);
  const ok = rodar(src, ['--workflow', 'deploy', '--evento', 'push', '--permitir-workflow-sem-pr']);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /sem gatilho pull_request — rodando por --permitir-workflow-sem-pr/);
});

// ------------------------------------------------- achado 3: encerramento
test('timeout encerra com escalada: SIGINT, depois SIGTERM, depois SIGKILL', (t) => {
  const marcas = mkdtempSync(join(tmpdir(), 'ci-local-teste-sinais-'));
  t.after(() => rmSync(marcas, { recursive: true, force: true }));
  const { src } = repo(t, {
    esc: wf(`  a:
    runs-on: x
    steps:
      - timeout-minutes: 0.02
        run: |
          trap 'echo INT >> "${join(marcas, 'sinais')}"' INT
          trap 'echo TERM >> "${join(marcas, 'sinais')}"' TERM
          echo $$ > "${join(marcas, 'pid')}"
          while :; do sleep 0.1 || true; done
`),
  });
  const r = rodar(src, ['--workflow', 'esc'], { CI_LOCAL_GRACA_MS: '700' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /timeout do passo/);
  assert.deepEqual(readFileSync(join(marcas, 'sinais'), 'utf8').trim().split('\n'), [
    'INT',
    'TERM',
  ]);
  const pid = Number(readFileSync(join(marcas, 'pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), 'o passo teimoso sobreviveu ao SIGKILL');
});

test('containers: só os rotulados pelo shim desta execução saem; sem rótulo (paralelo/pré-existente) sobrevive', (t) => {
  const marcas = mkdtempSync(join(tmpdir(), 'ci-local-teste-docker-'));
  t.after(() => rmSync(marcas, { recursive: true, force: true }));
  const fake = join(marcas, 'bin');
  mkdirSync(fake);
  const estado = join(marcas, 'containers.json');
  const reg = join(marcas, 'chamadas');
  writeFileSync(
    estado,
    JSON.stringify([{ id: 'preexistente', run: '', job: '', img: 'postgres:17' }])
  );
  // docker falso com estado: run cria (com os rótulos recebidos), ps filtra por rótulo, rm remove.
  writeFileSync(
    join(fake, 'docker'),
    `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(reg)}, a.join(' ') + '\\n');
const cs = JSON.parse(fs.readFileSync(${JSON.stringify(estado)}, 'utf8'));
const salvar = () => fs.writeFileSync(${JSON.stringify(estado)}, JSON.stringify(cs));
const rot = (k) => { const i = a.indexOf('--label', a.findIndex((x, j) => x === '--label' && a[j + 1].startsWith(k + '='))); return i < 0 ? '' : a[i + 1].slice(k.length + 1); };
if (a[0] === 'run') {
  const id = 'c' + cs.length;
  cs.push({ id, run: rot('ci-local.run'), job: rot('ci-local.job'), pid: rot('ci-local.pid'), img: a[a.length - 1] });
  salvar();
  console.log(id);
} else if (a[0] === 'ps') {
  const f = a[a.indexOf('--filter') + 1] || '';
  const m = /^label=(ci-local\\.run|ci-local\\.job)=(.*)$/.exec(f);
  if (m) for (const c of cs) if (c[m[1] === 'ci-local.run' ? 'run' : 'job'] === m[2]) console.log([c.id, c.run, c.id + '-nome', c.img].join('\\t'));
} else if (a[0] === 'rm') {
  for (const id of a.slice(2)) { const k = cs.findIndex((c) => c.id === id); if (k >= 0) cs.splice(k, 1); }
  salvar();
}
`,
    { mode: 0o755 }
  );
  const { src } = repo(t, {
    dk: wf(`  a:
    runs-on: x
    steps:
      - name: docker-shim do projeto (como o db-guard) chama docker pelo nome
        run: |
          mkdir -p "$HOME/.local/bin"
          printf '#!/bin/sh\\necho PROJETO-SHIM >&2\\nexec docker "$@"\\n' > "$HOME/.local/bin/docker"
          chmod +x "$HOME/.local/bin/docker"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - name: outra sessão sobe container em paralelo e o passo sobe o seu
        run: |
          "${join(fake, 'docker')}" run -d paralelo-de-outra-sessao
          docker run -d alpine
`),
  });
  const r = rodar(src, ['--workflow', 'dk'], { PATH: pathCom(fake) });
  assert.equal(r.code, 0, r.out);
  const chamadas = readFileSync(reg, 'utf8').trim().split('\n');
  const final = JSON.parse(readFileSync(estado, 'utf8'));
  // sobreviventes: o que já existia e o que outra sessão subiu em paralelo (sem rótulo)
  assert.deepEqual(final.map((c) => c.id).sort(), ['c1', 'preexistente'], chamadas.join('\n'));
  assert.equal(final.find((c) => c.id === 'c1').img, 'paralelo-de-outra-sessao');
  const destrutivas = chamadas.filter((l) => /^(stop|rm|kill)\b/.test(l));
  assert.ok(
    destrutivas.some((l) => /^rm -f c2$/.test(l)),
    chamadas.join('\n')
  );
  assert.ok(
    !destrutivas.some((l) => /preexistente|\bc1\b/.test(l)),
    'mexeu em container sem rótulo'
  );
  // o do passo foi rotulado (passando pelo shim do projeto uma vez só, sem laço)
  const runDoPasso = chamadas.find((l) => /^run .*alpine$/.test(l));
  assert.match(
    runDoPasso,
    /--label ci-local=1 --label ci-local\.run=\/\S*ci-local-\w{6} --label ci-local\.job=\S+ --label ci-local\.pid=\d+/
  );
  assert.equal((logsDoPasso(src).match(/PROJETO-SHIM/g) ?? []).length, 1);
});

// --------------------------------------------- achado 4: restos de execuções
test('ao iniciar, varre restos de execuções mortas (e só delas)', async (t) => {
  const { src } = repo(t, {
    v: wf(`  a:\n    runs-on: x\n    steps:\n      - run: 'true'\n`),
  });
  const morto = mkdtempSync(join(tmpdir(), 'ci-local-'));
  const vivo = mkdtempSync(join(tmpdir(), 'ci-local-'));
  const semDono = mkdtempSync(join(tmpdir(), 'ci-local-'));
  t.after(() => {
    for (const d of [morto, vivo, semDono]) rmSync(d, { recursive: true, force: true });
  });
  const pidMorto = spawnSync('true').pid;
  writeFileSync(join(morto, 'dono.json'), JSON.stringify({ pid: pidMorto, inicio: '1' }));
  const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
  const inicio = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  writeFileSync(join(vivo, 'dono.json'), JSON.stringify({ pid: process.pid, inicio }));
  // processo órfão da execução morta (herdou a marca)
  const orfao = spawn('sleep', ['60'], {
    env: { ...process.env, CI_LOCAL_RUN: morto },
    stdio: 'ignore',
  });
  const saiu = new Promise((ok) => orfao.on('exit', (code, sinal) => ok(sinal)));
  t.after(() => orfao.kill('SIGKILL'));
  const r = rodar(src, ['--workflow', 'v']);
  assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(morto), false, 'resto da execução morta ficou');
  assert.match(r.out, new RegExp(`resto de execução morta \\(pid ${pidMorto}\\) removido`));
  assert.equal(existsSync(vivo), true, 'apagou diretório de execução viva');
  assert.equal(existsSync(semDono), true, 'apagou diretório sem dono conhecido');
  assert.equal(await saiu, 'SIGINT', 'órfão da execução morta não foi encerrado');
});

// ------------------------------------------------------- achado 5: baixo
test('checkout real: nenhum git do CI local reescreve o índice (GIT_OPTIONAL_LOCKS=0)', (t) => {
  const { src } = repo(t, {
    l: wf(`  a:\n    runs-on: x\n    steps:\n      - run: 'true'\n`),
  });
  // stat do arquivo mudou (conteúdo igual): um `git status` comum reescreveria o índice.
  const futuro = new Date(Date.now() + 120_000);
  utimesSync(join(src, 'README.md'), futuro, futuro);
  const indice = join(src, '.git', 'index');
  const antes = statSync(indice);
  const r = rodar(src, ['--workflow', 'l']);
  assert.equal(r.code, 0, r.out);
  const depois = statSync(indice);
  assert.equal(depois.mtimeMs, antes.mtimeMs, 'o CI local reescreveu o índice do checkout real');
  assert.equal(depois.ino, antes.ino);
  // controle: o mesmo cenário COM lock opcional reescreve (o teste mede algo real)
  git(src, 'status', '--porcelain');
  assert.notEqual(statSync(indice).mtimeMs, antes.mtimeMs, 'controle: git status não reescreveu');
});

test('--rapido sem teste relacionado avisa "nenhum teste relacionado" em vez de ✅', (t) => {
  const { src, raiz } = repo(t, {
    ci: wf(`  unit-tests:
    runs-on: x
    steps:
      - run: bun vitest run
`),
  });
  const fake = join(raiz, 'bin');
  mkdirSync(fake);
  writeFileSync(
    join(fake, 'bun'),
    '#!/bin/sh\necho "No test files found, exiting with code 0"\nexit 0\n',
    { mode: 0o755 }
  );
  const r = rodar(src, ['--rapido', '--workflow', 'ci'], { PATH: pathCom(fake) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nenhum teste relacionado \(nada verificado\)/);
  assert.match(r.out, /⚠️ {2}ci \/ unit-tests \(rápido\) \(passou sem verificar nada/);
  assert.doesNotMatch(r.out, /✅ ci \/ unit-tests/);
});
