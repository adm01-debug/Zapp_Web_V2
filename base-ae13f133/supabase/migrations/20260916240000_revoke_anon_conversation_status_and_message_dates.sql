-- CRITICO -- achado na revisao exaustiva do plano de 50 etapas (2026-09-16, 3a
-- rodada de auditoria). Confirmado ao vivo via has_function_privilege: anon
-- (chave publica embutida em todo o bundle do front) tinha EXECUTE em duas
-- funcoes SECURITY DEFINER sem NENHUM check de autorizacao no corpo:
--
-- 1. set_conversation_status(p_contact_id, p_next, p_reason) -- ESCRITA nao
--    autenticada. Qualquer chamador que soubesse (ou adivinhasse/enumerasse)
--    um contact_id conseguia mudar o status da conversa de QUALQUER contato
--    real do sistema, so validando a maquina de estados (open/waiting/
--    resolved/archived), sem checar quem esta chamando. SECURITY DEFINER
--    bypassa a RLS de public.contacts. Pior que o achado ja em correcao no
--    PR #428 (aquele era leitura agregada; este e escrita em dado real de
--    conversa). Sem nenhum call site em src/ ou supabase/functions -- feature
--    ainda nao consumida pelo app, seguro revogar sem quebrar nada.
-- 2. get_last_message_dates(contact_ids) -- leitura nao autenticada: vaza
--    timestamp da ultima mensagem de qualquer contact_id para quem
--    enumerasse UUIDs. Usada legitimamente por src/services/contact.service.ts
--    (CRM autenticado) -- chamadas de usuario logado rodam como role
--    `authenticated` (o JWT de sessao, nao a chave anon, decide o role),
--    entao revogar so de `anon` nao quebra o fluxo real.
--
-- As outras 11 funcoes com EXECUTE para anon (checado individualmente nesta
-- auditoria) sao seguras: 4 trigger functions (RETURNS trigger, nao chamaveis
-- via RPC direto), 2 com guard interno `service_role_required`
-- (reschedule_talkx_recipient, transition_talkx_campaign), 3 SECURITY INVOKER
-- cujas tabelas-base tem RLS com policies de SELECT restritas a role
-- `authenticated` (confirmado via pg_policies -- anon nao ve nenhuma linha),
-- e 2 (talkx_benchmarks, record_talkx_link_click) ja cobertas pela migration
-- pendente do PR #428.
REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_last_message_dates(uuid[]) FROM anon;

REVOKE ALL ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_last_message_dates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_last_message_dates(uuid[]) TO authenticated, service_role;
