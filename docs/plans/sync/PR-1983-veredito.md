# PR #1983 (lote 880) — veredito: SUPERADA, não fazer merge

- PR: #1983 `fix: correções pós-lote 880 cartões (F1–F6)`, OPEN, non-draft,
  base `main`, head `lote/2026-10-16-880-cards @ f3bbbaf08a`
  (+362236/-30670, 3115 arquivos, estado DIRTY/CONFLICTING no GitHub).
- Main atual: `a9b4d6c6fb` (2026-10-16 21:33 -0300, confirmada por `git fetch origin main` sem avanço).
- Base de merge: `5721e4f5000c`. A ponta da PR tem 7 commits acima da base;
  a main andou 23 commits depois da base. A branch da PR é anterior a toda a
  evolução de segurança/copiloto/types da main — é um retrato velho, não um caminho.
- Estratégia SYNC20-22 (merge por área em lotes, `v2/sync20-22-...`, matriz dos 578
  conflitos dia × origin) continua sendo o caminho; a PR não faz parte dele.

## Medida central (reproduzível no workspace)

- `git diff --name-only base tip` = 3115 arquivos (conteúdo da PR).
- `git diff --name-only origin/main tip` = 47 arquivos.
- Intersecção reversa: **3097/3115 arquivos byte-idênticos** entre main e ponta da PR.
- `git merge-tree base main tip`: 11 arquivos com marcadores reais de conflito
  (27 hunks) — não mais 12: `tipos-contatos.ts`, `use-chat-popup.ts`,
  `supabase/config.toml` e `20261016220000_feature_flags.sql` já estão idênticos
  na main (conflito evaporou), e `ci.yml`/`notifica-falha-main.yml`/`github-settings-guard`
  hoje fazem merge limpo.

## Arquivo a arquivo: o que (não) aproveitar

### Grupo A — 3097 arquivos: já estão na main, byte-idênticos. Nada a fazer.

### Grupo B — 1 arquivo só-na-PR, mas duplicado renomeado. Nada a fazer.
- `supabase/migrations/20261011010000_talk_me_list_pending_messages.sql`:
  `diff` de 0 linhas contra `supabase/migrations/20261011010003_talk_me_list_pending_messages.sql`
  da main (mesmo conteúdo, só renumeração de timestamp). A função
  `talk_me_list_pending_messages` já vive na main.

### Grupo C — 20 arquivos pós-base só-na-main (a PR é anterior a eles). Nada a trazer da PR.
Merge não os apagaria (criados depois da base: lado "added by us"), mas a PR nada agrega:
- 10 migrations de segurança 16/10: `.../20261016130000_revert_wrong_security_fixes.sql`,
  `.../20261016140000_search_events_user_id_index.sql`,
  `.../20261016150000_connection_alert_preferences_delete_policy.sql`,
  `.../20261016170000_fix_security_definer_search_path.sql`,
  `.../20261016180000_set_trusted_domains_guc.sql`,
  `.../20261016190000_fix_security_definer_search_path_batch2.sql`,
  `.../20261016200000_revoke_passkey_anon_insert.sql`,
  `.../20261016220000_fix_domain_case_sensitivity.sql`,
  `.../20261016220000_search_events_rls_decision.sql` (esta última convergiu idêntica),
  `.../20261016230000_revoke_passkey_anon_excessive_grants.sql`.
- 10 docs do Copiloto de Vendas: `docs/copiloto/CV-001..CV-008`, `docs/adr/CV-009-*`,
  `docs/plans/PLANO_COPILOTO_VENDAS_AO_VIVO_150_ETAPAS_2026-10-16.md`.

### Grupo D — 11 arquivos com conflito real: em todos os pontos amostrados a main é a mais nova.
Resolver a favor da main; lado PR é variante velha. Amostras verificadas:
- `.github/workflows/ci.yml`, `.github/workflows/db-guard.yml`,
  `.github/workflows/notifica-falha-main.yml`: main monitora mais workflows
  (e2e-logado, db-guard, types-sync); PR tem a lista antiga.
- `scripts/ci/workflow-contracts.unit.mjs`, `scripts/ci/github-settings-guard.unit.mjs`:
  contratos/baselines antigos na PR (E69 com nomes de jobs velhos; envs sem copilot/Preview/Production).
- `supabase/functions/_shared/ai-feature-flags.ts` + teste: main tem `copilot_live`/CV-010;
  o teste da PR trava "exatamente 10 capacidades" (0 ocorrências de `copilot_live`) —
  quebrar ia contra o fonte atual.
- `supabase/schema-manifest.json`: PR gerado em 2026-10-09, main em 2026-10-16.
- Hooks/components (`useSentimentData`, `ChatMessagesArea`, `useNextBestAction`,
  `useDashboardKpi`, `useLeaderboard`, + `useDashboardStats`, `useContactDeliveryStats`,
  `useMyNetworkStatus`, `usePasswordResetRequests`, `ConnectionAlertPreferences`,
  `useConnectionAlertPreferences`, `mapboxCostGuard`, `evolution.service`, teste ChatPopup):
  padrão único — a PR usa `(supabase as any).rpc(...)` e sem `isError` (era pré-types-sync);
  a main já chama `supabase.rpc` tipado pós-regen. Nada a resgatar.
- `src/integrations/supabase/types.ts`, `supabase/deployment-manifest.json`, `bun.lock`:
  churn de regen; os da main são mais novos.

### Grupo E — adições só-na-PR avaliadas e descartadas (não cherry-pickar).
- `src/hooks/tasks/workItemAggregates.ts` (+23): a PR tem a regra R2-MOD-058 **duplicada**
  (`export function isOverdue` idêntico nas linhas 52 e 76 da ponta) — a ponta **não
  compila** (duplicata); a main já tem a regra em forma única e correta (linha 52).
- `supabase/functions/_shared/__tests__/ai-feature-flags.test.ts` (+420): cobertura do
  kill-switch do servidor já existe na main (com `copilot_live`); a versão da PR é
  anterior e incompatível com o fonte atual.

## Recomendação

1. **Não fazer merge da #1983** (nem local): 100% do conteúdo útil já está na main;
   o resto é variante velha, incluindo 1 arquivo que não compila na ponta.
2. Fechar a PR sem merge, com link para este veredito.
3. Nenhum cherry-pick pendente desta PR para a main ou para a branch do dia.
4. Os "12 conflitos" do enunciado caíram para 11 reais (4 evaporaram, 3 viraram merge
   limpo); se alguém reabrir o tema, a resposta é "resolver tudo a favor da main".
