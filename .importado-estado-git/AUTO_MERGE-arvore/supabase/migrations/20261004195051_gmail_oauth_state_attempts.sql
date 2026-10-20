-- gmail_oauth_state_attempts
-- Rollback: drop function if exists public.consume_gmail_oauth_state(uuid, text); drop table if exists public.gmail_oauth_states;

-- R2-COM-009 (item 17): vincula o `state` do retorno OAuth do Gmail à sessão
-- que iniciou a conexão (RFC 6749 §10.12). Sem isto, um retorno não vinculado
-- podia conectar a conta Gmail de outra pessoa ao usuário autenticado.
--
-- Fluxo: get-auth-url INSERE a tentativa (user_id + state) -> Google redireciona
-- -> exchange-code chama consume_gmail_oauth_state, que só aceita se o state
-- existir, pertencer ao MESMO usuário, não estar expirado e não ter sido usado
-- (uso único, atômico). A checagem é no servidor — o nonce do sessionStorage do
-- cliente continua como primeira linha, mas não decide mais sozinho.

create table public.gmail_oauth_states (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  state       text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

comment on table public.gmail_oauth_states is
  'R2-COM-009: tentativas OAuth do Gmail. Registradas pelo get-auth-url e consumidas uma única vez pelo exchange-code via consume_gmail_oauth_state (anti-CSRF/anti-replay).';

-- O consume só olha tentativas abertas do usuário.
create index gmail_oauth_states_open_user_state_idx
  on public.gmail_oauth_states (user_id, state)
  where consumed_at is null;

-- Sem policies, de propósito: nem o app nem o anon tocam a tabela direto. O
-- get-auth-url insere via service_role e o consume passa só pela função abaixo.
alter table public.gmail_oauth_states enable row level security;

revoke all on table public.gmail_oauth_states from public, anon, authenticated;
grant all on table public.gmail_oauth_states to service_role;

create or replace function public.consume_gmail_oauth_state(
  p_user_id uuid,
  p_state   text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Guarda de identidade (mesmo padrão de catalog_rate_limit_hit): quem chama
  -- com JWT de usuário só pode consumir o PRÓPRIO state; o service_role
  -- (auth.uid() nulo) consome o de quem a edge autenticou.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return false;
  end if;

  -- Limpeza oportunista: tentativas expiradas não se acumulam.
  delete from public.gmail_oauth_states where expires_at <= now();

  update public.gmail_oauth_states
     set consumed_at = now()
   where user_id = p_user_id
     and state = p_state
     and consumed_at is null
     and expires_at > now()
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- ACL: só a edge chama, via service_role; usuário nunca executa direto.
revoke all on function public.consume_gmail_oauth_state(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_gmail_oauth_state(uuid, text) to service_role;
