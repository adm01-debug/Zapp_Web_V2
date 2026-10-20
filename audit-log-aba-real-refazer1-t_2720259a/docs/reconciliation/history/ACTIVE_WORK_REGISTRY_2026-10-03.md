# Active Work Registry — 2026-10-03

## 12 PRs abertas
- #1869 reconciliation checkpoint — auditoria atual.
- #1863 types-sync — não duplicar sync de artefatos.
- #1713 Talk X STATUS regen — não editar placar concorrente.
- #1699 a11y auditoria de dev.
- #1654 sidebar 3 seções.
- #1636 edge lookup sidebar CRM.
- #1621 plano sidebar 3 seções.
- #1610 CI banned actions.
- #1584 Talk X known-violations/types-sync.
- #1439 types-sync E17/E18.
- #1430 E2E fixme/flaky.
- #1206 attestation E09.

Qualquer router multiagente deve consultar essa lista em tempo real antes de criar tarefa.

## 14 issues abertas
### Incidentes/guards atuais
- #1862 db-live-guard — ACTIVE_REGRESSION até guard verde.
- #1854 settings-guard — ACTIVE_REGRESSION.
- #1454 types-sync — ACTIVE_REGRESSION/BLOCKED_TECHNICAL.

### Higiene/infra
- #1810 branch hygiene.
- #378 higiene de branches/auto-delete.
- #377 auditoria DB/RLS/ledger/paridade.
- #376 expansão de coverage ratchet.
- #374 redução de any.
- #380 rotação de credenciais Evolution GO — SECURITY_OPERATION/HUMAN.

### Issues provavelmente stale/superadas — precisam fechar após revalidação
- #1265 Team Chat reação cross-team: PR #1309 afirma correção.
- #1266 Team Chat RPC/policy recursion: PR #1313 afirma correção.
- #1267 Multiplix guards fail-open: PR #1314 afirma correção.
- #382 Talk X status do plano antigo: V4 e placar automático posteriores tornam provável SUPERSEDED.
- #375 Talk X god-files antes da Fase 2: V4/refactors posteriores exigem revalidação; não assumir atual.

## Regra
Issue aberta não equivale automaticamente a bug atual. Se PR posterior cita explicitamente a issue, mover para NEEDS_REVALIDATION e fechar somente após teste/HEAD confirmar.
