import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// jssecurity:S5145 (log injection) — a linha 40 do validador imprime o corpo da
// resposta REST (dado não-confiável) no console.error. Um `\n` no corpo não pode
// forjar uma linha nova no log. Executa-se o script de verdade (child process)
// com um `fetch` stubbed que devolve um corpo malicioso, e exige-se uma linha só.
// Mesmo padrão de scripts/ci/github-settings-guard.unit.mjs.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'team-chat-db-validate.mjs');

const FETCH_STUB = [
  "globalThis.fetch = async () => ({",
  "  ok: false,",
  "  status: 500,",
  "  json: async () => ({}),",
  "  text: async () => 'corpo-vindo-do-rest\\n::error::forged-by-body',",
  "});",
  "",
].join('\n');

describe('team-chat-db-validate: log injection (jssecurity:S5145)', () => {
  it('neutraliza quebras de linha do corpo REST (linha 40)', () => {
    const stub = 'data:text/javascript,' + encodeURIComponent(FETCH_STUB);
    const res = spawnSync(process.execPath, ['--import', stub, SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_URL: 'https://stub.invalid', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' },
    });
    const out = `${res.stdout}${res.stderr}`;
    const linhas = out.split('\n');

    const linhaErro = linhas.find((l) => l.includes('team_conversations') && l.includes('HTTP 500'));
    assert.ok(linhaErro, `linha de erro da tabela ausente na saída:\n${out}`);
    assert.ok(
      linhaErro.includes('corpo-vindo-do-rest ::error::forged-by-body'),
      `valor não-confiável vazou cru na linha 40: ${JSON.stringify(linhaErro)}`,
    );
    assert.ok(
      !linhas.includes('::error::forged-by-body'),
      `linha de log forjada emitida:\n${out}`,
    );
  });
});
