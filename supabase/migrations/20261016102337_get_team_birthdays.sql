-- get_team_birthdays
-- Rollback: dropa a RPC nova (era o unico objeto criado); nada mais muda.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.get_team_birthdays();
--
-- AUDITORIA PARIDADE V3->V2 doc 26, achado HZ3-002 (worker sql).
-- Problema: a RPC get_team_profiles (SECURITY DEFINER, so ativos, mascara e-mail/telefone
-- para nao-admin) nao devolve `birthday`; o contrato fixa `birthday: null` no hook
-- (src/hooks/team-chat/useTeamMemberDetails.ts). Consequencia: o cartao de aniversario do
-- colega e a secao "Proximos Aniversarios" do Team Chat nunca funcionam.
--
-- Decisao do dono (Claude): NAO devolver a data completa. Esta RPC devolve SO dia e mes,
-- sem o ano, para o aniversario nao expor a idade. Colunas exatas: id, birthday_day,
-- birthday_month (integer 1..31 / 1..12). Nunca a coluna birthday nem o ano.
--
-- Escopo: SO a funcao nova e a ACL dela. Nao toca get_team_profiles, nenhuma policy,
-- nenhum GRANT de objeto existente, nenhum dado. Nada para anon.
--
-- Sem BEGIN/COMMIT: a migration aplica numa unica transacao; qualquer erro desfaz tudo.

CREATE OR REPLACE FUNCTION public.get_team_birthdays()
RETURNS TABLE(id uuid, birthday_day integer, birthday_month integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- So perfis ATIVOS com aniversario cadastrado; devolve apenas dia e mes (sem ano).
  SELECT
    p.id,
    extract(day FROM p.birthday)::integer AS birthday_day,
    extract(month FROM p.birthday)::integer AS birthday_month
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.birthday IS NOT NULL;
$function$;

-- Funcao nova nasce com EXECUTE para PUBLIC: fecha tudo e libera so authenticated.
REVOKE EXECUTE ON FUNCTION public.get_team_birthdays() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_birthdays() TO authenticated;
