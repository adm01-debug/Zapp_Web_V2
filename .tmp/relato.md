Especialista: worker (sql) (area-sql-banco)

## Faixa trazida (o cartão manda)
Cherry-pick da faixa inteira, `git cherry-pick --empty=drop` NÃO existe no git 2.43 da máquina
(uso do `--empty=drop` = erro de opção): trouxe commit a commit, pulando só os 2 commits que
tocam apenas `.tmp/relato.md` (scratch de relato, nada de código).
- SA1: `78c7ba2a5` (histórico de alertas + `record_sla_alert`) — base `dia/2026-10-11`.
- Pai PB-39: `ac820d0d8` (`resolve_applicable_sla`) — base `dia/2026-10-12`.
Os dois aplicam limpos; `src/integrations/supabase/types.ts` auto-mesclou sem conflito.

## O que mudou e por quê
- `supabase/migrations/20261013023000_sla_open_rows_sweep.sql` (NOVO, 262 linhas):
  1. `public.sla_first_response_sweep(p_limit int = 500, p_lookback interval = '24 hours')`
     SECURITY DEFINER: em vez de recorte por DIA, trabalha sobre o conjunto ABERTO real.
     Faixa A: linhas `first_response_at IS NULL AND resolved_at IS NULL AND
     coalesce(first_response_breached,false)=false` cujo prazo vigente (`resolve_applicable_sla`)
     já chegou ao limiar de aviso. Faixa B: ciclo NOVO — contato escreveu e ninguém respondeu
     (`last effective agent = sender='agent' AND status in ('sent','delivered','read')`),
     janela `p_lookback` sobre `messages.created_at` (índice `idx_messages_created_at`), logo
     não varre 3.108 contatos nem faz backfill de histórico antigo.
  2. Insere a linha aberta por ciclo com `ON CONFLICT (contact_id) WHERE first_response_at IS NULL
     DO NOTHING` (reusa o índice parcial existente → nunca duplica linha por contato).
  3. Ao passar o prazo, `UPDATE conversation_sla SET first_response_breached = true` (o UPDATE
     que dispara o realtime já inscrito em `conversation_sla`).
  4. `public.sla_first_response_evaluate(uuid,uuid,timestamptz)` (helper, sem EXECUTE para
     ninguém além do dono): resolve o prazo, agenda aviso em `prazo - max(30% do prazo, 1 min)`
     (mesmo limiar do `useSLACalculation`) e chama `record_sla_alert(contact,'first_response',
     'warning'|'breached')` — idempotente pelo `ON CONFLICT ... WHERE resolved_at IS NULL` do SA1.
  5. Trava por contato `pg_advisory_xact_lock(hashtextextended(contact_id,42))`, a MESMA de
     `register_first_response_internal`: varredura e registro da resposta não se atropelam.
  6. Job pg_cron `sla-first-response-sweep` `* * * * *` → `select public.sla_first_response_sweep()`,
     em bloco com guarda `to_regclass('cron.job')` + `exception` (padrão do repo, igual ao L5/ia045).
  7. GRANT: `REVOKE ... FROM PUBLIC, anon, authenticated`; só `service_role` pode chamar à mão.
- `supabase/tests/sla_open_rows_sweep.sql` (NOVO, 222 linhas): prova no banco LOCAL da tarefa
  (schema real), em transação com ROLLBACK, fixture sintética.

## Prova (saída real, rodada agora)
- `zapp-db-local psql . v2-261012230133f3 < supabase/tests/sla_open_rows_sweep.sql`
  → `NOTICE: OK injuria: o recorte por dia enxerga 0 linhas vencidas (a de ontem some)`
  → `acted | 5` (C1, C2, C3, C5, C7)
  → `NOTICE: OK C1: linha de ontem marcada + alerta breached`
  → `NOTICE: OK C2/C3/C4: estouro, aviso e dentro-do-prazo`
  → `NOTICE: OK C5/C6/C7: ciclo novo unico, atendido fora, resposta sending nao efetiva`
  → `NOTICE: OK idempotencia: rodar de novo nao duplica linha nem alerta` (`acted_2 | 1`, so o aviso de C3)
  → `NOTICE: OK authenticated sem EXECUTE (42501)` / `OK anon sem EXECUTE (42501)`
  → `resultado | TODOS OS CASOS OK`
- Vermelho (controle negativo medido): a própria `DO` inicial mede que a regra velha por DIA
  (`first_message_at >= date_trunc('day', now())`) enxerga 0 das linhas vencidas — a linha de
  ontem some. Sem a migration a função nem existe (`to_regprocedure(...) IS NULL`).
- Banco local: `zapp-db-local up . v2-261012230133f3` → falhas.tsv com EXATAMENTE as 21 de
  `falhas-esperadas.txt` (nenhuma falha nova; a minha migration aplicou). Funções conferidas:
  `to_regprocedure('public.sla_first_response_sweep(integer,interval)')` = a função; job
  `sla-first-response-sweep` presente em `cron.job` (schedule `* * * * *`, `command
  select public.sla_first_response_sweep()`); o stack local desliga jobs (active=f) de propósito.

## Efeitos colaterais conferidos
- Gatilhos em `conversation_sla`: só `update_conversation_sla_updated_at` (BEFORE UPDATE) — o
  UPDATE do flag não reescreve outra coluna de negócio.
- Escrita atômica: sweep e helper rodam numa transação; falha = nada aplicado.
- O job roda sem JWT: como `record_sla_alert` exige staff, o helper marca a sessão como
  `service_role` de forma LOCAL à transação (`set_config('request.jwt.claims',...,true)`); sem
  isso o alerta do cron não seria registrado. Documentado na migration.
- Nenhum GRANT/papel/ACL de objeto existente mudou; não criei tabela.

## O que NÃO fiz e por quê
- Não toquei `src/integrations/supabase/types.ts`: a varredura NÃO é exposta ao app (REVOKE de
  authenticated/anon), então não entra como RPC tipada.
- Não criei índice novo: o recorte de mensagens recentes usa `idx_messages_created_at`, já existente.
- Não mexi em `scripts/db-audit/` nem em workflow (prova pela suíte SQL oficial, como a SA1/PB-39).
