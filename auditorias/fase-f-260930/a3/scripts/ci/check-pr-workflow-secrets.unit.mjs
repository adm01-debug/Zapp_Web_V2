import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findPullRequestSecretLeaks,
  hasPullRequestTrigger,
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

test('repositorio atual nao vincula secrets privilegiados a workflows de PR', () => {
  const workflowsDirectory = fileURLToPath(new URL('../../.github/workflows', import.meta.url));
  assert.deepEqual(scanWorkflowDirectory(workflowsDirectory), []);
});
