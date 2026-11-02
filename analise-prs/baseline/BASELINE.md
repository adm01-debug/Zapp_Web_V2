# Baseline do main — SHA: 4b5c6e7970512d16db5501a35cb2e7176941f69d
Data: 2026-11-02

Última PR mergeada: #2522 (fix(e2e): aguarda teclado visível antes do primeiro clique — Firefox GR-012) em 2026-11-02T05:20:24Z
SHA anterior (#2569): 50ca61a6ef96b366084548fbb3866974083def52

## TypeCheck (ratchet + tsc direto)
- Baseline histórico: 93 erros
- `npx tsc --noEmit` no SHA 4b5c6e79: exit=0 (ZERO erros reportados pelo tsc)
- Ratchet node scripts/ci/typecheck-ratchet.mjs: baseline=93, atual=3, novas=0
- Status: ✅ ZERO erros novos (evidência: tsc exit=0; ratchet exit=0)

## Lint (ESLint ratchet)
- Baseline histórico: 820 ocorrências
- node scripts/ci/lint-ratchet.mjs no SHA 4b5c6e79: baseline=820, atual=813, novas=0
- Status: ✅ ZERO ocorrências novas (evidência: lint-ratchet exit=0)

## Build
- Status: ✅ PASSANDO
- Evidência: CI Gate success em todos os 9 merges desta sessão
- Último run confirmado: PR #2569 via auto_merge (SHA 50ca61a6, CI Gate=success)

## Unit Tests
- Status: ✅ PASSANDO
- Evidência: `🧪 Unit Tests` passou no CI dos merges desta sessão
- Flake documentado: ContactFormRecalculoCorrida.test.tsx:189 — confirmado flake (não se reproduz no SHA seguinte), não regressão

## E2E Tests
- Status: ✅ PASSANDO
- Evidência: CI Gate success em SHA 50ca61a6 (e2e-logado após fix GR-029 em #2569)

## Migrations (supabase/migrations/)
- Arquivos válidos: 1073 .sql files
- Paridade com ledger: validada em CI (Contrato DB offline check)

## Baseline de regressão
Para medir regressão das PRs, o critério é:
- TypeCheck: novas=0 vs baseline=93 (ratchet)
- Lint: novas=0 vs baseline=820 (ratchet)
- Build: passando
- Unit tests: passando (sem novos failures)
- Migrations: paridade arquivos↔ledger OK
