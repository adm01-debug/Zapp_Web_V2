Especialista: complexo (area-sql-banco; executor: Claude Code pelo comando fixo do cartao)

N-096 — Talk X banco: progresso da campanha por segmento (X142, parte 1). Conferi o diff do executor linha a linha e rodei eu mesmo todas as provas abaixo.

## O que mudou e por quê
- supabase/migrations/20261012115900_talkx_campaign_segment_progress.sql (nova): RPC talkx_campaign_segment_progress(p_campaign_id) que devolve por segmento, na ordem de envio (position): total, enviadas (sent+delivered), entregues, falhas, restante (pending+sending), percentual processado, status done/running/pending, mais total_segments e pending_segments em cada linha. SECURITY DEFINER com SET search_path = public, pg_temp; REVOKE de PUBLIC/anon e GRANT a authenticated/service_role; gate admin/supervisor ou service_role (42501 talkx_admin_required), mesmo padrao do helper irmao talkx_engine_cron_runs. Cabecalho no formato do modelo (20261006141643_ai_jobs_efeito_externo_lease.sql): `-- Rollback (SQL executável, na ordem):` + `--   drop function if exists ...;` (funcao nova, nenhum dado alterado, nada a restaurar — correcao pedida pelo juiz em commit novo). Versao de hoje, maior que o maximo local e >= generated_at do catalogo.
- scripts/db-audit/talkx-segment-progress.test.sh (novo) + passo N-096 em .github/workflows/db-guard.yml (arquivo citado pelo cartao): harness RED→GREEN em Postgres 17 descartavel aplicando as migrations reais (X057 + a nova) com papel real (SET ROLE authenticated/service_role/anon + claims).

## Prova (rodei eu mesmo neste workspace)
- vermelho antes: `bash scripts/db-audit/talkx-segment-progress.test.sh --red` → `[PASS] RED: a funcao nao existe antes da migration` / `[RED] confirmado: talkx_campaign_segment_progress ausente sem a migration`
- verde depois: `bash scripts/db-audit/talkx-segment-progress.test.sh` → `[PASS] 1. 3 segmentos: done/running/pending na ordem de envio, pending_segments=2 (= 1|10|8|6|1|0|100.0|done|3|2;2|10|3|2|1|6|40.0|running|3|2;3|10|0|0|0|10|0.0|pending|3|2)` + service_role le o mesmo; agente comum barrado (talkx_admin_required); anon sem EXECUTE (permission denied); campanha sem segmentos 0 linhas; PUBLIC sem EXECUTE; search_path fixado; rollback do cabecalho executa e remove a funcao
- `hermes-db-migrar supabase/migrations/20261012115900_talkx_campaign_segment_progress.sql` → `APLICADA no banco LOCAL 'v2-2610121152200a' (produção não foi tocada)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint, migrations OK; banco_local AVISO por falta de nome de conjunto — a prova de banco e o harness acima + a aplicacao local)

## Criterio de pronto
1. RPC devolve total/enviadas/entregues/falhas/restante/% e done/running/pending para 3 segmentos de fixture — provado no verde acima.
2. Falha sem a correcao e passa com ela — vermelho→verde acima, mesmo harness.
3. So arquivos do titulo; diff pequeno; zapp-verify verde.

## O que NAO fiz e por que
- talkx_campaign_resume_precheck e frente de leitura (X058/F11): outros cartoes. Caminhos do mesmo defeito (git grep): nenhum outro consumidor da RPC no front/edge; o monitor segue lendo destinatarios com .limit(2000) em src/hooks/integrations/useTalkXMonitor.ts:46 — fica para a etapa de front, so comento.
- Nao regenerei schema-catalog.json/types: dependem do banco oficial apos aplicacao pelo lote; nao toquei.
