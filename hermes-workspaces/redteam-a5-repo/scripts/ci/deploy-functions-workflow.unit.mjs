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

test('fetch-link-preview deploy fails closed without a valid secure egress configuration', () => {
  assert.match(workflow, /PREVIEW_EGRESS_PROXY_URL: \$\{\{ secrets\.PREVIEW_EGRESS_PROXY_URL \}\}/);
  assert.match(workflow, /PREVIEW_EGRESS_SHARED_SECRET: \$\{\{ secrets\.PREVIEW_EGRESS_SHARED_SECRET \}\}/);
  assert.match(
    workflow,
    /if \[ "\$FN" = "fetch-link-preview" \] \|\| \[ -z "\$FN" \]; then/,
    'deploy-all must not bypass fetch-link-preview preflight',
  );
  assert.match(workflow, /PREVIEW_EGRESS_PROXY_URL e PREVIEW_EGRESS_SHARED_SECRET sao obrigatorios/);
  assert.match(workflow, /endpoint\.protocol !== 'https:'/);
  assert.match(workflow, /!\/\(\?:\^\|\\\/\)v1\\\/fetch\$\/\.test\(endpoint\.pathname\)/);
  assert.match(workflow, /PREVIEW_EGRESS_SHARED_SECRET\.length < 32/);
  assert.match(workflow, /supabase secrets set[\s\\]+PREVIEW_EGRESS_PROXY_URL=/);
});

test('secure egress route accepts a Traefik prefix only on a path boundary', () => {
  const route = /(?:^|\/)v1\/fetch$/;
  assert.equal(route.test('/v1/fetch'), true);
  assert.equal(route.test('/preview-egress/v1/fetch'), true);
  assert.equal(route.test('/preview-egressv1/fetch'), false);
  assert.equal(route.test('/v1/fetch/extra'), false);
});

test('rollback deploy is pinned to a historical ancestor and attests deployed SHA', () => {
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /git merge-base --is-ancestor "\$DEPLOYED_GIT_SHA" "\$GITHUB_SHA"/);
  assert.equal((workflow.match(/--git-sha "\$DEPLOYED_GIT_SHA"/g) || []).length, 2);
});
