# Dossiê — claude/feat-talkx-x086-template-metrics-rpcs-261101-2300 (PR #2530)

**Propósito**: X086 (Talk X Fase 7 · analíticas): duas RPCs `SECURITY DEFINER STABLE` só-leitura para admin/supervisor —
`talkx_template_metrics(uuid)` (métricas de entrega/resposta de um template, janela 90 dias) e
`talkx_template_library_kpis()` (KPIs da biblioteca de templates). 1 commit (`421226c4a`), 1 arquivo novo
`supabase/migrations/20261101233000_talkx_x086_template_metrics_rpcs.sql` (+126). PR #2530 fechada em 01/11 pelo
congelamento de features (#2545), "branch preservada".

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101233000_talkx_x086_template_metrics_rpcs.sql` (NEW_FILE_ABSENT_IN_MAIN) | **Incorporada por reimplementação deliberada** em `supabase/migrations/20261108202000_talkx_x086_template_metrics_rpcs.sql` (main), commit `9183f0f6f` "feat(talkx): 6 RPCs de analytics — heatmap, ranking, segmentos, templates, fila (#2833)", mergeado 2026-11-08; o corpo da PR #2833 cita #2530 como origem ("RPCs de analytics planejadas em #2529, #2530 e #2531"). Cabeçalho da migration da main (linha 2): "Analytics RPCs planejadas em #2530". | `git log --oneline origin/main -- supabase/migrations/20261108202000_...` → `9183f0f6f`; `git grep -n talkx_template_metrics origin/main -- supabase` → linhas 1,4,5,46 do arquivo da main; `src/integrations/supabase/types.ts:15328-15329` tipa ambas as RPCs; `supabase/schema-manifest.json:5204,5356` e `schema-catalog.json:2970-2971,3734-3735` registram as funções no snapshot do banco. |
| Produção (`tnnnlkbymytvtqngbbqh`, só leitura) | Ambas as funções existem e a migration da main está aplicada; a da branch não (esperado). | `db_query`: `schema_migrations` contém `20261108202000 talkx_x086_template_metrics_rpcs` (não contém `20261101233000`); `pg_proc`: `talkx_template_metrics(p_template_id uuid)`, `talkx_template_library_kpis()`, `is_admin_or_supervisor(_user_id uuid)`. Colunas usadas pela branch existem (`talkx_templates.status/category/use_count/name`; `talkx_campaign_metrics.template_id/campaign_id/completed_at/reply_rate_pct/delivery_rate_pct/total_recipients/duration_secs`). |
| Consumidores no front | Nenhum em `src/` (nem na main, nem na branch — a branch só tem SQL). | `git grep -n "talkx_template_metrics\|talkx_template_library_kpis" origin/main -- src ':!src/integrations/supabase/types.ts'` → vazio. |

## Diferenças de forma entre a versão da branch e a da main (mesmos nomes, mesmas assinaturas, mesma guarda admin/supervisor, mesma janela 90d)

`talkx_template_metrics(uuid)`:
- main adiciona guarda `template not found` (42501) e usa `COUNT(DISTINCT cm.campaign_id)`; branch usava `COUNT(*)`.
- branch devolvia campo extra `best_reply_rate_pct` (MAX de `reply_rate_pct`); main não.
- branch tinha `COMMENT ON FUNCTION`; main não.

`talkx_template_library_kpis()`:
- branch: `{as_of, total_active, by_category{categoria:qtd}, top_used[5 por use_count com avg_reply_rate_pct]}`, só `status='active'`.
- main: `{window_days, as_of, templates[todos os templates ordenados por avg_reply_rate_pct desc, com campaign_count/total_recipients/avg_delivery_rate_pct/avg_reply_rate_pct]}`, sem filtro de status.

Nenhuma dessas diferenças tem consumidor no front; a escolha de forma da main foi deliberada (#2833 reimplementou X086 a partir do plano). Não há bug corrigido pela branch que a main não cubra.

## Veredito
**INCORPORADA** (confiança alta). A necessidade X086 — duas RPCs com estes nomes/assinaturas, admin-only, 90 dias — está na main e aplicada em produção. O que sobra na branch é apenas forma alternativa do payload (`best_reply_rate_pct`, `by_category`, `top_used`, filtro `status='active'`), sem consumidor e substituída por decisão posterior (#2833). `apagar_branch_seguro = true`.

## Trecho preservado (caso alguém queira os KPIs por categoria/top-uso no futuro — valor baixo, não é lacuna funcional)
```sql
-- origem: branch, dentro de talkx_template_library_kpis()
SELECT COUNT(*) INTO v_total FROM public.talkx_templates WHERE status = 'active';

SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb) INTO v_by_category
FROM (SELECT COALESCE(category, 'sem_categoria') AS category, COUNT(*) AS cnt
      FROM public.talkx_templates WHERE status = 'active' GROUP BY category) sub;

SELECT COALESCE(jsonb_agg(row ORDER BY use_count DESC), '[]'::jsonb) INTO v_top_used
FROM (SELECT jsonb_build_object('template_id', t.id, 'template_name', t.name, 'category', t.category,
             'use_count', t.use_count,
             'avg_reply_rate_pct', ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1)) AS row, t.use_count
      FROM public.talkx_templates t
      LEFT JOIN public.talkx_campaign_metrics cm ON cm.template_id = t.id AND cm.completed_at >= v_cutoff
      WHERE t.status = 'active'
      GROUP BY t.id, t.name, t.category, t.use_count
      ORDER BY t.use_count DESC LIMIT 5) sub;
-- e em talkx_template_metrics: 'best_reply_rate_pct', ROUND(COALESCE(MAX(cm.reply_rate_pct), 0)::numeric, 1)
```
Arquivo completo: `git show origin/claude/feat-talkx-x086-template-metrics-rpcs-261101-2300:supabase/migrations/20261101233000_talkx_x086_template_metrics_rpcs.sql`.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Branch segura para apagar. Tentei refutar e não achei hunk de valor ≥ médio fora da main.

O que foi conferido (tudo em leitura):

1. **Diff da branch = 1 arquivo, 126 linhas, só SQL.** `git diff 1252bb5a4 origin/claude/feat-talkx-x086-template-metrics-rpcs-261101-2300 --stat` → apenas `supabase/migrations/20261101233000_talkx_x086_template_metrics_rpcs.sql`, 126 inserções, 0 remoções. Nada de `src/`, edge, workflow ou doc.
2. **As duas funções existem na main, com assinatura idêntica.** `origin/main:supabase/migrations/20261108202000_talkx_x086_template_metrics_rpcs.sql`: `talkx_template_metrics(p_template_id uuid)` (linha 5) e `talkx_template_library_kpis()` (linha 49), ambas `RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`, com a mesma guarda `is_admin_or_supervisor(auth.uid())` + `ERRCODE 42501` e a mesma janela de 90 dias; `GRANT EXECUTE ... TO authenticated` nas duas. Linha 2 declara a origem: `-- Analytics RPCs planejadas em #2530`.
3. **Reimplementação deliberada e mergeada.** `git log origin/main -- supabase/migrations/20261108202000_...` → `9183f0f6f feat(talkx): 6 RPCs de analytics — heatmap, ranking, segmentos, templates, fila (#2833)`. Nenhum commit posterior removeu ou reverteu as funções (`git log -S'talkx_template_library_kpis' origin/main -- supabase/` → só 9183f0f6f + 2 commits de sincronização de artefatos derivados, #2857 e #2867).
4. **Aplicado em produção (`tnnnlkbymytvtqngbbqh`).** `db_query` em `pg_proc` retorna as 2 funções (`talkx_template_metrics(p_template_id uuid)` e `talkx_template_library_kpis()`); `pg_get_functiondef` das versões vivas **não** contém `by_category`, `best_reply_rate_pct` nem `status` → o que está rodando é a versão da main, não a da branch.
5. **Zero consumidor do payload.** `git grep` das 2 RPCs em `origin/main -- src/` fora de `types.ts` → vazio. Só aparecem tipadas em `src/integrations/supabase/types.ts:15328-15329` (`Returns: Json`, sem shape), logo nenhuma tela quebra nem fica sem dado por causa do formato escolhido.
6. **PR #2530 fechada sem merge** (`state=closed`, `merged_at=null`, fechada 2026-11-01T23:50:05Z, `draft=true`, 1 commit, 126 adições, head `421226c4a`). Apagar a branch não fecha PR aberta nem perde histórico — o SQL fica no dossiê.

Na parte comum, a main é **melhor** que a branch, não pior: usa `COUNT(DISTINCT cm.campaign_id)` onde a branch usa `COUNT(*)` (que contaria linhas de métrica, não campanhas) e valida a existência do template antes de agregar (`'template not found'`, linhas 15-17). Ou seja, resgatar a branch seria regressão.

Diferenças reais que a main não tem (registradas como nuance, não como lacuna de resgate — valor baixo, sem consumidor, forma de payload é decisão da #2833):
- `talkx_template_metrics`: campo `best_reply_rate_pct` (um `MAX(reply_rate_pct)`).
- `talkx_template_library_kpis`: `total_active`, `by_category` (distribuição por categoria) e `top_used` (top 5 por `use_count`), com filtro `status = 'active'`. A versão da main devolve a lista completa de templates ranqueada por `avg_reply_rate_pct`, **sem filtrar status** — ou seja, inclui template arquivado/inativo. As colunas `status`, `category`, `use_count` e `archived_at` existem em `public.talkx_templates` (confirmado em `information_schema.columns`), então isso é melhoria possível na main, não trabalho perdido.
