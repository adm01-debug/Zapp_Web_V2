# Reconciliation Wave — Telefonia — 2026-10-03

## Linha
Plano melhorias 100 → ledger CP0–CP2 → auditoria #1177 (26/100 no estado real) → plano finalização T01–T100 → execução posterior.

## PRs explicitamente associados a etapas
- #1181 Fase 0 / reconciliação.
- #1193 T09/T14, adapter SIP + CallEngine.
- #1246 T07 e hardening.
- #1285 T11 persistência.
- #1328 T12/T13.
- #1384 T15.
- #1431 T16.
- #1440 T17.
- #1449 T19.
- #1476 T20.
- #1488 T21.
- #1494 T22.
- #1585 Fase 2 (capacidades/click-to-call).
- #1703 Fase 3 shell/header/disponibilidade/período/KPIs.
- #1830 T43–T53.
- #1851 T55–T61.
- #1858 T62–T70.
- #1864 T71–T74.

Também houve correções posteriores (#1365, #1704 etc.) que provam que "PR de feature mergeada" não encerra necessariamente o requisito sem revalidação.

## Drift
O plano observado ainda marcava 72/100, mas há PRs posteriores cobrindo grandes intervalos. O placar precisa ser recalculado contra HEAD.

T11 é caso-modelo da taxonomia multidimensional: #1285 implementou persistência, mas o plano desmarcou a etapa por falta de chamada SIP real exigida no aceite. Classificação: implementation=complete; testing=complete/partial; runtime=not_verified; acceptance=pending.

O bloqueio histórico de autenticação T06 foi posteriormente resolvido segundo atualização do próprio plano; não carregar como bloqueio atual.

## Migrations
A história de Telefonia inclui colisões/reversionamentos de versões (#885/#897/#930/#947). Isso reforça que migrations da área são HISTORICAL_REQUIRED e precisam de ledger/paridade, não "limpeza por nome".

## Próximo passo
Extrair T01–T100 em estrutura, anexar PR/commit, validar código/teste/runtime e recalcular completion. Não executar as 28 caixas antigas como backlog.
