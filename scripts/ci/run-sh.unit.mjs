import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runSh = fileURLToPath(new URL('../maintenance/run.sh', import.meta.url));

test('run.sh: diretorio de estado inacessivel emite JSON failed em vez de abortar cru', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'maintenance-run-sh-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  // ".local" existe como ARQUIVO, nao diretorio: "mkdir -p $HOME/.local/state/..."
  // falha com ENOTDIR mesmo para root (chmod 000 nao bloqueia root neste sandbox).
  await writeFile(path.join(home, '.local'), 'nao e um diretorio');

  const result = spawnSync('/usr/bin/sh', [runSh], {
    env: { ...process.env, HOME: home, XDG_STATE_HOME: undefined },
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.status, 'failed');
  assert.match(parsed.message, /diretorio de estado inacessivel/);
});

test('run.sh: state dir valido segue para a checagem de flock (nao aborta cru)', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'maintenance-run-sh-ok-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  // PATH minimo com mkdir/chmod mas SEM flock: prova que o script passou
  // da guarda de mkdir/chmod (que sairia com exit 2) e chegou na checagem
  // seguinte, sem deixar chegar a executar run.mjs de verdade contra este repo.
  const fakeBin = await mkdtemp(path.join(os.tmpdir(), 'maintenance-fakebin-'));
  t.after(() => rm(fakeBin, { recursive: true, force: true }));
  await symlink('/usr/bin/mkdir', path.join(fakeBin, 'mkdir'));
  await symlink('/usr/bin/chmod', path.join(fakeBin, 'chmod'));

  const result = spawnSync('/usr/bin/sh', [runSh], {
    env: { ...process.env, HOME: home, XDG_STATE_HOME: undefined, PATH: fakeBin },
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.status, 'failed');
  assert.match(parsed.message, /flock/);
});
