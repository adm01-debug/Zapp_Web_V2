# X076 — Infra de IA (talkx-ai)

- **Estado**: CONCLUÍDO (código) — aguardando aplicação da migration em produção
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
- **Falta**: aplicar a migration no projeto `tnnnlkbymytvtqngbbqh` (regra 8 — DDL em produção) e ligar `insight_text`/`segment_suggestion`, que hoje não têm tela.
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