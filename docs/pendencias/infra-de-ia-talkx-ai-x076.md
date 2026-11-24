# X076 — Infra de IA (talkx-ai)

- **Estado**: CONCLUÍDO
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

## Descrição e origem

Infra de IA (talkx-ai).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Edge via ai-proxy com teto e trilha
- **Existe hoje** (evidência da auditoria): Edge existe (supabase/functions/talkx-ai/index.ts:24-28, supabase/config.toml:83), mas talkx_ai_requests e as chaves de orçamento não existem em migration → recusa tudo; nenhuma tela chama
- **Entregue** (PR #3327, 22/11/2026): `supabase/migrations/20261122200000_x076_talkx_ai_requests.sql` cria `talkx_ai_requests` (13 colunas, CHECK de `kind`, 3 índices, RLS só leitura para admin, `REVOKE ALL` de `anon`) e semeia `ai_monthly_budget_usd`/`ai_daily_requests_per_user` em `talkx_settings` com `ON CONFLICT DO NOTHING`. Consumidor em `src/hooks/talkx/useTalkxAi.ts`, botão “Variação por IA” no `TalkXCampaignWizard`. Teste descartável `scripts/db-audit/talkx-ai-requests-trail.test.mjs` (12/12) e step no `.github/workflows/db-guard.yml`.
- **Fechamento** (24/11/2026): o DDL está aplicado no projeto `tnnnlkbymytvtqngbbqh` — conferido no banco: `talkx_ai_requests` com 13 colunas, CHECK de `kind` nos 3 valores, 4 índices, RLS ligada e policy de leitura admin; `talkx_settings` com `ai_insights=true`, `ai_daily_requests_per_user=20` e `ai_monthly_budget_usd=20`. O registro `20261122200000` foi reconciliado no ledger (`supabase_migrations.schema_migrations`) com os 13 statements iguais ao arquivo — `check-migration-drift.mjs` e `verify-ledger-statements.mjs` passam. Os dois kinds que não tinham tela foram ligados na PR #3339: `insight_text` no `TalkXAnalytics`/`kit/insight.tsx` e `segment_suggestion` no `TalkXSegmentBuilder`.
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhuma

## Dependências

N41 (IA desligada)

## Critério de aceite

- Edge via ai-proxy com teto e trilha
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).