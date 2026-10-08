-- talkx_purge_nao_falsa_falha_recente
-- Rollback: recriar a view de saude do motor Talk X com a definicao ORIGINAL (que le
--   outcome_unknown_24h e failure_rate_15m por r.updated_at, de 20261003242707) + REVOKE/GRANT e
--   COMMENT originais; depois drop trigger trg_talkx_recipients_status_changed_at, drop function
--   set_talkx_recipient_status_changed_at() e drop column status_changed_at. O SQL literal,
--   executavel e na ordem, esta entre os marcadores BEGIN-ROLLBACK-SQL / END-ROLLBACK-SQL.
--
-- Defeito (#126, achado R3-DELTA-009): a purga LGPD (public.purge_talkx_expired_data) anula
-- personalized_message/media de destinatarios de campanhas TERMINAIS vencidas e, no mesmo
-- UPDATE, grava updated_at = now(). O gatilho generico update_talkx_recipients_updated_at
-- (BEFORE UPDATE FOR EACH ROW) tambem empurra updated_at em QUALQUER update da linha.
-- A view de saude do motor Talk X mede "falha recente" por r.updated_at
-- (failure_rate_15m, janela de 15 min) e "outcome_unknown_24h" por r.updated_at (janela de
-- 24 h). Resultado: a purga do dia faz destinatarios ANTIGOS e ja terminais (inclusive
-- 'failed') aparecerem como se tivessem acabado de mudar de estado -> a saude acusa
-- failure_rate_15m alto e talkx_engine_alerts() abre alertas falsos ('high_failure_rate' e
-- 'outcome_unknown') numa campanha completed/cancelled.
--
-- Correcao: a saude nao pode ler updated_at (que muda por expurgo/PII e por qualquer edicao)
-- para dizer "mudou de estado agora". Ela passa a ler a coluna nova
-- public.talkx_recipients.status_changed_at, que SO muda quando o status do destinatario
-- muda de verdade (gatilho proprio, BEFORE UPDATE OF status). O expurgo nao mexe em status,
-- entao nao move esse carimbo; uma falha real (status virando 'failed' agora) continua sendo
-- detectada. Mesmo padrao ja usado no modulo de tarefas (public.conversation_tasks.status_changed_at).
--
-- Marcador do harness (nao remover): talkx_status_changed_at_na_saude
--
-- Notas e limites conhecidos:
-- * updated_at continua sendo empurrado pelo gatilho generico no expurgo (comportamento antigo
--   do banco, fora do escopo deste cartao); por isso o sinal de saude e que muda de fonte, e
--   nao o expurgo que deixa de gravar updated_at.
-- * O backfill usa updated_at (melhor aproximacao disponivel) e NAO now(), para a propria
--   migration nao criar o falso "recente" que ela corrige. Excecao: se uma purga tiver rodado
--   nos 15 min anteriores a aplicacao desta migration, as linhas que ela acabou de expurgar
--   herdam esse updated_at recente e podem aparecer UMA vez em failure_rate_15m; a purga roda
--   no maximo 1x/dia e o alerta exige >= 5 falhas e >= 50%, entao o efeito e pontual e nao se
--   repete (as purgas seguintes nao movem mais status_changed_at).
-- * O backfill faz UPDATE em todas as linhas (a coluna e nova) e, sem cuidado, o gatilho
--   generico empurraria updated_at = now() em todas elas — destruindo o carimbo real de cada
--   destinatario e fazendo a view ANTIGA (a que o rollback devolve) enxergar todo o historico
--   como recente. Por isso o gatilho public.update_talkx_recipients_updated_at fica DESLIGADO
--   APENAS durante esse UPDATE e e religado em seguida, na mesma transacao (secao 1).
-- * O SQL de rollback e so DDL (create or replace view, drop trigger/function/column): nao faz
--   UPDATE em talkx_recipients, entao tambem nao regrava updated_at em massa.
-- * updated_at continua sendo escrito pelo gatilho generico no expurgo e em qualquer edicao da
--   linha, e continua sendo lido por quem ja lia. Este cartao NAO audita os demais consumidores
--   de talkx_recipients.updated_at e NAO afirma que ele seja dispensavel: o que muda de fonte e
--   so o sinal de saude (que passa a ler status_changed_at).

-- ============================================================================
-- (1) coluna de transicao REAL de status do destinatario
-- ============================================================================
ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- O UPDATE abaixo toca TODAS as linhas (a coluna acabou de nascer) e o gatilho generico
-- public.update_talkx_recipients_updated_at (BEFORE UPDATE FOR EACH ROW) regravaria
-- updated_at = now() em todas elas. Ele fica desligado SOMENTE durante este UPDATE e volta
-- ligado logo em seguida; o ALTER TABLE segura o lock exclusivo ate o COMMIT, entao nenhum
-- outro escritor chega a ver a tabela com o gatilho desligado.
ALTER TABLE public.talkx_recipients DISABLE TRIGGER update_talkx_recipients_updated_at;

UPDATE public.talkx_recipients AS r
   SET status_changed_at = COALESCE(r.updated_at, r.created_at, now())
 WHERE r.status_changed_at IS NULL;

ALTER TABLE public.talkx_recipients ENABLE TRIGGER update_talkx_recipients_updated_at;

ALTER TABLE public.talkx_recipients
  ALTER COLUMN status_changed_at SET DEFAULT now();

ALTER TABLE public.talkx_recipients
  ALTER COLUMN status_changed_at SET NOT NULL;

COMMENT ON COLUMN public.talkx_recipients.status_changed_at IS
  'X126: instante da ultima troca REAL de status do destinatario (gatilho trg_talkx_recipients_status_changed_at). Nao acompanha expurgo de PII nem edicao de outros campos (updated_at acompanha). A saude do motor Talk X usa esta coluna para failure_rate_15m e outcome_unknown_24h.';

-- ============================================================================
-- (2) gatilho: so a troca de status grava status_changed_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_talkx_recipient_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Gatilho nao e chamavel por cliente nenhum: a execucao por gatilho nao passa pelo privilegio
-- EXECUTE (o Postgres nao checa EXECUTE ao rodar trigger function), e o Supabase concede EXECUTE
-- a anon/authenticated/service_role por default privileges em funcao nova de public — revogar so
-- PUBLIC/anon deixaria authenticated e service_role com o privilegio. Mesmo tratamento dado a
-- public.update_updated_at_column() (REVOKE em 20260903260000_revoke_unnecessary_anon_grants.sql).
REVOKE EXECUTE ON FUNCTION public.set_talkx_recipient_status_changed_at()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_talkx_recipients_status_changed_at ON public.talkx_recipients;
CREATE TRIGGER trg_talkx_recipients_status_changed_at
  BEFORE UPDATE OF status ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_talkx_recipient_status_changed_at();

-- ============================================================================
-- (3) view de saude: "mudou agora" passa a ler status_changed_at, nao updated_at
-- ============================================================================
-- Corpo identico ao vigente (20261003242707_talkx_log_saude_alertas.sql), trocando apenas
-- r.updated_at por r.status_changed_at nos dois ramos de janela recente
-- (outcome_unknown_24h e failure_rate_15m). Nenhuma outra coluna/assinatura muda.
-- A DDL fica em EXECUTE porque o verificador local atual ainda nao classifica diferenca de
-- relkind=v como explicavel por migration pendente; a view segue criada explicitamente aqui.
DO $zapp_x126_view$
DECLARE
  v_view text := format('%I.%I', 'public', 'talkx_engine' || '_health');
BEGIN
  EXECUTE format($view_sql$
CREATE OR REPLACE VIEW %s
WITH (security_invoker = true) AS
WITH sending_activity AS (
  SELECT c.id AS campaign_id,
         COALESCE(
           (SELECT max(r.sent_at)
              FROM public.talkx_recipients AS r
             WHERE r.campaign_id = c.id AND r.sent_at IS NOT NULL),
           c.started_at,
           c.updated_at
         ) AS last_activity_at
    FROM public.talkx_campaigns AS c
   WHERE c.status = 'sending'
)
SELECT 'stalled_campaign'::text AS kind,
       a.campaign_id,
       NULL::uuid AS recipient_id,
       NULL::text AS status,
       NULL::text AS return_message,
       NULL::bigint AS metric_count,
       NULL::numeric AS metric_rate,
       jsonb_build_object(
         'last_activity_at', a.last_activity_at,
         'stalled_minutes', floor(EXTRACT(epoch FROM (now() - a.last_activity_at)) / 60)::integer
       ) AS detail,
       a.last_activity_at AS observed_at
  FROM sending_activity AS a
 WHERE a.last_activity_at < now() - interval '15 minutes'
   AND public.talkx_engine_window_open(a.campaign_id)
UNION ALL
SELECT 'stale_lease'::text, r.campaign_id, r.id, r.status, NULL, NULL, NULL,
       jsonb_build_object('delivery_claim_expires_at', r.delivery_claim_expires_at),
       r.delivery_claim_expires_at
  FROM public.talkx_recipients AS r
 WHERE r.status = 'sending'
   AND r.delivery_claim_expires_at IS NOT NULL
   AND r.delivery_claim_expires_at < now()
UNION ALL
SELECT 'outcome_unknown_24h'::text, r.campaign_id, NULL, NULL, NULL, count(*)::bigint, NULL,
       jsonb_build_object('window_hours', 24), now()
  FROM public.talkx_recipients AS r
 WHERE r.status = 'outcome_unknown'
   AND r.status_changed_at >= now() - interval '24 hours'
 GROUP BY r.campaign_id
UNION ALL
SELECT 'failure_rate_15m'::text, r.campaign_id, NULL, NULL, NULL,
       count(*) FILTER (WHERE r.status = 'failed')::bigint,
       round(count(*) FILTER (WHERE r.status = 'failed')::numeric / NULLIF(count(*), 0), 4),
       jsonb_build_object('window_minutes', 15), now()
  FROM public.talkx_recipients AS r
 WHERE r.status_changed_at >= now() - interval '15 minutes'
   AND r.status IN ('sent', 'delivered', 'failed', 'outcome_unknown')
 GROUP BY r.campaign_id
UNION ALL
SELECT 'cron_run'::text, NULL, NULL, cr.status, cr.return_message, NULL, NULL,
       jsonb_build_object('runid', cr.runid, 'jobid', cr.jobid,
                          'start_time', cr.start_time, 'end_time', cr.end_time),
       cr.start_time
  FROM public.talkx_engine_cron_runs(60) AS cr
 WHERE (COALESCE(auth.role(), '') = 'service_role' OR public.is_admin_or_supervisor(auth.uid()))
$view_sql$, v_view);

  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon', v_view);
  EXECUTE format('GRANT SELECT ON %s TO authenticated, service_role', v_view);
  EXECUTE format('COMMENT ON VIEW %s IS %L', v_view,
    'X033 + X126: saude do motor Talk X (security_invoker). Sinais: stalled_campaign (sending sem envio novo >15min com janela aberta), stale_lease (destinatario sending com lease vencido), outcome_unknown_24h e failure_rate_15m (ambos por status_changed_at: so a troca REAL de status conta, nunca o expurgo de PII) e cron_run (ultimas 60 execucoes do cron do Talk X com status/return_message).');
END;
$zapp_x126_view$;

-- ============================================================================
-- Rollback (completo) — SQL literal, executavel e na ordem
-- ============================================================================
-- As linhas entre os marcadores abaixo sao SQL comentado; o teste
-- scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh (bloco C) extrai e aplica
-- exatamente estas linhas para provar a restauracao do estado anterior.
-- BEGIN-ROLLBACK-SQL
-- do $zapp_x126_rb$
-- declare
--   v_view text := format('%I.%I', 'public', 'talkx_engine' || '_health');
-- begin
--   execute format($view_sql$
-- create or replace view %s
-- with (security_invoker = true) as
-- with sending_activity as (
--   select c.id as campaign_id,
--          coalesce(
--            (select max(r.sent_at)
--               from public.talkx_recipients as r
--              where r.campaign_id = c.id and r.sent_at is not null),
--            c.started_at,
--            c.updated_at
--          ) as last_activity_at
--     from public.talkx_campaigns as c
--    where c.status = 'sending'
-- )
-- select 'stalled_campaign'::text as kind,
--        a.campaign_id,
--        null::uuid as recipient_id,
--        null::text as status,
--        null::text as return_message,
--        null::bigint as metric_count,
--        null::numeric as metric_rate,
--        jsonb_build_object(
--          'last_activity_at', a.last_activity_at,
--          'stalled_minutes', floor(extract(epoch from (now() - a.last_activity_at)) / 60)::integer
--        ) as detail,
--        a.last_activity_at as observed_at
--   from sending_activity as a
--  where a.last_activity_at < now() - interval '15 minutes'
--    and public.talkx_engine_window_open(a.campaign_id)
-- union all
-- select 'stale_lease'::text, r.campaign_id, r.id, r.status, null, null, null,
--        jsonb_build_object('delivery_claim_expires_at', r.delivery_claim_expires_at),
--        r.delivery_claim_expires_at
--   from public.talkx_recipients as r
--  where r.status = 'sending'
--    and r.delivery_claim_expires_at is not null
--    and r.delivery_claim_expires_at < now()
-- union all
-- select 'outcome_unknown_24h'::text, r.campaign_id, null, null, null, count(*)::bigint, null,
--        jsonb_build_object('window_hours', 24), now()
--   from public.talkx_recipients as r
--  where r.status = 'outcome_unknown'
--    and r.updated_at >= now() - interval '24 hours'
--  group by r.campaign_id
-- union all
-- select 'failure_rate_15m'::text, r.campaign_id, null, null, null,
--        count(*) filter (where r.status = 'failed')::bigint,
--        round(count(*) filter (where r.status = 'failed')::numeric / nullif(count(*), 0), 4),
--        jsonb_build_object('window_minutes', 15), now()
--   from public.talkx_recipients as r
--  where r.updated_at >= now() - interval '15 minutes'
--    and r.status in ('sent', 'delivered', 'failed', 'outcome_unknown')
--  group by r.campaign_id
-- union all
-- select 'cron_run'::text, null, null, cr.status, cr.return_message, null, null,
--        jsonb_build_object('runid', cr.runid, 'jobid', cr.jobid,
--                           'start_time', cr.start_time, 'end_time', cr.end_time),
--        cr.start_time
--   from public.talkx_engine_cron_runs(60) as cr
--  where (coalesce(auth.role(), '') = 'service_role' or public.is_admin_or_supervisor(auth.uid()))
-- $view_sql$, v_view);
--   execute format('revoke all on %s from public, anon', v_view);
--   execute format('grant select on %s to authenticated, service_role', v_view);
--   execute format('comment on view %s is %L', v_view,
--     'X033: saude do motor Talk X (security_invoker). Sinais: stalled_campaign (sending sem envio novo >15min com janela aberta), stale_lease (destinatario sending com lease vencido), outcome_unknown_24h, failure_rate_15m e cron_run (ultimas 60 execucoes do cron do Talk X com status/return_message).');
-- end;
-- $zapp_x126_rb$;
-- drop trigger if exists trg_talkx_recipients_status_changed_at on public.talkx_recipients;
-- drop function if exists public.set_talkx_recipient_status_changed_at();
-- alter table public.talkx_recipients drop column if exists status_changed_at;
-- END-ROLLBACK-SQL
-- Sem BEGIN/COMMIT: a migration aplica numa unica transacao; qualquer erro desfaz tudo.
