-- lgpd_retention_jobs — prova do job de retencao LGPD (cartao t_63416647)
-- (supabase/migrations/20261013043542_lgpd_retention_jobs.sql)
--
-- O QUE PROVA (criterio do cartao, itens B e C):
--   T1 a decisao registrada existe: 20 tabelas LIGADAS para expurgo por data e as de
--      acao "arquivar"/"anonimizar" (audit_logs, security_alerts, csat_surveys,
--      conversation_analyses, messages) ficam REGISTRADAS e DESLIGADAS;
--   T2 linha DENTRO do prazo FICA;
--   T3 linha FORA do prazo SAI (e a contagem entra em lgpd_retention_runs);
--   T4 tabela DESLIGADA nunca e tocada, mesmo com linha muito velha;
--   T5 reexecutar e IDEMPOTENTE (0 apagados na 2a rodada, nada duplicado);
--   T6 contato na lixeira vencido SAI (relogio do SERVIDOR via realizado em
--      contact_deletion_audit), a TRILHA sobrevive (linha 'purge') e a contagem vai
--      para lgpd_retention_runs;
--   T7 contato RESTAURADO depois (ultima operacao 'restore') NAO e apagado;
--   T8 contato SEM registro de auditoria NAO e apagado (nao confio no relogio do cliente);
--   T9 contato DENTRO do prazo NAO e apagado;
--  T10 guarda de parametro: p_limit/p_days invalido aborta com 22023;
--  T11 PERMISSAO: authenticated/anon NAO executam o job nem escrevem na politica
--      (42501) — quem executa e so service_role/owner.
--
-- COMO RODA: no banco LOCAL descartavel da tarefa (o mesmo de hermes-db-migrar),
-- com TODAS as migrations aplicadas — e dele que vem contacts, contact_deletion_audit
-- e o gatilho trg_audit_contact_purge, que NAO sao recriados aqui:
--   printf '<conteudo>' | zapp-db-local psql . <nome-do-banco>
-- Tudo dentro de UMA transacao que termina em ROLLBACK (zero efeito colateral,
-- reexecutavel). O teste DESLIGA as politicas reais dentro da transacao para nao mexer
-- no dado pre-existente do banco — exercita so as linhas sinteticas dele.
-- VERMELHO esperado sem a migration: public.lgpd_retention_tick nao existe (42883).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $ok$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_msg;
  END IF;
END;
$ok$;

-- ---------------------------------------------------------------------------
-- T1 — a decisao esta registrada na base
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ligadas int; v_desligadas int;
BEGIN
  SELECT count(*) INTO v_ligadas   FROM public.lgpd_retention_policy WHERE enabled;
  SELECT count(*) INTO v_desligadas FROM public.lgpd_retention_policy WHERE NOT enabled;
  PERFORM pg_temp.ok(v_ligadas = 20, format('esperava 20 politicas ligadas, achei %s', v_ligadas));
  PERFORM pg_temp.ok(v_desligadas = 7, format('esperava 7 politicas registradas e desligadas, achei %s', v_desligadas));
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.lgpd_retention_policy
             WHERE table_name = 'audit_logs' AND NOT enabled
               AND note LIKE 'PENDENTE%'),
    'audit_logs precisa estar registrado como PENDENTE do dono (nao apagar sem politica)');
  PERFORM pg_temp.ok(
    (SELECT action FROM public.lgpd_retention_policy WHERE table_name = 'contacts') = 'purge_deleted_contacts',
    'contacts precisa apontar para o expurgo de lixeira, nao para delete por data');
END;
$$;

-- Daqui pra frente so as linhas sinteticas deste teste movem.
UPDATE public.lgpd_retention_policy
   SET enabled = false
 WHERE table_name NOT IN ('lgpd_ret_probe_a', 'lgpd_ret_probe_b', 'contacts');

-- ---------------------------------------------------------------------------
-- Superficie sintetica: 2 tabelas-probe + 1 tabela-probe desligada
-- ---------------------------------------------------------------------------
CREATE TABLE public.lgpd_ret_probe_a (id int PRIMARY KEY, created_at timestamptz NOT NULL);
CREATE TABLE public.lgpd_ret_probe_b (id int PRIMARY KEY, created_at timestamptz NOT NULL);

INSERT INTO public.lgpd_retention_policy (schema_name, table_name, ts_column, retention_days, action, enabled, note) VALUES
  ('public', 'lgpd_ret_probe_a', 'created_at', 90, 'delete', true,  'teste: ligada'),
  ('public', 'lgpd_ret_probe_b', 'created_at', 90, 'delete', false, 'teste: desligada')
ON CONFLICT (schema_name, table_name) DO UPDATE
  SET ts_column = EXCLUDED.ts_column, retention_days = EXCLUDED.retention_days,
      action = EXCLUDED.action, enabled = EXCLUDED.enabled, note = EXCLUDED.note;

INSERT INTO public.lgpd_ret_probe_a VALUES
  (1, now() - interval '1 day'),     -- T2 dentro do prazo (fica)
  (2, now() - interval '100 days');  -- T3 vencido (sai)
INSERT INTO public.lgpd_ret_probe_b VALUES
  (1, now() - interval '2000 days'); -- T4 desligada (fica sempre)

-- Contatos (lixeira) — C1 vencido, C2 dentro do prazo, C3 restaurado, C4 sem auditoria
INSERT INTO public.contacts (id, name, phone, deleted_at) VALUES
  ('00000000-0000-0000-0000-00000000c001', 'LGPD teste vencido',     '+5599991000001', now() - interval '40 days'),
  ('00000000-0000-0000-0000-00000000c002', 'LGPD teste dentro',      '+5599991000002', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000c003', 'LGPD teste restaurado',  '+5599991000003', now() - interval '50 days'),
  ('00000000-0000-0000-0000-00000000c004', 'LGPD teste sem trilha',  '+5599991000004', now() - interval '50 days');

INSERT INTO public.contact_deletion_audit (contact_id, operation, deleted_at_to, performed_at, performed_by_db_role) VALUES
  ('00000000-0000-0000-0000-00000000c001', 'delete', now() - interval '40 days', now() - interval '40 days', 'teste');
INSERT INTO public.contact_deletion_audit (contact_id, operation, deleted_at_to, performed_at, performed_by_db_role) VALUES
  ('00000000-0000-0000-0000-00000000c002', 'delete', now() - interval '10 days', now() - interval '10 days', 'teste');
INSERT INTO public.contact_deletion_audit (contact_id, operation, deleted_at_to, performed_at, performed_by_db_role) VALUES
  ('00000000-0000-0000-0000-00000000c003', 'delete', now() - interval '50 days', now() - interval '50 days', 'teste');
INSERT INTO public.contact_deletion_audit (contact_id, operation, deleted_at_from, performed_at, performed_by_db_role) VALUES
  ('00000000-0000-0000-0000-00000000c003', 'restore', now() - interval '40 days', now() - interval '40 days', 'teste');

-- ---------------------------------------------------------------------------
-- 1a rodada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_res jsonb; v_n int;
BEGIN
  SELECT public.lgpd_retention_tick(1000) INTO v_res;

  -- T3 tabela ligada: vencido saiu, dentro ficou
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.lgpd_ret_probe_a WHERE id = 2),
    'T3: linha vencida deveria ter sido apagada de lgpd_ret_probe_a');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.lgpd_ret_probe_a WHERE id = 1),
    'T2: linha dentro do prazo NAO deveria ser apagada');
  PERFORM pg_temp.ok((v_res->'by_table'->>'lgpd_ret_probe_a')::int = 1,
    format('T3: contagem da tabela-probe deveria ser 1, veio %s', v_res->'by_table'->>'lgpd_ret_probe_a'));

  -- T4 tabela desligada intacta
  PERFORM pg_temp.ok((SELECT count(*) FROM public.lgpd_ret_probe_b) = 1,
    'T4: lgpd_ret_probe_b esta DESLIGADA e nao podia ser tocada');

  -- T6 contato vencido saiu + trilha sobreviveu
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '00000000-0000-0000-0000-00000000c001'),
    'T6: contato vencido na lixeira deveria ter sido expurgado');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.contact_deletion_audit
                              WHERE contact_id = '00000000-0000-0000-0000-00000000c001' AND operation = 'purge'),
    'T6: a trilha de auditoria (linha purge) precisa sobreviver ao expurgo');

  -- T7/T8/T9 os outros contatos ficam
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.contacts WHERE id = '00000000-0000-0000-0000-00000000c002'),
    'T9: contato dentro do prazo NAO podia ser expurgado');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.contacts WHERE id = '00000000-0000-0000-0000-00000000c003'),
    'T7: contato RESTAURADO nao podia ser expurgado');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.contacts WHERE id = '00000000-0000-0000-0000-00000000c004'),
    'T8: contato SEM trilha de auditoria nao podia ser expurgado');

  -- conta no trilho de execucao (sem dado pessoal)
  PERFORM pg_temp.ok((SELECT deleted_count FROM public.lgpd_retention_runs
                       WHERE table_name = 'contacts' ORDER BY id DESC LIMIT 1) = 1,
    'T6: lgpd_retention_runs deveria registrar 1 contato expurgado');
  PERFORM pg_temp.ok((SELECT deleted_count FROM public.lgpd_retention_runs
                       WHERE table_name = 'lgpd_ret_probe_a' ORDER BY id DESC LIMIT 1) = 1,
    'T3: lgpd_retention_runs deveria registrar 1 linha apagada na tabela-probe');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.lgpd_retention_runs
                                  WHERE ran_at > now() - interval '5 min' AND error IS NOT NULL),
    'nenhuma tabela deveria falhar na rodada sintetica');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2a rodada — T5 idempotencia
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_res jsonb; v_antes int;
BEGIN
  SELECT count(*) INTO v_antes FROM public.lgpd_retention_runs;
  SELECT public.lgpd_retention_tick(1000) INTO v_res;
  PERFORM pg_temp.ok((v_res->>'deleted_total')::bigint = 0,
    format('T5: 2a rodada deveria apagar 0, apagou %s', v_res->>'deleted_total'));
  PERFORM pg_temp.ok((v_res->'by_table'->>'lgpd_ret_probe_a')::int = 0,
    'T5: tabela-probe deveria ter 0 na 2a rodada');
  PERFORM pg_temp.ok((v_res->'by_table'->>'contacts')::int = 0,
    'T5: contacts deveria ter 0 na 2a rodada');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.lgpd_retention_runs) > v_antes,
    'T5: cada rodada precisa deixar rastro em lgpd_retention_runs');
END;
$$;

-- ---------------------------------------------------------------------------
-- T10 guarda de parametro
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.lgpd_retention_tick(0);
    RAISE EXCEPTION 'FALHOU: tick(0) deveria abortar';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.lgpd_retention_tick(999999);
    RAISE EXCEPTION 'FALHOU: tick(999999) deveria abortar';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.lgpd_purge_deleted_contacts(0, 100);
    RAISE EXCEPTION 'FALHOU: purge(0 dias) deveria abortar';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- T11 permissao — quem pode executar/escrever
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.ok(NOT has_function_privilege('authenticated', 'public.lgpd_retention_tick(integer)', 'EXECUTE'),
    'authenticated nao pode ter EXECUTE no job');
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.lgpd_retention_tick(integer)', 'EXECUTE'),
    'anon nao pode ter EXECUTE no job');
  PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.lgpd_retention_tick(integer)', 'EXECUTE'),
    'service_role precisa poder executar o job');
  PERFORM pg_temp.ok(has_table_privilege('service_role', 'public.lgpd_retention_policy', 'SELECT'),
    'service_role precisa LER a politica');
  PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.lgpd_retention_policy', 'SELECT'),
    'authenticated nao pode ler nem escrever a politica');
  PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.lgpd_retention_policy', 'INSERT'),
    'authenticated nao pode escrever a politica');
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.lgpd_retention_tick(10);
    RAISE EXCEPTION 'FALHOU: authenticated executou o job (deveria ser 42501)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.lgpd_retention_policy (schema_name, table_name, retention_days)
    VALUES ('public', 'tabela_injetada', 1);
    RAISE EXCEPTION 'FALHOU: authenticated escreveu na politica (deveria ser 42501)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT 'OK — lgpd_retention_jobs: todas as provas (T1..T11) passaram' AS resultado;

ROLLBACK;
