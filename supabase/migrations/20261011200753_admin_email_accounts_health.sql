-- admin_email_accounts_health
-- Rollback: dropa a RPC de saude das contas de e-mail do painel admin; nada mais muda
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_email_accounts_health();
--
-- PARIDADE V3 -> V2 (auditoria de frontend, 11/10/2026):
-- o painel admin do V3 mostra a SAUDE das contas de e-mail conectadas (conta, dono,
-- status do token, ultimo sincronismo, falhas recentes e ultima validacao) para o
-- operador perceber sozinho quando uma caixa parou de sincronizar ou o token venceu.
-- No V2 nao havia caminho de leitura: o painel dependeria da RLS de public.gmail_accounts
-- e veria a tabela inteira (dono, tokens cifrados) ou nao teria como listar.
--
-- POR QUE RPC EM VEZ DE LEITURA DIRETA:
-- 1) esta e uma tela ADMIN. A guarda public.is_admin(auth.uid()) e repetida DENTRO da
--    funcao: a RLS de public.gmail_accounts e "cada um ve a propria conta", entao a RPC
--    precisa de uma checagem explicita para abrir a visao global -- e falhar fechado.
--    (admin estrito, nao supervisor: o cartao pede "so admin".)
-- 2) a tabela guarda os tokens OAuth cifrados (access_token_encrypted, refresh_token_encrypted).
--    A RPC NUNCA os devolve: expoe apenas tem_access_token/tem_refresh_token e a
--    validade do token, o suficiente para a tela de saude. public.gmail_accounts_safe existe para o dono; esta
--    RPC e o caminho do admin e tambem nao vaza token.
--
-- SEMANTICA DOS CAMPOS (o que a tela chama -> o que a RPC devolve):
--   conta              -> gmail_accounts.email_address
--   dono               -> dono_user_id + dono_nome/dono_email (de public.profiles)
--   status do token    -> token_status: 'sem_token' quando nao ha refresh_token (conta
--                         desconectada/zera tokens), 'expirado' quando token_expires_at ja
--                         passou, 'expirando' quando vence em ate 15 min, senao 'valido'.
--                         O TOKEN EM SI nunca sai; so a validade (token_expires_at) e os
--                         booleanos tem_access_token/tem_refresh_token.
--   ultimo sincronismo -> ultimo_sincronismo (gmail_accounts.last_sync_at)
--   falhas recentes    -> falhas_recentes (gmail_accounts.last_error: a ultima falha
--                         registrada pelo sync; NULL = sem falha) + em_falha
--                         (sync_status = 'error')
--   ultima validacao   -> ultima_validacao (gmail_accounts.updated_at: ultima vez que o
--                         registro da conta foi renovado -- refresh de token, watch ou sync).
--                         watch_expiration vai cru para a tela mostrar a validade do push.
--
-- DADO SENSIVEL: nao ha telefone/CPF/pagamento aqui. O retorno traz e-mail da caixa e do
-- dono (dado que a tela admin precisa) e NUNCA os bytes cifrados do token.

create or replace function public.admin_email_accounts_health()
returns table (
  gmail_account_id   uuid,
  conta              text,
  dono_user_id       uuid,
  dono_nome          text,
  dono_email         text,
  is_active          boolean,
  sync_status        text,
  token_status       text,
  token_expires_at   timestamptz,
  tem_access_token   boolean,
  tem_refresh_token  boolean,
  ultimo_sincronismo timestamptz,
  falhas_recentes    text,
  em_falha           boolean,
  ultima_validacao   timestamptz,
  watch_expiration   timestamptz,
  criado_em          timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Guarda DENTRO da funcao: a RLS de gmail_accounts e "cada um ve a propria conta",
  -- entao a visao global exige checagem explicita e falha FECHADO (42501), nao silencio.
  if not public.is_admin(auth.uid()) then
    raise exception 'acesso restrito ao administrador' using errcode = '42501';
  end if;

  return query
  select
    g.id,
    g.email_address,
    g.user_id,
    p.name,
    p.email,
    g.is_active,
    g.sync_status,
    case
      when g.refresh_token_encrypted is null then 'sem_token'
      when g.token_expires_at is null then 'valido'
      when g.token_expires_at <= now() then 'expirado'
      when g.token_expires_at <= now() + interval '15 minutes' then 'expirando'
      else 'valido'
    end as token_status,
    g.token_expires_at,
    (g.access_token_encrypted is not null) as tem_access_token,
    (g.refresh_token_encrypted is not null) as tem_refresh_token,
    g.last_sync_at,
    g.last_error,
    (g.sync_status = 'error') as em_falha,
    g.updated_at,
    g.watch_expiration,
    g.created_at
  from public.gmail_accounts g
  left join public.profiles p on p.user_id = g.user_id
  order by g.is_active desc, g.email_address asc;
end $$;

-- ACL: somente o admin autenticado (a guarda interna e o segundo portao). Fecha PUBLIC e
-- anon -- sem isto o anon chegaria na funcao SECURITY DEFINER. service_role nao precisa:
-- o painel chama com JWT authenticated.
revoke all on function public.admin_email_accounts_health() from public, anon;
grant execute on function public.admin_email_accounts_health() to authenticated;
