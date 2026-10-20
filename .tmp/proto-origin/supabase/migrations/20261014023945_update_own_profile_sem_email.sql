-- update_own_profile_sem_email
-- Rollback: remove a versao de 5 parametros criada aqui e recria update_own_profile com o parametro p_email (corpo anterior, abaixo), devolvendo os grants a anon/PUBLIC (nenhum) e a authenticated/service_role; o hook src/hooks/auth/useSecureProfile.ts e o bloco Args de update_own_profile em src/integrations/supabase/types.ts precisam voltar a citar p_email.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.update_own_profile(text, text, text, text, text);
--   create or replace function public.update_own_profile(p_display_name text default null, p_avatar_url text default null, p_phone text default null, p_email text default null, p_signature text default null, p_birthday text default null) returns boolean language plpgsql security definer set search_path = public as $fn$ declare v_profile_id uuid; begin select id into v_profile_id from profiles where user_id = auth.uid(); if v_profile_id is null then return false; end if; update profiles set display_name = coalesce(p_display_name, display_name), avatar_url = coalesce(p_avatar_url, avatar_url), phone = coalesce(p_phone, phone), email = coalesce(p_email, email), signature = coalesce(p_signature, signature), birthday = coalesce(p_birthday, birthday), updated_at = now() where id = v_profile_id; return true; end; $fn$;
--   revoke all on function public.update_own_profile(text, text, text, text, text, text) from public, anon;
--   grant execute on function public.update_own_profile(text, text, text, text, text, text) to authenticated, service_role;
--
-- R2-DB-030 (P2) - "perfil proprio nao altera o e-mail sem validacao".
--
-- A funcao public.update_own_profile (SECURITY DEFINER) nasceu para deixar o dono do perfil
-- editar os proprios campos sem privilege escalation, mas aceitava p_email e fazia
-- email = COALESCE(p_email, email) SEM validar formato, SEM validar unicidade e SEM sincronizar
-- com o Auth: o e-mail ficava divergente do login e sem verificacao. O e-mail so pode mudar pelo
-- fluxo do Auth (confirmacao por e-mail); a tabela de perfil nao e fonte de verdade dele.
--
-- Correcao 1 (o pedido do cartao): tira p_email da assinatura. Como o Postgres identifica funcao
-- por nome+assinatura, um simples CREATE OR REPLACE com 5 parametros deixaria a versao de 6
-- parametros VIVA ao lado (overload) e o caminho do e-mail seguiria aberto; por isso a assinatura
-- antiga e dropada antes.
--
-- Correcao 2 (defeito pre-existente encontrado na prova, mesma funcao): o corpo herdado apontava
-- para profiles.display_name, coluna que NAO existe (o schema real tem profiles.name, text NOT
-- NULL — conferido em supabase/schema-catalog.json e no banco local reaplicado), e jogava
-- p_birthday TEXT direto em profiles.birthday DATE. Ou seja, a funcao estourava 42703 em qualquer
-- chamada e nao era um caminho de escrita vivo. Sem acertar isso, a assinatura nova nao teria como
-- ser exercitada em schema real e a prova viraria ficcao. Mapeamento p_display_name -> name segue o
-- resto do projeto (get_identity_matrix devolve p.name AS display_name; a UI le profiles.name).
--
-- Nenhum outro campo muda: avatar_url, phone, signature e updated_at seguem como antes, a funcao
-- continua mexendo so na linha do proprio auth.uid() e segue SECURITY DEFINER com search_path fixo.
--
-- Unica chamadora hoje e o hook src/hooks/auth/useSecureProfile.ts (exportado, sem uso em tela);
-- o parametro sai junto com a tipagem do RPC. Nada em Edge Function ou trigger chama esta funcao.

DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL,
  p_birthday TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    name = COALESCE(p_display_name, name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(NULLIF(p_birthday, '')::date, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text) TO authenticated, service_role;
