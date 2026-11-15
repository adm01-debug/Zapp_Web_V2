# Dossiê — claude__feat-talkx-x074-analytics-rpcs-261101-2300 (PR #2529)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
1 commit (`2f1dc1a11 feat(talkx): adicionar RPCs analíticas de campanha (X074)`), 1 arquivo novo:
`supabase/migrations/20261101223000_talkx_x074_analytics_rpcs.sql` (199 linhas) criando 3 RPCs
SECURITY DEFINER read-only para o Talk X: `talkx_campaign_heatmap(uuid)`, `talkx_top_segments(int)`,
`talkx_campaign_ranking(int, text)`.

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101223000_talkx_x074_analytics_rpcs.sql` | Já está na main com outro nome/timestamp: `supabase/migrations/20261108201000_talkx_x074_analytics_rpcs.sql`, commit `9183f0f6f 2026-11-08 feat(talkx): 6 RPCs de analytics — heatmap, ranking, segmentos, templates, fila (#2833)`. Cabeçalho da main cita explicitamente "Analytics RPCs planejadas em #2529" (linha 2). | `git diff -w --ignore-blank-lines <branch>:...20261101223000... origin/main:...20261108201000...` → só quebras de linha unidas (assinatura `RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public` numa linha, `jsonb_build_object(...)` compactado, `WHERE ... AND ...` numa linha) e remoção dos 3 `COMMENT ON FUNCTION` + comentários de cabeçalho/rollback. Nenhuma diferença de lógica, grants ou segurança. |
| Produção (`tnnnlkbymytvtqngbbqh`, só leitura) | Migration aplicada e 3 funções existem | `select version,name from supabase_migrations.schema_migrations where version in ('20261101223000','20261108201000')` → `20261108201000 talkx_x074_analytics_rpcs`. `pg_proc`: `talkx_campaign_heatmap(p_campaign_id uuid)`, `talkx_campaign_ranking(p_limit integer, p_metric text)`, `talkx_top_segments(p_limit integer)`, todas `secdef=true owner=postgres`. |
| Consumo no front (main) | RPCs já usadas | `src/components/talkx/TalkXAnalytics.tsx:210` (`supabase.rpc('talkx_campaign_ranking', ...)`), `:223` (`talkx_top_segments`); tipos em `src/integrations/supabase/types.ts:15065,15096,15330`; `supabase/schema-catalog.json:2929-2972`. |

## Lacunas
Única diferença não-cosmética: a main não tem os 3 `COMMENT ON FUNCTION ... IS 'X074: ...'` (documentação
no catálogo). Valor **nenhum** para o negócio — comportamento, grants e segurança idênticos. Não vale PR.

Trecho (caso alguém queira portar como `chore` de documentação de catálogo):
```sql
COMMENT ON FUNCTION public.talkx_campaign_heatmap(uuid) IS
  'X074: grade hora-do-dia (0–23) × dia-da-semana (0=Dom … 6=Sáb) com contagens de envio/entrega/resposta para uma campanha.';
COMMENT ON FUNCTION public.talkx_top_segments(int) IS
  'X074: top segmentos por taxa de resposta média em campanhas concluídas nos últimos 90 dias (apenas admin/supervisor).';
COMMENT ON FUNCTION public.talkx_campaign_ranking(int, text) IS
  'X074: ranking de campanhas concluídas por métrica (reply_rate|delivery_rate|recipients|duration) nos últimos 90 dias.';
```

## Nota sobre triagem anterior
`triagem_2804` marcou #2529 como PERDIDA em 2026-11-08; a PR #2833 (mesmo dia, commit `9183f0f6f`) reimplementou
e aplicou em produção. A classificação mecânica `NEW_FILE_ABSENT_IN_MAIN` é falso-positivo por renomeação do
timestamp da migration.

## Verificação adversarial

Veredito mantido: **INCORPORADA**. Concordo com a triagem; branch pode ser apagada.

Tentei refutar procurando qualquer hunk de valor na branch que a `main` não tenha. O commit da branch
(`2f1dc1a`, 1 commit à frente de `1252bb5`) toca **um único arquivo**:
`supabase/migrations/20261101223000_talkx_x074_analytics_rpcs.sql`, +199 linhas, 0 remoções
(`git diff --stat 1252bb5a41123ba4d49efd84d0f91604bff6c87c origin/claude/feat-talkx-x074-analytics-rpcs-261101-2300`).
Não há `src/`, edge, workflow ou doc nessa branch — logo, só há um lugar onde uma lacuna poderia existir.

Comparação linha a linha do corpo das 3 funções, branch vs
`origin/main:supabase/migrations/20261108201000_talkx_x074_analytics_rpcs.sql`:

| RPC | branch | main | diferença semântica |
|---|---|---|---|
| `talkx_campaign_heatmap(uuid)` | idem | idem | nenhuma (mesma checagem `created_by OR is_admin_or_supervisor`, mesmo `EXTRACT(DOW/HOUR … AT TIME ZONE 'America/Sao_Paulo')`, mesmo `COALESCE` de `cells`) |
| `talkx_top_segments(int)` | idem | idem | nenhuma (mesmo `IF NOT is_admin_or_supervisor → 42501`, cutoff 90 dias, `LIMIT LEAST(p_limit,50)`) |
| `talkx_campaign_ranking(int,text)` | idem | idem | nenhuma (mesma whitelist `reply_rate\|delivery_rate\|recipients\|duration` → 22023, mesmo escopo dono-ou-admin, `LIMIT LEAST(p_limit,100)`) |

As 199 linhas que o `line_check` marcou como `missing_in_main` são artefato de comparação textual: a main
reescreveu o mesmo SQL em formatação compacta (assinatura em 1 linha, `jsonb_build_object` sem alinhamento
de colunas), então nenhuma linha bate caractere a caractere, mas todo o comportamento está lá.

Única diferença real de conteúdo: a branch tem 3 `COMMENT ON FUNCTION` (um por RPC) que a main não tem.
Valor baixo — documentação de catálogo, sem efeito em comportamento, RLS, permissão ou contrato de retorno.
Não justifica resgate nem derruba o veredito.

Prova de que está em produção (`tnnnlkbymytvtqngbbqh`, leitura):
- `supabase_migrations.schema_migrations`: existe `20261108201000 / talkx_x074_analytics_rpcs`;
  a versão da branch (`20261101223000`) **nunca** foi aplicada — ou seja, a main é a fonte da verdade aqui.
- `pg_proc`: as 3 funções existem com as assinaturas exatas (`p_campaign_id uuid`; `p_limit integer`;
  `p_limit integer, p_metric text`) e `obj_description` = `null` nas 3, coerente com a ausência dos
  `COMMENT ON FUNCTION` na migration da main.
- Corpo em produção confere com a main: `talkx_campaign_ranking` contém `invalid metric` e
  `is_admin_or_supervisor`; `talkx_campaign_heatmap` contém `America/Sao_Paulo` e `is_admin_or_supervisor`;
  `talkx_top_segments` contém `talkx_campaign_metrics` e `is_admin_or_supervisor`. Não são stubs.

Consumo no front (prova de que não é DDL órfã):
- `src/components/talkx/TalkXAnalytics.tsx:210` → `supabase.rpc('talkx_campaign_ranking', { p_limit: 5, p_metric: 'reply_rate' })`
- `src/components/talkx/TalkXAnalytics.tsx:223` → `supabase.rpc('talkx_top_segments', { p_limit: 5 })`
- `src/integrations/supabase/types.ts:15065,15096,15330` → as 3 RPCs tipadas
- `src/components/talkx/__tests__/TalkXAnalytics.performance.test.tsx:321,331,337` → testes cobrem o ranking

Não encontrei nenhum hunk de valor ≥ médio fora da main. `apagar_branch_seguro = true`.
