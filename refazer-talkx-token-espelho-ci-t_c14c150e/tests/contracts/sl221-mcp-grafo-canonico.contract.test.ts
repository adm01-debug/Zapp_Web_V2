/**
 * Contrato do estado das etapas 099 (MCP server real read-only) e 100 (grafo de
 * conhecimento e docs canônicos) — cartão SL-221.
 *
 * O inventário de 2026-10-07 dizia "Sem supabase/functions/mcp; graphify-out ausente".
 * O teste trava só o que é durável na ponta de 2026-10-08 (base `dia/2026-10-08`):
 *
 *   1. a camada MCP do BANCO existe e tem gate: `mcp_exec`/`mcp_exec_many` endurecidos,
 *      `check-mcp-exec-acl.sql` + `.test.sh` executados pelo `db-guard.yml`;
 *   2. o tombstone `public-api` responde 410 e não carrega `service_role`. A ausência do
 *      servidor MCP HTTP é estado atual, registrado no doc canônico — não é contrato
 *      deste teste: o cartão que criar `supabase/functions/mcp-server` não quebra aqui;
 *   3. `graphify-out/` é cache por clone: o `.gitignore` ignora o diretório inteiro, então
 *      existir (ou não) na máquina de cada um não é defeito. O grafo versionado do
 *      projeto é `docs/reconciliation/evidence/graphify-graph.json.gz`, e o `sha256` do
 *      conteúdo descomprimido bate com o `graph_sha256` do manifesto assinado;
 *   4. todo doc de `docs/architecture/` carrega o cabeçalho canônico (Status + data ISO),
 *      critério de aceite da etapa 100 ("nenhum doc de arquitetura sem data ou sem status").
 *
 * Cada caso falha com mensagem que diz o que conferir no disco, sem derrubar a coleta.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const caminho = (rel: string) => join(raiz, rel);
const existe = (rel: string) => existsSync(caminho(rel));
const ler = (rel: string) => readFileSync(caminho(rel), 'utf8');

const DOC_CANONICO = 'docs/architecture/mcp-e-grafo-de-conhecimento.md';

describe('SL-221 · etapa 099 — superfície MCP', () => {
  it('`public-api` é tombstone 410 sem `service_role`', () => {
    const fonte = ler('supabase/functions/public-api/index.ts');
    expect(fonte).toContain('410');
    expect(fonte).toContain('Public API is disabled');
    expect(fonte, 'tombstone não pode ler credencial nem executar efeito').not.toContain('service_role');
  });

  it('a camada MCP do banco existe e o contrato de ACL está wireado no CI (db-guard)', () => {
    for (const migracao of [
      'supabase/migrations/20260827000100_security_revoke_mcp_exec_from_authenticated.sql',
      'supabase/migrations/20260829020000_mcp_exec_functions_harden.sql',
      'supabase/migrations/20260829020100_mcp_exec_functions_harden_stub.sql',
    ]) {
      expect(existe(migracao), `migration ausente: ${migracao}`).toBe(true);
    }
    expect(ler('supabase/migrations/20260829020000_mcp_exec_functions_harden.sql')).toContain(
      'search_path',
    );

    const contrato = 'scripts/db-audit/check-mcp-exec-acl.sql';
    const teste = 'scripts/db-audit/check-mcp-exec-acl.test.sh';
    expect(existe(contrato), `contrato ausente: ${contrato}`).toBe(true);
    expect(existe(teste), `teste ausente: ${teste}`).toBe(true);
    expect(ler(contrato)).toContain('mcp_exec');
    expect(
      ler('.github/workflows/db-guard.yml'),
      'o db-guard.yml precisa executar check-mcp-exec-acl.test.sh',
    ).toContain('check-mcp-exec-acl.test.sh');
  });
});

describe('SL-221 · etapa 100 — grafo de conhecimento e docs canônicos', () => {
  it('`graphify-out/` é ignorado pelo git (cache por clone, não versionado)', () => {
    const ignorados = ler('.gitignore')
      .split('\n')
      .map((linha) => linha.trim());
    expect(ignorados, '.gitignore precisa ignorar graphify-out/').toContain('graphify-out/');
  });

  it('o grafo versionado descomprime no sha256 assinado pelo manifesto', () => {
    const bruto = gunzipSync(readFileSync(caminho('docs/reconciliation/evidence/graphify-graph.json.gz')));
    const manifesto = JSON.parse(
      ler('docs/reconciliation/evidence/graphify_evidence_manifest.json'),
    ) as { graph_sha256: string };
    const sha = createHash('sha256').update(bruto).digest('hex');
    expect(sha, 'o grafo versionado divergiu do manifesto assinado').toBe(manifesto.graph_sha256);
  });

  it('todo doc de `docs/architecture/` carrega Status e data ISO (aceite da etapa 100)', () => {
    const docs = readdirSync(caminho('docs/architecture')).filter((nome) => nome.endsWith('.md'));
    expect(docs.length).toBeGreaterThan(1);
    const semCabecalho = docs.filter((nome) => {
      const texto = ler(join('docs/architecture', nome));
      const temStatus = /^> \*\*Status:\*\*/m.test(texto);
      const temData = /^> \*\*Atualizado em:\*\*\s*\d{4}-\d{2}-\d{2}/m.test(texto);
      return !temStatus || !temData;
    });
    expect(
      semCabecalho,
      'doc de arquitetura sem "> **Status:**" e "> **Atualizado em:** AAAA-MM-DD"',
    ).toEqual([]);
  });

  it('o doc canônico registra as etapas 099/100 e o que segue aberto', () => {
    expect(existe(DOC_CANONICO), `doc canônico ausente: ${DOC_CANONICO}`).toBe(true);
    const texto = ler(DOC_CANONICO);
    for (const marca of [
      '099',
      '100',
      'mcp-server',
      '[PROD]',
      'graphify_evidence_manifest.json',
      'docs/DICIONARIO-BANCO.md',
      'check-mcp-exec-acl.sql',
    ]) {
      expect(texto, `o doc canônico precisa registrar: ${marca}`).toContain(marca);
    }
  });
});
