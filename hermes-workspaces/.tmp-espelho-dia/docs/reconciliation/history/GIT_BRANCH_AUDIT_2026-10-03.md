# Git Truth — Branch Audit — 2026-10-03

Baseline observado: **58 branches remotas incluindo main**.

Classificação por associação a PRs nos 1.000 PRs mais recentes:
- 2 AUTOMATION_OPEN_PR
- 9 OPEN_PR de trabalho
- 1 RECONCILIATION_ACTIVE
- 11 MERGED_BRANCH_REMAINS
- 28 CLOSED_UNMERGED_REVIEW
- 6 NO_PR_IN_LAST_1000

## Branches ativas / não apagar
- automation/talkx-status → PR #1713 aberto.
- automation/types-sync → PR #1863 aberto; branch reutilizada historicamente.
- docs/reconciliation-checkpoint-20261003 → PR #1869.
- claude/feat-sidebar-contato-3-secoes-261002-1510 → #1621 aberto.
- claude/fix-attestation-e09-stable-inv-291029-1520 → #1206 aberto.
- claude/fix-ci-banned-actions-261002-1430 → #1610 aberto.
- claude/fix-e09-e2e-fixme-261001-1740 → #1430 aberto.
- claude/fix-e27-e17-e18-261001-1805 → #1439 aberto.
- claude/fix-known-violations-kick-261002-1240 → #1584 aberto.
- devin/1764000000-crm-sidebar-lookup → #1636 aberto.
- devin/1764000200-sidebar-3-secoes → #1654 aberto.
- hermes/a11y-aria-hidden-focus-2610021746e07a → #1699 aberto.

## Branches com PR mergeada mas branch remota permanece
Candidatas fortes a limpeza de branch **somente após comparar HEAD da branch com main e confirmar ausência de commits posteriores**:
- claude/confident-babbage-ivgmmn
- claude/fix-ci-types-sync-husky-e2e-260927-1245
- claude/fix-db-live-guard-drift-260928-1045
- claude/fix-db-live-guard-missing-migrations-270927-1730
- claude/fix-gamification-guard-xp-cap-270927-1750
- claude/fix-multiplix-send-auth-270927-1530
- claude/friendly-mccarthy-g4xd5z
- hermes/acl-default-privileges-revoke-anon-2609300840a808
- hermes/l5-followup-contrato-e-jobs-261001070612ac
- hermes/plano-volume-50-etapas-finalizacao-2610011018e48d
- hermes/tarefas-b4-concluidas-7d-26093006501293

Classificação atual: MERGED_BRANCH_REMAINS / DELETE-B, não SAFE_TO_DELETE ainda.

## 28 branches com PR fechada sem merge
Não apagar em lote. "closed unmerged" pode significar superseded, cherry-picked, conteúdo incorporado por outra PR ou trabalho único abandonado. Cada uma precisa de compare/diff ou evidência de sucessor.

Incluem famílias de db-live-guard, migration drift/parity, types gate, TalkX replay, Telefonia contrato e Sonar.

## 6 branches sem PR encontrado nos 1.000 PRs recentes
- claude/fix-db-guard-consolidated-260928-1220
- claude/fix-migration-drift-attest-260928-1600
- claude/fix-migration-evidence-hash-261029-1400
- codex/docs-email-navy-plan-100-20261002
- docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30
- docs/plano-ordem-banner-20-etapas-2026-09-30

Classificação: UNKNOWN/STALE_WITH_VALUE até compare. Ausência de PR não é autorização de exclusão.

## Conclusão
Não existe base segura para "apagar 40 branches" automaticamente. Há, porém, forte branch residue: 11 branches já associadas a merge e 28 fechadas sem merge. A futura limpeza deve usar compare main...branch e regra de commits posteriores ao merge.
