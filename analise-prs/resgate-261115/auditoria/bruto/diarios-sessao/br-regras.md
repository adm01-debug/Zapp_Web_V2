# Regras de Negócio — Análise de PRs

Fonte: `CLAUDE.md` (projeto `adm01-debug/Zapp_Web_V2`)

## CI — 6 checks obrigatórios para merge em `main`

1. `🔍 Lint & TypeCheck`
2. `🧪 Unit Tests`
3. `🏗️ Build`
4. `🔒 Security Audit`
5. `Contrato DB offline`
6. `🎭 E2E Tests (Playwright)`

`strict=true` na branch `main`: PR deve estar atualizada em relação à `main` antes de mergear.

## Método de merge

**Somente squash-merge.** Merge commit e rebase estão desabilitados no repositório.

## Escrita no GitHub

**Somente via MCP `GITHUB - MCP - FOREVER`** (`mcp__GITHUB_-_MCP_-_FOREVER__*`).
O MCP padrão (`mcp__github__*`) retorna 403 em operações de escrita.

## PRs draft

PRs com `draft: true` **não podem ser mergeadas**. O autor deve marcar como pronta.

## Arquivos proibidos

**PRs que tocam `.github/workflows/`** não devem ser mergeadas por agente. Esses arquivos contêm configurações de CI/CD sensíveis que requerem revisão humana.

## Banco de dados — DDL

Apenas migrations **aditivas** podem ser mergeadas por agente:
- Permitido: `CREATE TABLE`, nova coluna nullable, nova função, novo índice
- **Proibido**: `DROP`, `RENAME`, `ALTER TYPE`, `DELETE`/`UPDATE` em massa

## Banco SINGU (read-only)

`vpkmqeumtxhrwgawxdrl` — banco externo **somente leitura**. PRs que escrevem nele não devem ser mergeadas.

## Banco oficial do projeto

`tnnnlkbymytvtqngbbqh` (Supabase Cloud `tnnnlkbymytvtqngbbqh.supabase.co`)

## Bloqueio sistêmico identificado (2026-10-27)

O check `Contrato DB offline` falha em todas as PRs porque `types.ts` está sem 9 assinaturas de RPC.
O `supabase-usage-guard.mjs` reporta `novas: 12`.

PRs que corrigem isso (#2274, #2244) estão bloqueadas pela mesma falha → dependência circular.
Requer intervenção humana para desbloquear.
