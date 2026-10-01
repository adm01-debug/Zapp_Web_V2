import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findPullRequestSecretLeaks,
  findPushSecretLeaks,
  hasPullRequestTrigger,
  hasPushTriggerUnrestricted,
  scanWorkflowDirectory,
} from './check-pr-workflow-secrets.mjs';

test('reconhece pull_request em bloco e formato inline', () => {
  assert.equal(hasPullRequestTrigger('on:\n  push:\n  pull_request:\n'), true);
  assert.equal(hasPullRequestTrigger('on: [push, pull_request]\n'), true);
  assert.equal(hasPullRequestTrigger('on:\n  workflow_dispatch:\n'), false);
});

test('rejeita secret privilegiado em qualquer trecho de workflow de PR', () => {
  const workflow = `on:
  push:
  pull_request:
jobs:
  trusted-only:
    if: github.event_name == 'push'
    env:
      DATABASE_URL: \${{ secrets.DESTINO_URL }}
`;

  assert.deepEqual(findPullRequestSecretLeaks(workflow, 'db.yml'), [
    { file: 'db.yml', line: 8, secret: 'DESTINO_URL' },
  ]);
});

test('permite somente valores Supabase explicitamente publicos', () => {
  const workflow = `on:
  pull_request:
env:
  URL: \${{ secrets.VITE_SUPABASE_URL }}
  KEY: \${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
`;

  assert.deepEqual(findPullRequestSecretLeaks(workflow), []);
});

test('rejeita acesso dinamico e ao contexto completo de secrets', () => {
  const dynamicWorkflow = `on:
  pull_request_target:
env:
  VALUE: \${{ secrets[env.SECRET_NAME] }}
`;
  const wholeContextWorkflow = `on:
  pull_request:
steps:
  - run: echo \${{ toJSON(secrets) }}
`;

  assert.equal(findPullRequestSecretLeaks(dynamicWorkflow)[0]?.secret, 'dynamic secrets[...] access');
  assert.equal(findPullRequestSecretLeaks(wholeContextWorkflow)[0]?.secret, 'whole secrets context');
});

test('ignora comentarios e workflows sem trigger de PR', () => {
  assert.deepEqual(findPullRequestSecretLeaks('# secrets.DESTINO_URL\non:\n  pull_request:\n'), []);
  assert.deepEqual(findPullRequestSecretLeaks('on:\n  workflow_dispatch:\nenv:\n  DB: ${{ secrets.DESTINO_URL }}\n'), []);
});

// --- hasPushTriggerUnrestricted ---

test('hasPushTriggerUnrestricted: escalar on: push', () => {
  assert.equal(hasPushTriggerUnrestricted('on: push\n'), true);
  assert.equal(hasPushTriggerUnrestricted('on: push # comentario\n'), true);
});

test('hasPushTriggerUnrestricted: array inline on: [push]', () => {
  assert.equal(hasPushTriggerUnrestricted('on: [push]\n'), true);
  assert.equal(hasPushTriggerUnrestricted('on: [push, pull_request]\n'), true);
});

test('hasPushTriggerUnrestricted: push: sem branches (irrestrito)', () => {
  const workflow = 'on:\n  push:\n  workflow_dispatch:\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), true);
});

test('hasPushTriggerUnrestricted: push: {} (objeto vazio inline)', () => {
  const workflow = 'on:\n  push: {}\n  workflow_dispatch:\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), true);
});

test('hasPushTriggerUnrestricted: push: null e push: ~ (irrestrito)', () => {
  assert.equal(hasPushTriggerUnrestricted('on:\n  push: null\n'), true);
  assert.equal(hasPushTriggerUnrestricted('on:\n  push: ~\n'), true);
});

test('hasPushTriggerUnrestricted: push restrito a branches: [main] — seguro', () => {
  const workflow = 'on:\n  push:\n    branches: [main]\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), false);
});

test('hasPushTriggerUnrestricted: push restrito a branches: ["main"] — seguro', () => {
  const workflow = 'on:\n  push:\n    branches: ["main"]\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), false);
});

test('hasPushTriggerUnrestricted: push restrito a branches: [\'main\'] — seguro', () => {
  const workflow = "on:\n  push:\n    branches: ['main']\n";
  assert.equal(hasPushTriggerUnrestricted(workflow), false);
});

test('hasPushTriggerUnrestricted: push restrito a branches-ignore (irrestrito)', () => {
  const workflow = 'on:\n  push:\n    branches-ignore: [main]\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), true);
});

test('hasPushTriggerUnrestricted: sem trigger push', () => {
  assert.equal(hasPushTriggerUnrestricted('on:\n  pull_request:\n'), false);
  assert.equal(hasPushTriggerUnrestricted('on:\n  workflow_dispatch:\n'), false);
});

test('hasPushTriggerUnrestricted: push com branches: [main] mas tambem com tags — irrestrito', () => {
  const workflow = 'on:\n  push:\n    branches: [main]\n    tags: ["v*"]\n';
  assert.equal(hasPushTriggerUnrestricted(workflow), true);
});

// --- findPushSecretLeaks ---

test('findPushSecretLeaks: push irrestrito com secret — detecta', () => {
  const workflow = `on:
  push:
env:
  DB: \${{ secrets.DESTINO_URL }}
`;
  assert.deepEqual(findPushSecretLeaks(workflow, 'bad.yml'), [
    { file: 'bad.yml', line: 4, secret: 'DESTINO_URL' },
  ]);
});

test('findPushSecretLeaks: push restrito a main com secret — nao detecta', () => {
  const workflow = `on:
  push:
    branches: [main]
env:
  DB: \${{ secrets.DESTINO_URL }}
`;
  assert.deepEqual(findPushSecretLeaks(workflow, 'e2e-logado.yml'), []);
});

test('findPushSecretLeaks: permite secrets publicos mesmo em push irrestrito', () => {
  const workflow = `on:
  push:
env:
  URL: \${{ secrets.VITE_SUPABASE_URL }}
`;
  assert.deepEqual(findPushSecretLeaks(workflow), []);
});

// --- dedup: pull_request + push irrestrito no mesmo workflow ---

test('scanWorkflowDirectory nao duplica violations quando workflow tem pull_request e push', () => {
  // Simula dois chamadas que retornariam o mesmo violation
  const source = `on:\n  push:\n  pull_request:\nenv:\n  DB: \${{ secrets.DESTINO_URL }}\n`;
  const prLeaks = findPullRequestSecretLeaks(source, 'dup.yml');
  const pushLeaks = findPushSecretLeaks(source, 'dup.yml');
  // Ambos devem encontrar a mesma violacao
  assert.equal(prLeaks.length, 1);
  assert.equal(pushLeaks.length, 1);
  assert.deepEqual(prLeaks[0], pushLeaks[0]);
  // scanWorkflowDirectory deve desduplicar (teste indireto — o ultimo teste de integracao
  // valida contra o diretorio real que tem ci.yml com ambos os triggers)
});

test('repositorio atual nao vincula secrets privilegiados a workflows de PR ou push irrestrito', () => {
  const workflowsDirectory = fileURLToPath(new URL('../../.github/workflows', import.meta.url));
  assert.deepEqual(scanWorkflowDirectory(workflowsDirectory), []);
});
