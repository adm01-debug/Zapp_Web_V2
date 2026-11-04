import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHIM = path.join(ROOT, 'scripts/db-audit/docker-shim');
const WRAPPER = path.join(ROOT, 'scripts/db-audit/retry-disposable-postgres-test.sh');
const CONTRACTS = new Map([
  ['talkx-alerts-outcome-unknown-lote.test.sh', 'offline-contract'],
  ['team-member-role-rpcs.test.sh', 'offline-contract'],
  ['team-chat-media-acl-r2-db-020.test.sh', 'offline-contract'],
  ['team-chat-department-transfer-guards.test.sh', 'offline-contract'],
  ['n142-message-reactions-select-user-id.test.sh', 'offline-contract'],
  ['messages-group-sender.test.sh', 'replay-migrations'],
]);

// Guarda conservadora dos seis harnesses descartáveis auditados. Compara o bloco
// completo, exceto nome/comentários; não deduplica comandos nem reescreve YAML.
// Diferenças em env, if, shell, timeout, id ou run continuam cenários distintos.
function auditedSteps(yaml) {
  const start = yaml.indexOf('\njobs:\n');
  assert.ok(start >= 0, 'Bloco jobs não encontrado');
  const body = yaml.slice(start + 1);
  const jobs = [...body.matchAll(/^  ([\w-]+):\s*$/gm)];
  return jobs.flatMap((match, i) => {
    const block = body.slice(match.index, jobs[i + 1]?.index ?? body.length);
    const steps = [...block.matchAll(/^      - name: .+$/gm)];
    return steps.flatMap((step, j) => {
      const source = block.slice(step.index, steps[j + 1]?.index ?? block.length);
      const lines = source.split('\n');
      const command = lines.find(line => /^        run: /.test(line));
      const script = [...CONTRACTS.keys()].find(name => command?.includes(`scripts/db-audit/${name}`));
      if (!script) return [];
      const signature = lines.slice(1).filter(line => line.trim() && !/^\s*#/.test(line))
        .map(line => line.trimEnd()).join('\n');
      return [{ job: match[1], script, signature }];
    });
  });
}

function duplicates(yaml) {
  const seen = new Set();
  return auditedSteps(yaml).filter(step => {
    const key = JSON.stringify([step.job, step.signature]);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

test('DB Guard mantém cada contrato auditado e não repete execução idêntica', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/db-guard.yml'), 'utf8');
  const steps = auditedSteps(yaml);
  for (const [script, job] of CONTRACTS) {
    assert.ok(steps.some(step => step.script === script && step.job === job), `${script} saiu do job ${job}`);
  }
  assert.deepEqual(duplicates(yaml), [], 'Contrato repetido sem cenário novo; preserve variantes reais de parâmetros');
});

const COMMAND = 'bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/n142-message-reactions-select-user-id.test.sh';
const STEP = `        env:\n          SKIP_DOCKER_SHIM: "1"\n        run: ${COMMAND}\n`;
const twoSteps = (second, between = '') => `name: fixture\njobs:\n  offline-contract:\n    steps:\n      - name: primeiro\n${STEP}${between}      - name: segundo\n${second}`;

test('nomes diferentes não ocultam duas execuções idênticas', () => {
  assert.equal(duplicates(twoSteps(STEP)).length, 1);
});

test('comentários diferentes não criam cenário novo', () => {
  assert.equal(duplicates(twoSteps('        # outra descrição\n' + STEP)).length, 1);
});

test('um contrato intermediário não esconde repetição de harness descartável', () => {
  assert.equal(duplicates(twoSteps(STEP, '      - name: intermediário\n        run: echo outro-contrato\n')).length, 1);
});

test('comando igual em jobs distintos não é tratado como repetição no mesmo contexto', () => {
  const yaml = twoSteps(STEP).replace('      - name: segundo', '  other-job:\n    steps:\n      - name: segundo');
  assert.equal(duplicates(yaml).length, 0);
});

const variants = [
  ['argumento do comando', STEP.replace(COMMAND, COMMAND + ' --scenario=alternate')],
  ['pré-estado no comando', STEP.replace(COMMAND, 'N142_PRESTATE=1 ' + COMMAND)],
  ['outra variável', STEP.replace('        run:', '          N142_PRESTATE: "1"\n        run:')],
  ['outro modo do Docker', STEP.replace('"1"', '"0"')],
  ['outra imagem', STEP.replace('        run:', '          N142_REACTIONS_TEST_POSTGRES_IMAGE: postgres:16-alpine\n        run:')],
  ['uma tentativa de bootstrap', STEP.replace('        run:', '          DISPOSABLE_PG_ATTEMPTS: "1"\n        run:')],
  ['doze tentativas de bootstrap', STEP.replace('        run:', '          DISPOSABLE_PG_ATTEMPTS: "12"\n        run:')],
  ['outro intervalo de retry', STEP.replace('        run:', '          DISPOSABLE_PG_BASE_WAIT: "15"\n        run:')],
  ['outra política de pull', STEP.replace('        run:', '          PRE_PULL_ATTEMPTS: "1"\n        run:')],
  ['if always', '        if: always()\n' + STEP],
  ['if failure', '        if: failure()\n' + STEP],
  ['dependência de output', "        if: steps.fixture.outputs.ready == 'true'\n" + STEP],
  ['shell bash', '        shell: bash\n' + STEP],
  ['shell estrito explícito', '        shell: bash --noprofile --norc -euo pipefail {0}\n' + STEP],
  ['timeout curto', '        timeout-minutes: 1\n' + STEP],
  ['timeout maior', '        timeout-minutes: 10\n' + STEP],
  ['diretório de fixtures diferente', '        working-directory: fixtures/alternate\n' + STEP],
  ['falha tolerada', '        continue-on-error: true\n' + STEP],
  ['id próprio', '        id: alternate_contract\n' + STEP],
];
for (const [name, second] of variants) {
  test(`variante preservada: ${name}`, () => assert.equal(duplicates(twoSteps(second)).length, 0));
}

function fixture(t, { previous = ['postgres', 'existing_role'], current = [...previous, 'new_role'], snapshot = 'valid' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-guard-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(bin); fs.mkdirSync(stateDir);
  const stateFile = path.join(dir, 'database.json');
  const callsFile = path.join(dir, 'calls.jsonl');
  const marker = path.join(stateDir, 'fixture.db');
  const rolesFile = path.join(stateDir, 'fixture.roles');
  fs.writeFileSync(marker, 'shim_fixture');
  if (snapshot === 'valid') fs.writeFileSync(rolesFile, previous.join('\n') + (previous.length ? '\n' : ''));
  else if (snapshot === 'unreadable') fs.mkdirSync(rolesFile);
  fs.writeFileSync(stateFile, JSON.stringify({ databases: ['shim_fixture'], roles: current }));
  const executable = (name, source) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${source}`, { mode: 0o755 });
    return file;
  };
  const realDocker = executable('real-docker', `
    const fs = require('node:fs');
    fs.appendFileSync(process.env.REVIEW_CALLS, JSON.stringify({docker:process.argv.slice(2)})+'\\n');
  `);
  executable('docker', `
    if (process.argv[2] !== 'image' || process.argv[3] !== 'inspect') process.exit(90);
  `);
  executable('psql', `
    const fs=require('node:fs');const args=process.argv.slice(2);
    const sql=args.includes('-c')?args[args.indexOf('-c')+1]:fs.readFileSync(0,'utf8');
    fs.appendFileSync(process.env.REVIEW_CALLS,JSON.stringify({args,sql})+'\\n');
    const state=JSON.parse(fs.readFileSync(process.env.REVIEW_DATABASE,'utf8'));
    const quoted=()=>sql.match(/"([^"]+)"/)[1];
    if(sql.startsWith('SELECT rolname')){
      if(process.env.REVIEW_FAIL_ROLE_QUERY==='1'){process.stdout.write('partial_role\\n');process.exit(41);}
      process.stdout.write([...state.roles].sort().join('\\n')+'\\n');
    }
    else if(sql.startsWith('DROP DATABASE'))state.databases=state.databases.filter(x=>x!==quoted());
    else if(sql.startsWith('CREATE DATABASE')){
      if(process.env.REVIEW_FAIL_CREATE_DATABASE==='1'){process.stderr.write('CREATE DATABASE failed in fixture\\n');process.exit(37);}
      state.databases.push(quoted());
    }
    else if(sql.startsWith('DROP ROLE')){
      if(quoted()==='postgres')process.exit(1); // PostgreSQL não permite remover o usuário atual.
      state.roles=state.roles.filter(x=>x!==quoted());
    }
    fs.writeFileSync(process.env.REVIEW_DATABASE,JSON.stringify(state));
  `);
  const env = {
    PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`, LANG: 'C.UTF-8',
    DOCKER_SHIM_STATE_DIR: stateDir, DOCKER_REAL: realDocker,
    POSTGRES_SERVICE_HOST: '127.0.0.1', POSTGRES_SERVICE_PORT: '5432',
    POSTGRES_SERVICE_USER: 'postgres', POSTGRES_SERVICE_PASS: 'offline-fixture',
    REVIEW_DATABASE: stateFile, REVIEW_CALLS: callsFile,
    DISPOSABLE_PG_BASE_WAIT: '0', PRE_PULL_BASE_WAIT: '0',
  };
  const run = (script, args, extraEnv = {}) => {
    const result = spawnSync('bash', [script, ...args], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10_000 });
    assert.ifError(result.error);
    return result;
  };
  const calls = () => fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { dir, stateDir, marker, rolesFile, executable, run, calls,
    state: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')),
    cleanup: () => run(SHIM, ['rm', '-f', 'fixture']),
  };
}

test('shim preserva roles do snapshot e remove apenas roles novos', t => {
  const f = fixture(t);
  const result = f.cleanup();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.state(), { databases: [], roles: ['postgres', 'existing_role'] });
  assert.deepEqual(f.calls().filter(c => c.sql?.startsWith('DROP ROLE')).map(c => c.sql), ['DROP ROLE IF EXISTS "new_role";']);
  assert.equal(fs.existsSync(f.marker), false);
  assert.equal(fs.existsSync(f.rolesFile), false);
});

test('shim aceita snapshot vazio lido com sucesso', t => {
  const f = fixture(t, { previous: [], current: ['new_role'] });
  assert.equal(f.cleanup().status, 0);
  assert.deepEqual(f.state(), { databases: [], roles: [] });
});

for (const snapshot of ['missing', 'unreadable']) {
  test(`shim recusa snapshot ${snapshot === 'missing' ? 'ausente' : 'ilegível (diretório)'} sem remover banco/roles`, t => {
    const f = fixture(t, { snapshot });
    const result = f.cleanup();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /snapshot.*roles.*(ausente|ileg.vel)/i);
    assert.deepEqual(f.calls(), []);
    assert.deepEqual(f.state(), { databases: ['shim_fixture'], roles: ['postgres', 'existing_role', 'new_role'] });
    assert.equal(fs.existsSync(f.marker), true, 'Estado preservado para inspeção ou nova limpeza');
  });
}

test('shim não repete remoção de roles quando cleanup é chamado novamente', t => {
  const f = fixture(t);
  assert.equal(f.cleanup().status, 0);
  const sqlBefore = f.calls().filter(c => c.sql).length;
  f.cleanup(); // Sem estado, mantém o fallback já existente para o Docker real (aqui simulado).
  assert.equal(f.calls().filter(c => c.sql).length, sqlBefore);
  assert.deepEqual(f.state().roles, ['postgres', 'existing_role']);
  assert.deepEqual(f.calls().at(-1).docker, ['rm', '-f', 'fixture']);
});

test('shim sem roles novos preserva todos os roles anteriores', t => {
  const f = fixture(t, { current: ['postgres', 'existing_role'] });
  assert.equal(f.cleanup().status, 0);
  assert.deepEqual(f.state().roles, ['postgres', 'existing_role']);
  assert.equal(f.calls().filter(c => c.sql?.startsWith('DROP ROLE')).length, 0);
});

test('shim preserva nomes anteriores e limpa múltiplos roles novos, inclusive com espaço', t => {
  const f = fixture(t, { previous: ['postgres', 'existing role'], current: ['postgres', 'existing role', 'new role', 'new_role'] });
  assert.equal(f.cleanup().status, 0);
  assert.deepEqual(f.state().roles, ['postgres', 'existing role']);
  assert.equal(f.calls().filter(c => c.sql?.startsWith('DROP ROLE')).length, 2);
});

test('shim não cria banco nem snapshot enganoso quando a consulta inicial de roles falha', t => {
  const f = fixture(t);
  const before = f.state();
  const result = f.run(SHIM, ['run', '--name', 'fixture-next'], { REVIEW_FAIL_ROLE_QUERY: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /falha.*capturar.*snapshot.*roles/i);
  assert.deepEqual(f.state(), before);
  assert.equal(fs.existsSync(path.join(f.stateDir, 'fixture-next.db')), false);
  assert.equal(fs.existsSync(path.join(f.stateDir, 'fixture-next.roles')), false);
  assert.equal(f.calls().filter(c => /^(CREATE|DROP) /.test(c.sql || '')).length, 0);
});

test('shim preserva estado e roles se a listagem atual falha, permitindo nova limpeza', t => {
  const f = fixture(t);
  const result = f.run(SHIM, ['rm', '-f', 'fixture'], { REVIEW_FAIL_ROLE_QUERY: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /falha.*listar.*roles/i);
  assert.deepEqual(f.state().roles, ['postgres', 'existing_role', 'new_role']);
  assert.equal(fs.existsSync(f.marker), true);
  assert.equal(fs.existsSync(f.rolesFile), true);
  assert.equal(f.calls().filter(c => c.sql?.startsWith('DROP ROLE')).length, 0);
  assert.equal(f.cleanup().status, 0);
  assert.deepEqual(f.state(), { databases: [], roles: ['postgres', 'existing_role'] });
});

test('shim captura e usa o snapshot da mesma invocação sem atingir outro banco', t => {
  const f = fixture(t);
  const before = f.state();
  assert.equal(f.run(SHIM, ['run', '--name', 'fixture-next']).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.stateDir, 'fixture-next.roles'), 'utf8').trim().split('\n').sort(), [...before.roles].sort());
  assert.equal(f.run(SHIM, ['rm', '-f', 'fixture-next']).status, 0);
  assert.deepEqual(f.state(), before);
});

test('shim propaga falha do CREATE DATABASE sem shimid e preserva estado para limpeza', t => {
  const f = fixture(t);
  const before = f.state();
  const result = f.run(SHIM, ['run', '--name', 'fixture-next'], { REVIEW_FAIL_CREATE_DATABASE: '1' });
  assert.equal(result.status, 37);
  assert.doesNotMatch(result.stdout, /shimid/);
  assert.match(result.stderr, /falha.*criar.*banco/i);
  assert.deepEqual(f.state(), before);
  assert.equal(fs.readFileSync(path.join(f.stateDir, 'fixture-next.db'), 'utf8'), 'shim_fixture_next');
  assert.deepEqual(fs.readFileSync(path.join(f.stateDir, 'fixture-next.roles'), 'utf8').trim().split('\n').sort(), [...before.roles].sort());
  assert.equal(f.run(SHIM, ['rm', '-f', 'fixture-next']).status, 0);
  assert.deepEqual(f.state(), before);
});

test('shim aborta antes do DDL quando o diretório de estado não pode ser criado', t => {
  const f = fixture(t);
  const badState = path.join(f.dir, 'state-is-a-file');
  fs.writeFileSync(badState, 'fixture');
  const before = f.state();
  const result = f.run(SHIM, ['run', '--name', 'fixture-next'], { DOCKER_SHIM_STATE_DIR: badState });
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.state(), before);
  assert.equal(f.calls().filter(c => /^(CREATE|DROP) /.test(c.sql || '')).length, 0);
});

for (const extension of ['roles', 'db']) {
  test(`shim não cria banco quando o destino .${extension} impede persistir o snapshot`, t => {
    const f = fixture(t);
    const before = f.state();
    fs.mkdirSync(path.join(f.stateDir, `fixture-next.${extension}`));
    const result = f.run(SHIM, ['run', '--name', 'fixture-next']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(f.state(), before);
    assert.equal(f.calls().filter(c => /^(CREATE|DROP) /.test(c.sql || '')).length, 0);
    assert.equal(fs.existsSync(path.join(f.stateDir, 'fixture-next.db')) && fs.statSync(path.join(f.stateDir, 'fixture-next.db')).isFile(), false);
  });
}

test('shim não publica snapshot parcial quando a escrita falha', t => {
  const f = fixture(t);
  const before = f.state();
  const shellEnv = path.join(f.dir, 'fail-snapshot-write.sh');
  // Injeta erro após saída parcial apenas no printf do snapshot; mensagens e
  // sanitização seguem usando o builtin. Nenhum disco real é preenchido.
  fs.writeFileSync(shellEnv, `printf() {
    if [[ "$1" == '%s\\n' ]]; then builtin printf '%s' 'partial_role'; return 1; fi
    builtin printf "$@"
  }\n`);
  const result = f.run(SHIM, ['run', '--name', 'fixture-next'], { BASH_ENV: shellEnv });
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.state(), before);
  assert.equal(fs.existsSync(path.join(f.stateDir, 'fixture-next.db')), false);
  assert.equal(fs.existsSync(path.join(f.stateDir, 'fixture-next.roles')), false);
  assert.equal(f.calls().filter(c => /^(CREATE|DROP) /.test(c.sql || '')).length, 0);
});

const BOOTSTRAP = 'connection to server on socket fixture failed: FATAL';
const wrapperCases = [
  ['sucesso executa uma vez', [[0, 'OK']], 6, 0, 1],
  ['falha SQL não repete e mantém exit code', [[17, 'FAIL: SQL assertion']], 6, 17, 1],
  ['bootstrap falho pode repetir', [[39, BOOTSTRAP], [0, 'OK']], 6, 0, 2],
  ['bootstrap respeita limite de seis tentativas', [[39, BOOTSTRAP]], 6, 39, 6],
  ['bootstrap respeita limite explícito de uma tentativa', [[39, BOOTSTRAP]], 1, 39, 1],
];
for (const [name, outcomes, attempts, status, count] of wrapperCases) {
  test(`wrapper: ${name}`, t => {
    const f = fixture(t);
    const counter = path.join(f.dir, 'counter.json');
    const command = f.executable('contract', `
      const fs=require('node:fs');const file=process.env.REVIEW_COUNTER;
      const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{count:0,args:[]};
      state.count++;state.args.push(process.argv.slice(2));fs.writeFileSync(file,JSON.stringify(state));
      const outcomes=JSON.parse(process.env.REVIEW_OUTCOMES);const outcome=outcomes[Math.min(state.count-1,outcomes.length-1)];
      console.log(outcome[1]);process.exit(outcome[0]);
    `);
    const result = f.run(WRAPPER, [command, 'fixture with spaces', '--mode=rollback'], {
      REVIEW_COUNTER: counter, REVIEW_OUTCOMES: JSON.stringify(outcomes),
      DISPOSABLE_PG_ATTEMPTS: String(attempts), REVIEW_TEST_IMAGE: 'postgres:offline-fixture',
    });
    assert.equal(result.status, status, result.stderr);
    const saved = JSON.parse(fs.readFileSync(counter, 'utf8'));
    assert.equal(saved.count, count);
    for (const args of saved.args) assert.deepEqual(args, ['fixture with spaces', '--mode=rollback']);
  });
}
