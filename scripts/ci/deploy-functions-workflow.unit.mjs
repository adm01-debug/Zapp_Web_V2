import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');

test('full Edge deploy runs CRM secret preflight', () => {
  assert.match(
    workflow,
    /if \[ "\$FN" = "crm-integration" \] \|\| \[ -z "\$FN" \]; then/,
    'deploy-all must not bypass crm-integration preflight',
  );
});

test('rollback deploy is pinned to a historical ancestor and attests deployed SHA', () => {
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /git merge-base --is-ancestor "\$DEPLOYED_GIT_SHA" "\$GITHUB_SHA"/);
  assert.equal((workflow.match(/--git-sha "\$DEPLOYED_GIT_SHA"/g) || []).length, 2);
});
