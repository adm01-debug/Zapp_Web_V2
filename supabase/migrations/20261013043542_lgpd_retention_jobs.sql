-- lgpd_retention_jobs
-- Rollback: recria a agenda sem a rotina de retencao: desagenda o cron, dropa as 2 funcoes e as 2 tabelas de politica/auditoria.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule('lgpd-retention-daily');
--   drop function if exists public.lgpd_retention_tick(integer);
--   drop function if exists public.lgpd_purge_deleted_contacts(integer, integer);
--   drop table if exists public.lgpd_retention_runs;
--   drop table if exists public.lgpd_retention_policy;
--
-- LGPD / retencao executavel (docs/LGPD-RETENTION-POLICY.md secao 5.4 — hoje descreve prazos
-- sem NENHUM job que os execute; so existiam o expurgo do Talk X (purge_talkx_expired_data) e
-- o cron vacuum-messages-post-expurgo).
--
-- PROBLEMA: as tabelas de log/atividade/seguranca abaixo cresciam sem prazo. A politica da
-- empresa nomeia o prazo de algumas delas e nao ha quem o aplique. As funcoes fn_lgpd_* da V3
-- NAO existem em migration alguma (so aparecem revogadas): o desenho abaixo e PROPOSTA, nao
-- copia — nomes proprios do V2.
--
-- DECISAO REGISTRADA (prazo por tabela, na propria base — tabela lgpd_retention_policy):
--   * prazos do documento de politica quando ele os define (rate_limit_logs 30 d, credential/
--     sessao 30-90 d, mensagens agendadas/chatbot 90 d, seguranca 365 d);
--   * prazos ADOTADOS para as tabelas de log/atividade sem prazo no documento (90 d atividade,
--     365 d seguranca), conforme o cartao;
--   * audit_logs e security_alerts ficam REGISTRADOS mas `enabled = false`: a acao do documento e
--     ARQUIVAR (nao apagar) e apagar log de auditoria exige politica do dono. Ficam visiveis na
--     tabela de politica como pendencia, sem serem tocados pelo job.
--   * csat_surveys / conversation_analyses / messages / contacts / campaign* tem acao
--     "Anonimizar"/"Excluir" sobre dado pessoal (reescrita de coluna, nao expurgo por data):
--     tambem ficam registrados e desligados. O expurgo de contato ja apagado (lixeira) SAI
--     desta migration pela funcao dedicada lgpd_purge_deleted_contacts.
--
-- ATOMICIDADE: um unico job (public.lgpd_retention_tick) chamado 1x/dia pelo pg_cron percorre a
-- politica LIGADA, em LOTE (p_limit), e grava 1 linha por tabela em lgpd_retention_runs
-- (contagem + erro, SEM dado pessoal). Falha de uma tabela nao derruba as outras (subtransacao
-- por tabela) nem repete trabalho ja feito. Reexecutar = 0 apagados.
--
-- Classe: ADITIVA (2 tabelas novas + 2 funcoes novas + 1 cron). Nao altera coluna, policy, funcao
-- nem dado existente. Idempotente/replayavel: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE,
-- ON CONFLICT DO UPDATE, cron.schedule com o mesmo nome = UPSERT, DROP FUNCTION IF EXISTS no
-- rollback.

-- ============================================================================
-- 1) Politica de retencao por tabela (a decisao, versionada na base)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lgpd_retention_policy (
  schema_name    text    NOT NULL DEFAULT 'public',
  table_name     text    NOT NULL,
  ts_column      text,
  retention_days integer NOT NULL,
  action         text    NOT NULL DEFAULT 'delete',
  enabled        boolean NOT NULL DEFAULT true,
  note           text,
  PRIMARY KEY (schema_name, table_name),
  CONSTRAINT lgpd_retention_policy_action_check
    CHECK (action IN ('delete', 'purge_deleted_contacts')),
  CONSTRAINT lgpd_retention_policy_days_check CHECK (retention_days BETWEEN 1 AND 3650),
  CONSTRAINT lgpd_retention_policy_ts_check
    CHECK (action <> 'delete' OR ts_column IS NOT NULL)
);

ALTER TABLE public.lgpd_retention_policy ENABLE ROW LEVEL SECURITY;
-- O default do schema concede DML completo a anon/authenticated/service_role em toda tabela nova:
-- sem estes REVOKEs um `authenticated` reescreveria a politica (e ligaria o expurgo de QUALQUER
-- tabela). Nenhuma policy e criada: sem GRANT, nem RLS e consultada — a escrita e negada na ACL.
REVOKE ALL ON TABLE public.lgpd_retention_policy FROM PUBLIC, anon, authenticated, service_role;
-- service_role le para observabilidade; NAO escreve (a politica muda so por migration).
GRANT SELECT ON TABLE public.lgpd_retention_policy TO service_role;

COMMENT ON TABLE public.lgpd_retention_policy IS
  'Prazo de retencao por tabela (dias e acao) e a decisao registrada do dono. So migration escreve.';
COMMENT ON COLUMN public.lgpd_retention_policy.action IS
  'delete = apaga linhas mais antigas que retention_days por ts_column; purge_deleted_contacts = expurgo definitivo de contato na lixeira (usa lgpd_purge_deleted_contacts).';
COMMENT ON COLUMN public.lgpd_retention_policy.enabled IS
  'false = registrado sem execucao (acao exige politica do dono ou reescrita de dado pessoal).';

-- ============================================================================
-- 2) Auditoria por execucao (contagem, sem dado pessoal)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lgpd_retention_runs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at         timestamptz NOT NULL DEFAULT now(),
  schema_name    text        NOT NULL,
  table_name     text        NOT NULL,
  retention_days integer     NOT NULL,
  deleted_count  bigint      NOT NULL DEFAULT 0,
  error          text
);

ALTER TABLE public.lgpd_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lgpd_retention_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.lgpd_retention_runs TO service_role;

COMMENT ON TABLE public.lgpd_retention_runs IS
  'Trilha de cada expurgo por tabela (quantas linhas sairam, quando e o erro, se houve). Nunca guarda dado pessoal.';

CREATE INDEX IF NOT EXISTS idx_lgpd_retention_runs_ran_at ON public.lgpd_retention_runs (ran_at DESC);

-- ============================================================================
-- 3) A decisao registrada: o que passa a expurgar e o que fica pendente
-- ============================================================================
INSERT INTO public.lgpd_retention_policy (schema_name, table_name, ts_column, retention_days, action, enabled, note) VALUES
  ('public', 'user_sessions',             'last_activity_at', 90,  'delete', true,  'Politica 4.2: log de acesso 90 d'),
  ('public', 'user_devices',              'created_at',       90,  'delete', true,  'Politica 4.2: fingerprint 90 d'),
  ('public', 'login_attempts',            'created_at',       90,  'delete', true,  'Politica 4.2: log de seguranca 90 d'),
  ('public', 'mfa_sessions',              'created_at',       30,  'delete', true,  'Politica 4.2: autenticacao 30 d'),
  ('public', 'password_reset_requests',   'created_at',       30,  'delete', true,  'Politica 4.4: seguranca 30 d'),
  ('public', 'rate_limit_logs',           'created_at',       30,  'delete', true,  'Politica 4.4: seguranca 30 d'),
  ('public', 'blocked_ips',               'created_at',      365,  'delete', true,  'Politica 4.4: seguranca 1 ano'),
  ('public', 'scheduled_messages',        'created_at',       90,  'delete', true,  'Politica 4.3: operacional 90 d'),
  ('public', 'chatbot_executions',        'created_at',       90,  'delete', true,  'Politica 4.3: operacional 90 d'),
  ('public', 'webhook_rate_limits',       'created_at',       90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'query_telemetry',           'created_at',       90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'conversation_events',       'created_at',       90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'voice_command_logs',        'created_at',       90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'performance_snapshots',     'created_at',       90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'webhook_failures',          'error_at',         90,  'delete', true,  'Adotado 90 d (atividade)'),
  ('public', 'ai_usage_logs',             'created_at',      365,  'delete', true,  'Adotado 365 d (seguranca/custo)'),
  ('public', 'catalog_send_events',       'created_at',      365,  'delete', true,  'Adotado 365 d (atividade)'),
  ('public', 'meta_capi_events',          'created_at',      365,  'delete', true,  'Adotado 365 d (atividade)'),
  ('public', 'entity_versions',           'created_at',      365,  'delete', true,  'Adotado 365 d (versao de registro)'),
  ('public', 'contacts',                  'deleted_at',       30,  'purge_deleted_contacts', true, 'Contato na lixeira 30 d (relogio do SERVIDOR via contact_deletion_audit)'),
  ('public', 'audit_logs',                'created_at',     1825,  'delete', false, 'PENDENTE DO DONO: politica 4.3 diz ARQUIVAR (5 anos). Nao apagar sem decisao.'),
  ('public', 'security_alerts',           'created_at',     1825,  'delete', false, 'PENDENTE DO DONO: politica 4.4 diz ARQUIVAR (5 anos).'),
  ('public', 'csat_surveys',              'created_at',      730,  'delete', false, 'PENDENTE: acao e ANONIMIZAR (reescrita de dado pessoal), nao expurgo por data.'),
  ('public', 'conversation_analyses',     'created_at',      730,  'delete', false, 'PENDENTE: acao e ANONIMIZAR.'),
  ('public', 'messages',                  'created_at',      730,  'delete', false, 'PENDENTE: acao e ANONIMIZAR (texto de mensagem).'),
  ('public', 'campaigns',                 'created_at',      730,  'delete', false, 'PENDENTE: exclusao operacional com dependencias; avaliar junto do Talk X.'),
  ('public', 'campaign_contacts',         'created_at',      730,  'delete', false, 'PENDENTE: idem campaigns.')
ON CONFLICT (schema_name, table_name) DO UPDATE
  SET ts_column = EXCLUDED.ts_column,
      retention_days = EXCLUDED.retention_days,
      action = EXCLUDED.action,
      enabled = EXCLUDED.enabled,
      note = EXCLUDED.note;

-- ============================================================================
-- 4) Expurgo definitivo de contato na lixeira
--    Relogio CONFIACEL: contacts.deleted_at e gravado pelo CLIENTE (nao serve como tempo);
--    por isso a idade vem de contact_deletion_audit.performed_at (relogio do servidor) e so
--    apaga quem tem a ULTIMA mudanca de marcador como 'delete'/'update_marker' vencida — um
--    contato restaurado, ou sem registro confiavel, NUNCA e apagado. O gatilho
--    trg_audit_contact_purge grava a linha 'purge' na trilha (contact_deletion_audit nao tem FK
--    para contacts, entao a trilha sobrevive ao DELETE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lgpd_purge_deleted_contacts(p_days integer DEFAULT 30, p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_deleted integer;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'invalid_lgpd_purge_days' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'invalid_lgpd_purge_limit' USING ERRCODE = '22023';
  END IF;

  WITH alvo AS (
    SELECT c.id
      FROM public.contacts c
      JOIN LATERAL (
        SELECT a.operation, a.performed_at
          FROM public.contact_deletion_audit a
         WHERE a.contact_id = c.id
           AND a.operation IN ('delete', 'restore', 'update_marker')
         ORDER BY a.performed_at DESC, a.id DESC
         LIMIT 1
      ) u ON true
     WHERE c.deleted_at IS NOT NULL
       AND u.operation IN ('delete', 'update_marker')
       AND u.performed_at < now() - make_interval(days => p_days)
     ORDER BY u.performed_at
     LIMIT p_limit
  )
  DELETE FROM public.contacts c USING alvo WHERE c.id = alvo.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.lgpd_purge_deleted_contacts(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_purge_deleted_contacts(integer, integer) TO service_role;

COMMENT ON FUNCTION public.lgpd_purge_deleted_contacts(integer, integer) IS
  'Expurgo definitivo (DELETE em public.contacts) de contato na lixeira ha mais de p_days dias, em lote. Idade pelo relogio do servidor (contact_deletion_audit.performed_at). Retorna quantos foram apagados.';

-- ============================================================================
-- 5) O job: percorre a politica LIGADA, em lote, e audita cada tabela
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lgpd_retention_tick(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r          record;
  v_deleted  bigint;
  v_sql      text;
  v_total    bigint := 0;
  v_out      jsonb  := '{}'::jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'invalid_lgpd_retention_limit' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT schema_name, table_name, ts_column, retention_days, action
      FROM public.lgpd_retention_policy
     WHERE enabled
     ORDER BY schema_name, table_name
  LOOP
    -- Subtransacao por tabela: falha de uma (FK, lock, nome errado) vira 1 linha de erro e NAO
    -- derruba o resto nem deixa efeito parcial daquele passo.
    BEGIN
      IF r.action = 'purge_deleted_contacts' THEN
        v_deleted := public.lgpd_purge_deleted_contacts(r.retention_days, least(p_limit, 500));
      ELSE
        -- Guarda: nome de tabela/coluna so entra por migration, mas confere antes de montar o SQL.
        IF NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = r.schema_name AND c.relname = r.table_name
             AND c.relkind IN ('r', 'p')
        ) OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = r.schema_name AND c.relname = r.table_name
             AND a.attname = r.ts_column AND a.attnum > 0 AND NOT a.attisdropped
        ) THEN
          RAISE EXCEPTION 'lgpd_retention_objeto_inexistente: %.%.%', r.schema_name, r.table_name, r.ts_column
            USING ERRCODE = '42703';
        END IF;

        v_sql := format(
          'DELETE FROM %I.%I WHERE ctid IN (SELECT ctid FROM %I.%I WHERE %I < now() - make_interval(days => %s) ORDER BY %I LIMIT %s)',
          r.schema_name, r.table_name,
          r.schema_name, r.table_name,
          r.ts_column, r.retention_days, r.ts_column, p_limit);
        EXECUTE v_sql;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
      END IF;

      INSERT INTO public.lgpd_retention_runs (schema_name, table_name, retention_days, deleted_count)
      VALUES (r.schema_name, r.table_name, r.retention_days, v_deleted);

      v_total := v_total + v_deleted;
      v_out := v_out || jsonb_build_object(r.table_name, v_deleted);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.lgpd_retention_runs (schema_name, table_name, retention_days, deleted_count, error)
      VALUES (r.schema_name, r.table_name, r.retention_days, 0, left(SQLERRM, 200));
    END;
  END LOOP;

  RETURN jsonb_build_object('deleted_total', v_total, 'by_table', v_out, 'limit', p_limit);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.lgpd_retention_tick(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_retention_tick(integer) TO service_role;

COMMENT ON FUNCTION public.lgpd_retention_tick(integer) IS
  'Job LGPD de retencao: percorre lgpd_retention_policy (enabled), apaga em lote (p_limit) e grava 1 linha por tabela em lgpd_retention_runs. Reexecutar sem dado vencido = 0 apagados.';

-- ============================================================================
-- 6) Agenda diaria (idempotente: mesmo nome = UPSERT no pg_cron)
-- ============================================================================
DO $$
BEGIN
  PERFORM cron.schedule('lgpd-retention-daily', '30 4 * * *', 'select public.lgpd_retention_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'lgpd_retention_cron_schedule_skipped: %', SQLERRM;
END;
$$;
