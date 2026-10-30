-- sec_p2_definer_storage — SEC-DEFINER_GRANTS_STORAGE -02, -03 e -04 (relatorio de auditoria de 07/10/2026).
-- Rollback: devolve as 2 policies de midia a busca por TEXTO de media_url (com o LIKE defeituoso), recria get_profile_role_for_check com o corpo anterior (que devolvia o papel de qualquer usuario) e volta o search_path das 8 funcoes para 'public'.
-- Rollback (SQL executavel, na ordem):
--   ALTER POLICY "Users can read assigned whatsapp media" ON storage.objects USING (bucket_id = 'whatsapp-media' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR (storage.foldername(name))[1] = auth.uid()::text ));
--   ALTER POLICY "Users can read assigned audio messages" ON storage.objects USING (bucket_id = 'audio-messages' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) ));
--   create or replace function public.get_profile_role_for_check(p_user_id uuid) returns table(role text, access_level text, permissions jsonb) language sql stable security definer set search_path = public as $$ SELECT p.role, p.access_level, p.permissions FROM profiles p WHERE p.user_id = p_user_id LIMIT 1; $$;
--   alter function public.is_within_business_hours(uuid) set search_path to 'public';
--   alter function public.reassign_overloaded_agents() set search_path to 'public';
--   alter function public.reassign_absent_agents(integer) set search_path to 'public';
--   alter function public.grant_agent_achievement(uuid, text, text, text, integer) set search_path to 'public';
--   alter function public.update_agent_streak(uuid, boolean) set search_path to 'public';
--   alter function public.increment_agent_resolutions(uuid) set search_path to 'public';
--   alter function public.update_own_profile(text, text, text, text, text, text) set search_path to 'public';
--   alter function public.get_own_lockout_status(text) set search_path to 'public';
--
--   -02  as duas policies de SELECT de midia autorizavam por `m.media_url LIKE '%/' || objects.name`:
--        o NOME do objeto entra cru no padrao e `%`/`_` viram curinga.
--   -03  get_profile_role_for_check(p_user_id) devolvia papel, access_level e permissions de QUALQUER usuario.
--   -04  9 funcoes definer (rodam com a identidade do dono) com tabela referenciada sem schema e search_path sem `pg_temp`
--        (o pg_temp e procurado ANTES de public quando nao esta no caminho: tabela temporaria da sessao
--        substitui a tabela real dentro da funcao).
-- Classe: contrato (ALTER POLICY / CREATE OR REPLACE FUNCTION / ALTER FUNCTION) - sem DML, sem GRANT novo.

-- ===========================================================================
-- -02  LIKE -> posse por CAMINHO
-- ===========================================================================
-- O `LIKE '%/' || objects.name` transforma `%` e `_` do NOME do objeto em curinga.
-- Cenario do relatorio: o atendente nomeia com `%` o arquivo que envia e passa a autorizar,
-- pela SUA mensagem, a leitura de objetos cujo caminho casa com o curinga.
-- Correcao: sai a comparacao por texto de media_url; a leitura passa a exigir posse do
-- CAMINHO (pasta do contato atribuido ao chamador, do proprio auth.uid(), ou admin/supervisor).
-- Mesma forma ja usada na policy "whatsapp media readable via visible message" (04/10) e na
-- correcao SEC-01 (t_15a57807) destas MESMAS duas policies: aqui fica aplicada na base deste
-- cartao, que ainda nao contem aquela migration; a forma e identica, entao a ordem de integracao
-- nao muda o resultado e o ramo por texto de media_url nao volta.
ALTER POLICY "Users can read assigned whatsapp media" ON storage.objects
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

ALTER POLICY "Users can read assigned audio messages" ON storage.objects
USING (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
  )
);

-- ===========================================================================
-- -03 + -04  get_profile_role_for_check: autoriza quem chama e ganha pg_temp
-- ===========================================================================
-- A funcao roda com a identidade do dono (definer) e sob RLS-bypass: sem checagem explicita ela devolvia
-- papel/access_level/permissions de QUALQUER user_id (reconhecimento para escalada).
-- Passa a responder SO para o proprio auth.uid() ou para admin/supervisor. "Nao existe" e
-- "nao autorizado" respondem igual (zero linhas) - sem oraculo de enumeracao.
-- A assinatura e o retorno NAO mudam (a policy "Users can update own profile secure" segue usando).
CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
RETURNS TABLE(role text, access_level text, permissions jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role, p.access_level, p.permissions
  FROM public.profiles p
  WHERE p.user_id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))
  LIMIT 1;
$$;

-- ===========================================================================
-- -04  as outras 8 funcoes DEFINER: `search_path = public, pg_temp`
-- ===========================================================================
-- Com `pg_temp` explicitamente DEPOIS de public, o schema temporario deixa de ser procurado
-- primeiro para nomes de relacao: uma CREATE TEMP TABLE hostil da sessao nao sombreia mais a
-- tabela real dentro da funcao. Assinaturas e permissoes permanecem as mesmas.
ALTER FUNCTION public.is_within_business_hours(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reassign_overloaded_agents() SET search_path = public, pg_temp;
ALTER FUNCTION public.reassign_absent_agents(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_agent_streak(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_agent_resolutions(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_own_profile(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_own_lockout_status(text) SET search_path = public, pg_temp;
