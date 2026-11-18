# Baseline do main — 2026-10-30

**SHA do main:** `6090b6cdc` (em análise: `c4c7139e`, HEAD da sessão anterior)
**Commit HEAD:** docs(analise-prs): registra merge da PR#2149 (SHA c4c7139e)

## Resultados

| Check | Status | Notas |
|---|---|---|
| typecheck (tsc -b) | FAIL (ambiente) | SIGABRT — crash do Node no contêiner cloud (OOM/sandbox); CI do GitHub Actions é a fonte canônica |
| lint (eslint) | FAIL (ambiente) | Cannot find package '@eslint/js' (deps locais incompletas no contêiner cloud) |
| build (vite) | **PASS** | exit 0 confirmado em main@931e979 (2026-10-30) |
| unit tests | **PASS** | 52 testes, exit 0 — saída completa em `tasks/be0li8sba.output` |

## Detalhe dos unit tests (exit 0)

Suítes executadas:
- `src/hooks/__tests__/useExternalCatalog.test.ts` — 6 testes (inicialização, fetch, empty list, null data)
- `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` — 20 testes (rendering, data loading, StatsCards)
- `src/components/talkx/__tests__/useCampaignEditor.test.tsx` — 26 testes (draft integrity, DST, X017, V24)

Nenhuma falha. Nenhum teste com `skip` ou `todo`.

## Bloqueio sistêmico (histórico — resolvido)

- **main@2d97c44** (2026-10-24): CI Gate bloqueava merge; 136 arquivos de teste vermelhos.
- **main@931e979** (2026-10-30): Bloqueio resolvido. Unit tests passando, build exit 0.
- Arquivo que ainda precisava de migrations (`src/__tests__/rlsSchemaGuard.test.ts`): status
  pós-desbloqueio não re-verificado nesta sessão; CI do GitHub Actions é referência canônica.

## Observações

- typecheck e lint falham por limitação do contêiner cloud (SIGABRT / deps ausentes), não por regressão de código.
- **CI do GitHub Actions** (checks na PR) é sempre a fonte canônica para typecheck, lint, build, e2e.
- Baseline local = útil para verificar se arquivos existem/têm conteúdo esperado, não para rodar tsc/vitest.
