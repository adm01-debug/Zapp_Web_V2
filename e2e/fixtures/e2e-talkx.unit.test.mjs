import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildE2EDraftCleanupUrl,
  cleanupE2EDraftCampaigns,
  E2E_TALKX_EXECUTION_ID,
  createE2ETalkXDraftName,
} from './e2e-talkx.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const userId = '550e8400-e29b-41d4-a716-446655440000';

function fakePage({ identity = { accessToken: 'test-token', userId }, responseStatus = 204 } = {}) {
  const requests = [];
  let evaluations = 0;
  return {
    requests,
    get evaluations() {
      return evaluations;
    },
    async evaluate() {
      evaluations += 1;
      return identity;
    },
    request: {
      async delete(url, options) {
        requests.push({ url, options });
        return { ok: () => responseStatus >= 200 && responseStatus < 300, status: () => responseStatus };
      },
    },
  };
}

test('Auth E2E selectors reflect the current public access page, not removed signup UI', async () => {
  const [spec, page] = await Promise.all([
    readFile(resolve(root, 'e2e/auth.spec.ts'), 'utf8'),
    readFile(resolve(root, 'src/pages/Auth.tsx'), 'utf8'),
  ]);

  assert.match(page, /aria-label="Acesso à plataforma"/);
  assert.match(page, />\s*ZAPP Web\s*</);
  assert.match(spec, /getByRole\('main', \{ name: \/acesso à plataforma/i);
  assert.match(spec, /getByRole\('heading', \{ name: 'ZAPP Web', exact: true \}\)/);
  assert.match(spec, /getByRole\('textbox', \{ name: 'Email' \}\)/);
  assert.doesNotMatch(spec, /Bem-vindo de volta|signup tab|Criar Conta/);
  assert.match(spec, /validity\.typeMismatch/);
});

test('execution marker is unique-shaped and cleanup URL uses only exact, narrow filters', async () => {
  assert.match(E2E_TALKX_EXECUTION_ID, /^(?:gha-[a-f0-9]{32}|local-[0-9a-f-]{36})$/);
  const draftName = createE2ETalkXDraftName('firefox-talkx', 'campaign-wizard-test-id');
  assert.equal(draftName, createE2ETalkXDraftName('firefox-talkx', 'campaign-wizard-test-id'));
  assert.notEqual(draftName, createE2ETalkXDraftName('webkit-talkx', 'campaign-wizard-test-id'));
  assert.notEqual(draftName, createE2ETalkXDraftName('firefox-talkx', 'another-test-id'));

  const url = buildE2EDraftCleanupUrl('https://supabase.invalid', draftName, userId);
  assert.equal(url.pathname, '/rest/v1/talkx_campaigns');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['created_by', 'name', 'status']);
  assert.equal(url.searchParams.get('name'), `eq.${draftName}`);
  assert.equal(url.searchParams.get('created_by'), `eq.${userId}`);
  assert.equal(url.searchParams.get('status'), 'eq.draft');
  assert.doesNotMatch(url.search, /(?:like|ilike|\bor\b|\*|%25)/i);
});

test('GitHub execution identity is stable across retries and distinct across attempts/jobs', () => {
  const source = "import { E2E_TALKX_EXECUTION_ID } from './e2e/fixtures/e2e-talkx.ts'; console.log(E2E_TALKX_EXECUTION_ID);";
  const executionId = (runAttempt, job) =>
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', source],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_RUN_ID: '123456789',
          GITHUB_RUN_ATTEMPT: String(runAttempt),
          GITHUB_WORKFLOW: 'e2e-logado',
          GITHUB_JOB: job,
        },
      },
    ).trim();

  const first = executionId(1, 'e2e-logado');
  assert.equal(first, executionId(1, 'e2e-logado'));
  assert.notEqual(first, executionId(2, 'e2e-logado'));
  assert.notEqual(first, executionId(1, 'e2e-logado-firefox'));
});

test('cleanup sends one exact DELETE with redirects disabled and propagates failure', async () => {
  const page = fakePage();
  const draftName = createE2ETalkXDraftName('firefox-talkx', 'campaign-wizard-test-id');
  await cleanupE2EDraftCampaigns(page, draftName);

  assert.equal(page.requests.length, 1);
  const request = page.requests[0];
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('name'), `eq.${draftName}`);
  assert.equal(url.searchParams.get('created_by'), `eq.${userId}`);
  assert.equal(url.searchParams.get('status'), 'eq.draft');
  assert.equal(request.options.maxRedirects, 0);

  const failingPage = fakePage({ responseStatus: 403 });
  await assert.rejects(
    cleanupE2EDraftCampaigns(failingPage, draftName),
    /cleanup exato do draft falhou: HTTP 403/,
  );
  assert.equal(failingPage.requests.length, 1);

  // Um 302 nunca deve seguir o Location de uma resposta potencialmente fora
  // do projeto; Playwright está configurado para não seguir redirects.
  const redirectPage = fakePage({ responseStatus: 302 });
  await assert.rejects(
    cleanupE2EDraftCampaigns(redirectPage, draftName),
    /cleanup exato do draft falhou: HTTP 302/,
  );
  assert.equal(redirectPage.requests[0].options.maxRedirects, 0);
});

test('cleanup fails closed on generic names and invalid creator IDs before DELETE', async () => {
  assert.throws(
    () => buildE2EDraftCleanupUrl('https://supabase.invalid', '[E2E] Campanha de Teste', userId),
    /esta execução E2E/,
  );
  assert.throws(
    () =>
      buildE2EDraftCleanupUrl(
        'https://supabase.invalid',
        '[E2E TalkX:local-11111111-1111-4111-8111-111111111111:aaaaaaaaaaaaaaaaaaaaaaaa] Campanha de Teste',
        userId,
      ),
    /esta execução E2E/,
  );

  const invalidIdentityPage = fakePage({ identity: { accessToken: 'test-token', userId: 'not-a-uuid' } });
  const draftName = createE2ETalkXDraftName('firefox-talkx', 'campaign-wizard-test-id');
  await assert.rejects(cleanupE2EDraftCampaigns(invalidIdentityPage, draftName), /UUID do usuário/);
  assert.equal(invalidIdentityPage.evaluations, 1);
  assert.equal(invalidIdentityPage.requests.length, 0);
});

test('the workflow labels its Auth-only project and discloses missing authenticated campaign coverage', async () => {
  const workflow = await readFile(resolve(root, '.github/workflows/e2e-talkx.yml'), 'utf8');
  assert.match(workflow, /E2E Talk X \(visual\/launch \+ Auth smoke\)/);
  assert.match(workflow, /Auth-only/);
  assert.match(workflow, /`talkx\.spec\.ts`\) não roda neste check/);
  assert.match(workflow, /--project=chromium-talkx-visual/);
  assert.match(workflow, /--project=chromium-talkx-launch/);
  assert.doesNotMatch(workflow, /^\s*-\s*['"]?e2e\/auth\.spec\.ts['"]?\s*$/mu);
});
