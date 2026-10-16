-- purge_gmail_account_data
-- Rollback: DROP FUNCTION IF EXISTS public.purge_gmail_account_data(uuid, text);
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.purge_gmail_account_data(uuid, text);
--
-- PM-48 (auditoria de paridade V3 -> V2, doc 24-hooks-raiz-2): hoje `disconnect` zera os tokens
-- (access_token_encrypted/refresh_token_encrypted) e poe is_active=false, mas o corpo dos e-mails
-- fica no banco: email_threads, email_messages (body_text/body_html) e email_attachments continuam
-- para sempre. gmail_accounts.user_id e ON DELETE RESTRICT de proposito
-- (20260926240000_restrict_gmail_accounts_cascade.sql), entao apagar o usuario nao limpa nada.
--
-- Este cartao NAO apaga nada sozinho: ele apenas passa a OFERECER ao admin uma funcao explicita.
-- Nada aqui roda em producao -- quem aplica e o Joaquim (regra da fabrica).
--
-- Decisoes desta migration (uma funcao nova, nada mais):
--   * `SECURITY DEFINER` com `search_path` fixo (`public, pg_temp`), dono postgres: apaga
--     ignorando as policies de DELETE das 4 tabelas de e-mail (hoje so o dono da conta, e nao o
--     admin, pode dar DELETE em thread/mensagem -- a limpeza e administrativa e nao pode depender
--     de policy alargada).
--   * EXECUTE so para `authenticated` (REVOKE de PUBLIC/anon/service_role) e checagem interna
--     `is_admin(auth.uid())` DEPOIS da ACL: quem nao for admin recebe 42501 admin_required.
--   * Elegibilidade: conta precisa existir, estar com `is_active = false` (desconectada) e
--     `p_confirm` precisa ser IGUAL ao email da conta. Conta inexistente, conta ativa e
--     confirmacao errada devolvem o MESMO erro (22023 purge_not_allowed) -- sem oraculo de
--     existencia/estado por id.
--   * Tudo numa transacao (o corpo da funcao): valida tudo, trava a linha da conta com
--     `FOR UPDATE` (serializa duas limpezas concorrentes e a reconexao), apaga e registra
--     a auditoria. Falhou no meio? nada foi apagado.
--   * Auditoria em public.audit_logs: QUEM (user_id = auth.uid()), QUANDO (created_at) e QUANTAS
--     linhas por tabela. SEM o email completo (guarda so a mascara `x***@***`) e SEM nenhum
--     assunto/corpo/remetente.
--   * Ordem dos DELETEs: email_attachments -> email_messages -> email_threads -> email_drafts
--     (filho antes do pai). `email_drafts` NAO existe nesta branch (nem no catalogo
--     supabase/schema-catalog.json); o DELETE dela e condicional (`to_regclass`) para a funcao
--     seguir correta quando/se a tabela existir, sem criar tabela nenhuma aqui.
--   * Efeito colateral declarado: `email_messages` e `email_threads` estao na publicacao
--     supabase_realtime com REPLICA IDENTITY FULL (20260828190000/20260828230000), entao cada
--     DELETE publica evento realtime para os assinantes filtrados por gmail_account_id -- e assim
--     que a lista de e-mails do app se esvazia sozinha. Os gatilhos das tabelas tocadas sao
--     BEFORE UPDATE `updated_at` (gmail_accounts, email_threads), BEFORE UPDATE de
--     last_message_at e AFTER INSERT/UPDATE em email_messages
--     (`trg_sync_thread_last_sender`): nenhum dispara em DELETE, e a limpeza nao faz UPDATE.

CREATE OR REPLACE FUNCTION public.purge_gmail_account_data(
  p_account_id uuid,
  p_confirm    text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account public.gmail_accounts;
  v_mask    text;
  v_att     bigint := 0;
  v_msg     bigint := 0;
  v_thr     bigint := 0;
  v_draft   bigint := 0;
  v_details jsonb;
BEGIN
  -- 1) Quem chama precisa ser admin. A ACL ja barra anon/service_role antes de chegar aqui;
  --    esta e a barreira que vale para qualquer authenticated (agente, supervisor).
  IF public.is_admin(auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- 2) Trava a conta. Mesma resposta para conta inexistente, conta ativa e confirmacao errada.
  SELECT * INTO v_account
    FROM public.gmail_accounts
   WHERE id = p_account_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_account.is_active IS TRUE
     OR p_confirm IS DISTINCT FROM v_account.email_address THEN
    RAISE EXCEPTION 'purge_not_allowed' USING ERRCODE = '22023';
  END IF;

  -- 3) Apaga do filho para o pai. Nao ha UPDATE: nenhum gatilho de updated_at e disparado.
  DELETE FROM public.email_attachments a
   WHERE a.email_message_id IN (
     SELECT m.id FROM public.email_messages m WHERE m.gmail_account_id = p_account_id
   );
  GET DIAGNOSTICS v_att = ROW_COUNT;

  DELETE FROM public.email_messages WHERE gmail_account_id = p_account_id;
  GET DIAGNOSTICS v_msg = ROW_COUNT;

  DELETE FROM public.email_threads WHERE gmail_account_id = p_account_id;
  GET DIAGNOSTICS v_thr = ROW_COUNT;

  -- email_drafts nao existe nesta branch; se a tabela existir, entra na mesma limpeza.
  IF to_regclass('public.email_drafts') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.email_drafts WHERE gmail_account_id = $1' USING p_account_id;
    GET DIAGNOSTICS v_draft = ROW_COUNT;
  END IF;

  -- 4) Auditoria: quem, quando e quantas linhas. Mascara em vez do email completo.
  v_mask := left(split_part(v_account.email_address, '@', 1), 1) || '***@***';

  v_details := jsonb_build_object(
    'account_id',   p_account_id,
    'email_masked', v_mask,
    'deleted', jsonb_build_object(
      'email_attachments', v_att,
      'email_messages',    v_msg,
      'email_threads',     v_thr,
      'email_drafts',      v_draft
    ),
    'total_rows', v_att + v_msg + v_thr + v_draft
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'gmail_account_data_purged', 'gmail_account', p_account_id, v_details);

  RETURN v_details;
END;
$function$;

COMMENT ON FUNCTION public.purge_gmail_account_data(uuid, text) IS
  'Apaga, por acao explicita do ADMIN, os e-mails (threads, mensagens, anexos e drafts) de uma conta Gmail DESCONECTADA (is_active=false). Exige p_confirm = email da conta. Registra a limpeza em audit_logs sem o email completo e sem conteudo.';

-- ACL: so `authenticated` executa, e a checagem de admin e feita por dentro.
REVOKE ALL ON FUNCTION public.purge_gmail_account_data(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_gmail_account_data(uuid, text)
  TO authenticated;
