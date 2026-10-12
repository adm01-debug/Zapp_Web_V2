-- contact_consents_lgpd — prova de contrato (LGPD: consentimento por finalidade e canal).
--
-- Roda no banco LOCAL da tarefa, aplicando a migration REAL já migrada por hermes-db-migrar.
-- Execução: zapp-db-local psql . <db> < supabase/tests/contact_consents_lgpd.sql
--
-- O que prova:
--   E1 anon NÃO executa as RPCs (EXECUTE revogado).
--   E2 atendente alheio (não vê o contato) NÃO concede/revoga  -> 42501 consent_forbidden.
--   E3 o atendente do contato concede marketing/WhatsApp (hist. 1 linha, concedido=true).
--   E4 conceder marketing/WhatsApp marca contacts.consent_status='granted' e audita.
--   E5 revogar marketing/WhatsApp PRESERVA o histórico (2 linhas), estado atual concedido=false.
--   E6 revogar marketing/WhatsApp marca consent_status='revoked' (o Talk X sempre exclui) e
--      inclui o contato na supressão existente (talkx_blacklist ativa, reason_code=lgpd).
--   E7 RLS: o atendente alheio não LÊ os consentimentos do contato; o dono lê; a view
--      (security_invoker) também respeita a RLS.
--   E8 INSERT direto na tabela pela API é negado (escrita só pelas RPCs).
--   E9 staff (admin) concede no contato de outro atendente.
--   E10 entrada inválida (finalidade/canal) é recusada sem gravar nada.
--
-- Tudo em UMA transação; termina com ROLLBACK (o banco local fica como estava).
\set ON_ERROR_STOP on

BEGIN;

-- ── Fixture (como postgres; triggers/FK desativados só para montar o cenário) ─────────────
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@teste.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'c@teste.local');

INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Atendente A', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Atendente B', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'Admin C', 'admin');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 'admin');

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Contato do A', '+5511900000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', 'Contato do B', '+5511900000002', 'bbbbbbbb-0000-0000-0000-000000000002');

SET LOCAL session_replication_role = default;  -- volta a valer FK/trigger para o resto do teste

-- ── E1: anon não executa as RPCs ─────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
DO $e1$
BEGIN
  BEGIN
    PERFORM public.grant_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp', 'consentimento');
    RAISE EXCEPTION 'E1 FALHOU: anon conseguiu executar grant_contact_consent';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'E1 OK: anon sem EXECUTE em grant_contact_consent';
  END;
  BEGIN
    PERFORM public.revoke_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp');
    RAISE EXCEPTION 'E1 FALHOU: anon conseguiu executar revoke_contact_consent';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'E1 OK: anon sem EXECUTE em revoke_contact_consent';
  END;
END
$e1$;
RESET ROLE;

-- ── E2: atendente alheio (não vê o contato) não concede/revoga ───────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
DO $e2$
BEGIN
  BEGIN
    PERFORM public.grant_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp', 'consentimento');
    RAISE EXCEPTION 'E2 FALHOU: atendente alheio concedeu consentimento';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'E2 OK: atendente alheio recusado (consent_forbidden)';
  END;
  BEGIN
    PERFORM public.revoke_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp');
    RAISE EXCEPTION 'E2 FALHOU: atendente alheio revogou consentimento';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'E2 OK: atendente alheio não revoga';
  END;
END
$e2$;
RESET ROLE;

-- ── E3/E4: o atendente do contato concede marketing/WhatsApp ────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.grant_contact_consent(
  'cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp', 'consentimento') AS id_concedido;
RESET ROLE;

DO $e34$
DECLARE
  v_n integer;
  v_ok boolean;
BEGIN
  SELECT count(*) INTO v_n FROM public.contact_consents
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001'
     AND finalidade = 'marketing' AND canal = 'whatsapp';
  IF v_n <> 1 THEN RAISE EXCEPTION 'E3 FALHOU: esperava 1 evento de concessão, veio %', v_n; END IF;

  SELECT concedido INTO v_ok FROM public.contact_consents_current
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001'
     AND finalidade = 'marketing' AND canal = 'whatsapp';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E3 FALHOU: estado atual deveria ser concedido=true'; END IF;

  SELECT (consent_status = 'granted') INTO v_ok FROM public.contacts
   WHERE id = 'cccccccc-0000-0000-0000-000000000001';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E4 FALHOU: consent_status deveria ser granted'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'grant_contact_consent'
       AND entity_type = 'contact'
       AND entity_id = 'cccccccc-0000-0000-0000-000000000001'
       AND user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  ) INTO v_ok;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E4 FALHOU: faltou a linha de auditoria da concessão'; END IF;

  RAISE NOTICE 'E3/E4 OK: concessão gravada (1 evento), consent_status=granted e auditada';
END
$e34$;

-- ── E5/E6: o atendente revoga marketing/WhatsApp ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.revoke_contact_consent(
  'cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp') AS id_revogado;
RESET ROLE;

DO $e56$
DECLARE
  v_n integer;
  v_ok boolean;
BEGIN
  SELECT count(*) INTO v_n FROM public.contact_consents
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001'
     AND finalidade = 'marketing' AND canal = 'whatsapp';
  IF v_n <> 2 THEN RAISE EXCEPTION 'E5 FALHOU: historico deveria ter 2 linhas, veio %', v_n; END IF;

  SELECT concedido INTO v_ok FROM public.contact_consents_current
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001'
     AND finalidade = 'marketing' AND canal = 'whatsapp';
  IF v_ok IS NOT FALSE THEN RAISE EXCEPTION 'E5 FALHOU: estado atual deveria ser concedido=false'; END IF;

  SELECT (consent_status = 'revoked') INTO v_ok FROM public.contacts
   WHERE id = 'cccccccc-0000-0000-0000-000000000001';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E6 FALHOU: consent_status deveria ser revoked'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.talkx_blacklist
     WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001'
       AND removed_at IS NULL
       AND reason_code = 'lgpd'
  ) INTO v_ok;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E6 FALHOU: contato nao entrou na supressao do Talk X'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'revoke_contact_consent'
       AND entity_id = 'cccccccc-0000-0000-0000-000000000001'
  ) INTO v_ok;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E6 FALHOU: faltou a linha de auditoria da revogacao'; END IF;

  RAISE NOTICE 'E5/E6 OK: historico preservado (2 eventos), estado atual revogado, consent_status=revoked, supressao ativa e auditado';
END
$e56$;

-- ── E7: RLS — o alheio não lê; o dono lê; a view respeita a RLS ─────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
DO $e7a$
DECLARE v_t integer; v_v integer;
BEGIN
  SELECT count(*) INTO v_t FROM public.contact_consents
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001';
  IF v_t <> 0 THEN RAISE EXCEPTION 'E7 FALHOU: atendente alheio leu % consentimentos', v_t; END IF;
  SELECT count(*) INTO v_v FROM public.contact_consents_current
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001';
  IF v_v <> 0 THEN RAISE EXCEPTION 'E7 FALHOU: a view vazou % linhas ao alheio', v_v; END IF;
  RAISE NOTICE 'E7 OK: RLS esconde o consentimento do contato do alheio (tabela e view)';
END
$e7a$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
DO $e7b$
DECLARE v_t integer;
BEGIN
  SELECT count(*) INTO v_t FROM public.contact_consents
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000001';
  IF v_t <> 2 THEN RAISE EXCEPTION 'E7 FALHOU: o dono deveria ver 2 eventos, viu %', v_t; END IF;
  RAISE NOTICE 'E7 OK: o atendente do contato lê os 2 eventos';
END
$e7b$;

-- ── E8: INSERT direto pela API é negado ─────────────────────────────────────────────────
DO $e8$
BEGIN
  BEGIN
    INSERT INTO public.contact_consents (contact_id, finalidade, canal, concedido, base_legal, registrado_por)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'marketing', 'email', true, 'consentimento',
            'bbbbbbbb-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'E8 FALHOU: INSERT direto de authenticated foi aceito';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'E8 OK: escrita direta negada (so pelas RPCs)';
  END;
END
$e8$;
RESET ROLE;

-- ── E9: staff (admin) concede no contato de outro atendente ─────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT public.grant_contact_consent(
  'cccccccc-0000-0000-0000-000000000002', 'marketing', 'email', 'consentimento') AS id_admin;
RESET ROLE;

DO $e9$
DECLARE v_ok boolean;
BEGIN
  SELECT (concedido AND base_legal = 'consentimento') INTO v_ok FROM public.contact_consents_current
   WHERE contact_id = 'cccccccc-0000-0000-0000-000000000002'
     AND finalidade = 'marketing' AND canal = 'email';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E9 FALHOU: admin nao conseguiu conceder no contato de outro'; END IF;
  -- marketing/email NAO mexe no consent_status (o eixo do Talk X e marketing/WhatsApp)
  SELECT (consent_status IS DISTINCT FROM 'granted') INTO v_ok FROM public.contacts
   WHERE id = 'cccccccc-0000-0000-0000-000000000002';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'E9 FALHOU: marketing/email nao deveria mexer em consent_status'; END IF;
  RAISE NOTICE 'E9 OK: admin concede no contato de outro; eixo email nao toca consent_status';
END
$e9$;

-- ── E10: entrada inválida é recusada sem gravar ─────────────────────────────────────────
DO $e10$
DECLARE v_n integer;
BEGIN
  BEGIN
    PERFORM public.grant_contact_consent('cccccccc-0000-0000-0000-000000000001', 'espionagem', 'whatsapp', 'consentimento');
    RAISE EXCEPTION 'E10 FALHOU: finalidade invalida aceita';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.grant_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'telegram', 'consentimento');
    RAISE EXCEPTION 'E10 FALHOU: canal invalido aceito';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.grant_contact_consent('cccccccc-0000-0000-0000-000000000001', 'marketing', 'whatsapp', 'porque sim');
    RAISE EXCEPTION 'E10 FALHOU: base legal invalida aceita';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  SELECT count(*) INTO v_n FROM public.contact_consents
   WHERE registrado_em > now() - interval '5 minutes'
     AND concedido IS TRUE AND base_legal = 'porque sim';
  IF v_n <> 0 THEN RAISE EXCEPTION 'E10 FALHOU: entrada invalida gravou linha'; END IF;
  RAISE NOTICE 'E10 OK: finalidade/canal/base legal invalidos recusados sem gravar';
END
$e10$;

SELECT 'contact_consents_lgpd: TODAS AS ASSERCOES PASSARAM' AS resultado;

ROLLBACK;
