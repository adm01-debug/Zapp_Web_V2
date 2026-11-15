# Dossiê — claude__feat-talkx-x058-campaign-queue-segment-261101-2300 (PR #2531)

**Branch:** `origin/claude/feat-talkx-x058-campaign-queue-segment-261101-2300` · tip `74ac918` · merge-base `1252bb5` (2026-11-01) · 1 commit: `feat(talkx): adicionar RPC de fila por segmento (X058)`.

## Propósito
Criar a RPC `public.talkx_campaign_queue_by_segment(uuid) RETURNS jsonb` (SECURITY DEFINER, dono da campanha ou admin/supervisor) com totais da fila e breakdown por segmento (`pending/sending/sent/delivered/replied/failed/skipped`). Só 1 arquivo: `supabase/migrations/20261101243000_talkx_x058_campaign_queue_segment.sql` (89 linhas).

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101243000_talkx_x058_campaign_queue_segment.sql` (NEW_FILE_ABSENT_IN_MAIN) | **INCORPORADA com outro nome/texto.** A main tem `supabase/migrations/20261108203000_talkx_x058_campaign_queue_segment.sql` com a mesma função (mesmo nome, mesma assinatura `uuid -> jsonb`, mesmo check de permissão `created_by = profile OR is_admin_or_supervisor`, mesmas chaves `campaign_id/totals/by_segment`, mesmo `GRANT ... TO authenticated`). | commit `9183f0f6f` 2026-11-08 "feat(talkx): 6 RPCs de analytics — heatmap, ranking, segmentos, templates, fila (#2833)"; cabeçalho da migration da main l.2: "Analytics RPC planejada em #2531". `diff` entre os dois arquivos: só reescrita (ver abaixo). |
| — consumo no front | A main já usa a RPC: `src/components/talkx/report/TalkXCampaignReport.tsx:120` (`supabase.rpc('talkx_campaign_queue_by_segment', { p_campaign_id })`), teste `src/components/talkx/report/__tests__/TalkXCampaignReport.segmento.test.tsx:44`, tipos `src/integrations/supabase/types.ts:15092`, `supabase/schema-catalog.json:2933`. | `git grep` em `origin/main`. |
| — produção | Migration `20261108203000 talkx_x058_campaign_queue_segment` registrada em `supabase_migrations.schema_migrations`; `pg_proc` tem `talkx_campaign_queue_by_segment(p_campaign_id uuid) -> jsonb`, `prosecdef=true`, corpo contém `'Sem segmento'` (= versão da main, não a da branch). Ledger `docs/PRONTO_PRODUCAO.md:68` confirma. | `db_query` somente leitura (2026-11-15). |

## Diferenças entre a versão da branch e a da main (todas superadas de propósito)
- Branch ordenava `by_segment` por `pending DESC` e **excluía** `segment_id IS NULL`; main ordena por nome e inclui destinatários sem segmento como `'Sem segmento'` — é isso que o front consome (`NO_SEGMENT_ID = 'sem-segmento'`, `TalkXCampaignReport.tsx:104-105`).
- Branch tinha `'as_of', now()` e `'total'` em `totals`; main não tem. Nenhum consumidor na main lê `as_of`/`total` (`TalkXQueueSegmentRow` só usa `segment_id/segment_name/sent/delivered/replied`, `TalkXCampaignReport.tsx:86-91`).
- Branch tinha `COMMENT ON FUNCTION`; main não. Cosmético.
- Branch tinha fallback `COALESCE(v_result, ...)` para campanha sem destinatários; main resolve igual porque `COUNT(*) FILTER` retorna 0 e `COALESCE(jsonb_agg..., '[]')`.

## Veredito
**INCORPORADA** (confiança alta). A necessidade de negócio (RPC X058) está na main em arquivo próprio, aplicada em produção e consumida pela UI com testes. Nada a portar. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei hunk de valor >= médio fora da main.

Diff da branch (`git diff 1252bb5a 74ac9187`): 1 arquivo, 89 linhas adicionadas, só
`supabase/migrations/20261101243000_talkx_x058_campaign_queue_segment.sql`. Nenhum `src/`, edge ou workflow.

Substituição na main confirmada abrindo o arquivo:
`git show origin/main:supabase/migrations/20261108203000_talkx_x058_campaign_queue_segment.sql` — mesma função
`public.talkx_campaign_queue_by_segment(uuid)`, mesmo guard (`created_by = v_profile_id OR
public.is_admin_or_supervisor(auth.uid())`, `RAISE EXCEPTION 'not found' USING ERRCODE='42501'`), mesmo
`GRANT EXECUTE ... TO authenticated`, mesmas contagens `pending/sending/sent/delivered/replied/failed/skipped`
nos totais e por segmento. Commit `9183f0f6f` (PR #2833), que cita #2531.

Aplicada em produção (`tnnnlkbymytvtqngbbqh`, `pg_proc`): existe 1 função com esse nome, `md5(prosrc)=
e2e4f917174f8431424e796e848b36e2`, `prosrc LIKE '%Sem segmento%'` = true, `%as_of%` = false, `%'total'%` = false
— ou seja, produção roda a versão da main, não a da branch.

Consumo com teste: `src/components/talkx/report/TalkXCampaignReport.tsx:120` chama
`supabase.rpc('talkx_campaign_queue_by_segment', { p_campaign_id: campaign.id })` e usa apenas
`by_segment[].{segment_id, segment_name, sent, delivered, replied}` (interface em
`TalkXCampaignReport.tsx:86-92`). Teste: `src/components/talkx/report/__tests__/TalkXCampaignReport.segmento.test.tsx`.
Tipo gerado: `src/integrations/supabase/types.ts:15092`.

Deltas da branch examinados um a um e descartados:
1. `'as_of', now()` no payload — a UI não lê (`by_segment` é o único campo consumido). Valor baixo.
2. `'total', COUNT(*)` nos totais e por segmento — a UI não lê; o total de destinatários vem de
   `kpis.total_recipients` de outro RPC (`TalkXCampaignReport.tsx:247`). Derivável. Valor baixo.
3. `ORDER BY seg_pending DESC` vs `ORDER BY seg_name` da main — ordem do seletor; cosmético.
4. `COMMENT ON FUNCTION` e comentário de rollback — documentação, valor baixo.
5. `COALESCE` de payload vazio — a main também devolve zeros com fila vazia (agregado sobre conjunto vazio
   retorna uma linha), então não é lacuna funcional.
6. **Regressão na branch**: ela filtra `AND r2.segment_id IS NOT NULL`, logo destinatários sem segmento
   desaparecem do breakdown. A main inclui como `COALESCE(s.name,'Sem segmento')`, e é exatamente isso que a
   UI espera (`NO_SEGMENT_ID = 'sem-segmento'` em `TalkXCampaignReport.tsx:104`, com caso de teste próprio).
   Portar a branch pioraria o comportamento.

Observação sem efeito no veredito: o nome do arquivo da branch tem hora inválida (`...243000` = 24h), outro
motivo para não reaproveitá-lo.

Conclusão: nada a resgatar; `apagar_branch_seguro = true`.
