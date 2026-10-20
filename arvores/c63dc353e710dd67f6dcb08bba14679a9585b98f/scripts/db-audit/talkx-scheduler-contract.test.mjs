import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scheduler = await readFile(
  new URL('../../supabase/functions/talkx-scheduler/index.ts', import.meta.url),
  'utf8',
);

test('Talk X scheduler counts only explicitly accepted send starts', () => {
  assert.match(scheduler, /const result = await response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(scheduler, /const accepted = response\.ok[\s\S]*result as \{ success\?: unknown \}\)\.success === true/);
  assert.match(scheduler, /success: accepted/);
  assert.match(scheduler, /Scheduled campaign was not accepted/);
  assert.doesNotMatch(scheduler, /success:\s*response\.ok/);
});

// X015 — o handler passou a ser exportável (e o Deno.serve só sobe como entrypoint,
// senão o teste que importa o handler subiria um servidor).
test('X015 scheduler: handler exportado e Deno.serve atrás de import.meta.main', () => {
  assert.match(scheduler, /export async function handleTalkxScheduler\(/);
  assert.match(scheduler, /if \(import\.meta\.main\)\s*\{\s*Deno\.serve\(/);
});

// X015 — credencial: sem isto o handler aceitava qualquer chamada. O segredo do
// Vault é lido por const (o nome literal fica visível no contrato) e comparado em
// tempo constante contra x-cron-secret; a service key também passa.
test('X015 scheduler: exige x-cron-secret (Vault) ou service key, senão 401', () => {
  assert.match(scheduler, /req\.headers\.get\("x-cron-secret"\)/);
  assert.match(scheduler, /CRON_SECRET_RPC = "get_talkx_cron_secret"/);
  assert.match(scheduler, /timingSafeEqual\(/);
  assert.doesNotMatch(scheduler, /cronSecret\s*===\s*/);
  assert.match(scheduler, /error: "Unauthorized"[\s\S]*status: 401/);
});

test('X015 scheduler: AbortController de 10 s por chamada a talkx-send', () => {
  assert.match(scheduler, /TALKX_SEND_TIMEOUT_MS = 10_000/);
  assert.match(scheduler, /new AbortController\(\)/);
  assert.match(scheduler, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
});

test('X015 scheduler: teto de 10 campanhas por tick e 1 retomada por conexão', () => {
  assert.match(scheduler, /MAX_CAMPAIGNS_PER_TICK = 10/);
  assert.match(scheduler, /\.slice\(0, MAX_CAMPAIGNS_PER_TICK\)/);
  assert.match(scheduler, /MAX_RESUMES_PER_CONNECTION = 1/);
  assert.match(scheduler, /resumedConnections\.has\(connectionId\)/);
});

// X015 — o scheduler não tem mais responsabilidade sobre sending (é do tick X012).
test('X015 scheduler: não escreve status sending nem faz update de campanha', () => {
  assert.doesNotMatch(scheduler, /status:\s*["']sending["']/);
  assert.doesNotMatch(scheduler, /\.update\(/);
});
