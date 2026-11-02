# Baseline do main — SHA: 50ca61a6ef96b366084548fbb3866974083def52
Data: 2026-11-02

Última PR mergeada: #2569 (fix(ci): testes GR-027 + gatilho workflow_run e2e-logado GR-029) em 2026-11-02T04:43:24Z

## TypeCheck (ratchet)
- Baseline histórico: 93 erros
- Atual no main: 3 erros (redução de 90 vs baseline histórico)
- Novas dívidas introduzidas: 0
- Status: ✅ ZERO erros novos

## Lint (ESLint ratchet)
- Baseline histórico: 820 ocorrências
- Atual no main: 813 ocorrências (redução de 7 vs baseline histórico)
- Novas dívidas introduzidas: 0
- Status: ✅ ZERO ocorrências novas

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
