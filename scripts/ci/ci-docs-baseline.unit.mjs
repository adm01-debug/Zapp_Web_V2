/**
 * ci-docs-baseline.unit.mjs — testes de paridade entre a documentação de CI
 * (PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md) e o repositório real.
 *
 * Roda como parte do job "Unit Tests" no CI.
 * Falha → o PR não pode mergear.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIR_WF = join(ROOT, '.github', 'workflows');
const PLANO = join(
  ROOT,
  'docs',
  'audits',
  'PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md',
);
const DB_MIGRATE = join(ROOT, '.github', 'workflows', 'db-migrate.yml');
const BUN_LOCK = join(ROOT, 'bun.lock');
const CONTRIBUTING = join(ROOT, 'CONTRIBUTING.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lê o PLANO e devolve um Map<etapa, { linha, status }> para as etapas que
 * têm uma linha de tabela no formato:
 *   | **ENN** … | `[x]` … | … | … |
 */
function reconciliacao(texto) {
  const mapa = new Map();
  // Aceita tanto `**E62**` quanto `E62` na primeira célula
  const re =
    /^\|\s*\*{0,2}(E\d+)\*{0,2}[^|]*\|\s*`?\[([~x ])\]`?\s*(\*{0,2}\w[^|]*)\|([^|]+)\|([^|]+)\|/;
  for (const linha of texto.split('\n')) {
    const m = linha.match(re);
    if (!m) continue;
    mapa.set(m[1], {
      status: m[2].trim(),
      resumo: m[3].trim(),
      linha: m[4].trim(),
      observacao: m[5].trim(),
    });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('ci-docs-baseline', () => {
  // -------------------------------------------------------------------------
  // W01 — inventário de workflows
  // -------------------------------------------------------------------------
  describe('W01: inventário de workflows', () => {
    let arquivos;

    before(async () => {
      const entries = await readdir(DIR_WF);
      arquivos = entries.filter((f) => f.endsWith('.yml'));
    });

    it('deve haver exatamente 16 arquivos .yml em .github/workflows/', () => {
      assert.equal(
        arquivos.length,
        16,
        `Encontrado(s) ${arquivos.length} arquivo(s): ${arquivos.join(', ')}`,
      );
    });

    it('os 16 workflows documentados devem existir no disco', () => {
      const esperados = [
        'auto-update-pr-branch.yml',
        'branch-hygiene-audit.yml',
        'ci.yml',
        'codeql.yml',
        'crm-sync-worker.yml',
        'db-guard.yml',
        'db-live-guard.yml',
        'db-migrate.yml',
        'deploy-functions.yml',
        'e2e-logado.yml',
        'e2e-talkx.yml',
        'settings-guard.yml',
        'supabase-sync.yml',
        'talkx-status-regen.yml',
        'targeted-ledger-evidence.yml',
        'types-sync.yml',
      ];
      for (const wf of esperados) {
        assert.ok(
          arquivos.includes(wf),
          `Workflow esperado não encontrado: ${wf}`,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // W02 — required checks documentados
  // -------------------------------------------------------------------------
  describe('W02: required checks documentados no PLANO', () => {
    let plano;

    before(async () => {
      plano = await readFile(PLANO, 'utf8');
    });

    const CHECKS = [
      '🔍 Lint & TypeCheck',
      '🧪 Unit Tests',
      '🏗️ Build',
      '🔒 Security Audit',
      'Contrato DB offline',
      '🎭 E2E Tests (Playwright)',
    ];

    for (const check of CHECKS) {
      it(`PLANO menciona o required check "${check}"`, async () => {
        // lazily load so before() já rodou
        if (!plano) plano = await readFile(PLANO, 'utf8');
        assert.ok(
          plano.includes(check),
          `Check "${check}" não encontrado no PLANO`,
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // W03 — ci.yml menciona os 6 required checks
  // -------------------------------------------------------------------------
  describe('W03: ci.yml define os job-names dos 6 required checks', () => {
    let ciYml;

    before(async () => {
      ciYml = await readFile(join(DIR_WF, 'ci.yml'), 'utf8');
    });

    // Mapeamento nome-do-check → fragmento esperado no YAML
    const JOB_FRAGMENTS = [
      ['Lint & TypeCheck', 'Lint & TypeCheck'],
      ['Unit Tests', 'Unit Tests'],
      ['Build', 'Build'],
      ['Security Audit', 'Security Audit'],
      ['Contrato DB offline', 'Contrato DB offline'],
      ['E2E Tests', 'E2E Tests'],
    ];

    for (const [label, fragment] of JOB_FRAGMENTS) {
      it(`ci.yml contém "${label}"`, async () => {
        if (!ciYml) ciYml = await readFile(join(DIR_WF, 'ci.yml'), 'utf8');
        assert.ok(
          ciYml.includes(fragment),
          `"${fragment}" não encontrado em ci.yml`,
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // E62 / E76 — números citados conferem com o repositório
  // -------------------------------------------------------------------------
  describe('E62/E76: os números citados conferem com o repositório', () => {
    it('E62/E76: os numeros citados conferem com o repositorio', async () => {
      const plano = await readFile(PLANO, 'utf8');
      const rec = reconciliacao(plano);

      // ---- E62: linha de db-migrate.yml
      const linhasDb = (await readFile(DB_MIGRATE, 'utf8')).split('\n');
      if (linhasDb.at(-1) === '') linhasDb.pop();

      const e62 = rec.get('E62');
      assert.ok(e62, 'Etapa E62 não encontrada no PLANO');
      assert.ok(
        e62.linha.includes(`${linhasDb.length} linhas`),
        `E62 deve citar "${linhasDb.length} linhas"; linha atual: "${e62.linha}"`,
      );
      assert.match(
        e62.linha,
        /guardas de DB|pós-apply/i,
        'E62 deve mencionar guardas de DB',
      );

      // ---- E76: versão do Playwright no bun.lock e nos 3 workflows
      const lock = await readFile(BUN_LOCK, 'utf8');
      assert.ok(
        /playwright@1\.64\.1/.test(lock),
        'bun.lock deve conter playwright@1.64.1',
      );
      assert.ok(
        /playwright-core@1\.64\.1/.test(lock),
        'bun.lock deve conter playwright-core@1.64.1',
      );
      assert.ok(
        /@playwright\/test@1\.64\.1/.test(lock),
        'bun.lock deve conter @playwright/test@1.64.1',
      );

      const tres = ['ci.yml', 'e2e-logado.yml', 'e2e-talkx.yml'];
      for (const f of tres) {
        const wf = await readFile(join(DIR_WF, f), 'utf8');
        assert.ok(
          wf.includes('playwright@1.64.1'),
          `${f} deve pinar playwright@1.64.1`,
        );
      }

      const e76 = rec.get('E76');
      assert.ok(e76, 'Etapa E76 não encontrada no PLANO');
      for (const f of tres) {
        assert.ok(
          e76.linha.includes(f),
          `E76 deve citar ${f}; linha atual: "${e76.linha}"`,
        );
      }
      assert.match(
        e76.linha,
        /1\.64\.1/,
        'E76 deve mencionar a versão 1.64.1',
      );
      assert.match(
        e76.linha,
        /não há mismatch/i,
        'E76 deve confirmar "não há mismatch"',
      );
    });
  });

  // -------------------------------------------------------------------------
  // W95 — CONTRIBUTING.md
  // -------------------------------------------------------------------------
  describe('W95: CONTRIBUTING.md está alinhado com as convenções do repo', () => {
    let contrib;

    before(async () => {
      contrib = await readFile(CONTRIBUTING, 'utf8');
    });

    it('menciona bun (não npm) como gerenciador de pacotes', async () => {
      if (!contrib) contrib = await readFile(CONTRIBUTING, 'utf8');
      assert.ok(
        contrib.toLowerCase().includes('bun'),
        'CONTRIBUTING.md deve mencionar bun',
      );
      // npm pode aparecer em contexto histórico, mas bun deve estar presente
    });

    it('nome do repositório está correto (Zapp_Web_V2)', async () => {
      if (!contrib) contrib = await readFile(CONTRIBUTING, 'utf8');
      assert.ok(
        contrib.includes('Zapp_Web_V2') || contrib.includes('zapp-web-v2'),
        'CONTRIBUTING.md deve referenciar o repositório Zapp_Web_V2 ou zapp-web-v2',
      );
    });

    it('menciona o padrão de branch dia/AAAA-MM-DD', async () => {
      if (!contrib) contrib = await readFile(CONTRIBUTING, 'utf8');
      assert.ok(
        contrib.includes('dia/') || contrib.includes('AAAA-MM-DD'),
        'CONTRIBUTING.md deve mencionar o padrão de branch dia/AAAA-MM-DD',
      );
    });

    it('menciona os 6 required checks', async () => {
      if (!contrib) contrib = await readFile(CONTRIBUTING, 'utf8');
      // Verifica se menciona pelo menos o conceito de required checks
      const temChecks =
        contrib.includes('required check') ||
        contrib.includes('checks obrigatórios') ||
        contrib.includes('Lint & TypeCheck') ||
        contrib.includes('Unit Tests');
      assert.ok(
        temChecks,
        'CONTRIBUTING.md deve mencionar os required checks ou exemplos deles',
      );
    });

    it('não menciona branch develop como fluxo principal', async () => {
      if (!contrib) contrib = await readFile(CONTRIBUTING, 'utf8');
      // "develop" pode aparecer como anti-exemplo; não deve ser recomendado
      const lines = contrib.split('\n');
      const problemLines = lines.filter(
        (l) =>
          /\bdevelop\b/.test(l) &&
          !l.trim().startsWith('#') && // ignora headings
          !/não|nao|nunca|evite|avoid|instead/i.test(l),
      );
      assert.equal(
        problemLines.length,
        0,
        `CONTRIBUTING.md menciona "develop" de forma afirmativa: ${problemLines.join(' | ')}`,
      );
    });
  });
});
