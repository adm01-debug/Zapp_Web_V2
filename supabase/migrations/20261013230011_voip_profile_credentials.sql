-- voip_profile_credentials — credencial SIP por atendente (ramal + senha no Vault)
-- Rollback: dropa as duas RPCs novas e a tabela nova (nada mais é tocado; a migration é aditiva e não cria segredo algum no Vault em tempo de aplicação).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.set_voip_profile_credentials(uuid, text, text);
--   drop function if exists public.get_voip_profile_credentials(uuid);
--   drop table if exists public.voip_profile_credentials;
--
-- Problema (achado conferido no código da branch viva em 12/10/2026):
--   a Edge `get-sip-password` devolve a MESMA senha (`SIP_PASSWORD`) e a MESMA linha
--   (`phone1`, host fixo no código) a todo perfil ativo. Duas sessões com o mesmo ramal se
--   derrubam e a chamada não se atribui a quem ligou. A V3 tem `zapp.voip_profile_credentials`
--   (migration 20260817260012, referência — NÃO copiemos o defeito dela: lá a senha mora em
--   coluna comum `sip_password`).
--
-- Solução (V2): tabela `public.voip_profile_credentials` com UMA credencial por atendente
--   (UNIQUE por profile e por ramal), guardando SÓ o ramal e a referência do segredo no
--   Supabase Vault (`vault_secret_id`). A senha SIP nunca é gravada em coluna comum: fica
--   cifrada no Vault e só é decifrada dentro de RPC SECURITY DEFINER.
--
-- Segurança (o que este arquivo garante):
--   * RLS LIGADA (defesa em profundidade) e REVOKE ALL de PUBLIC/anon/authenticated/service_role:
--     não existe nenhum caminho de tabela pelo PostgREST (nem com service_role).
--   * Leitura (`get_voip_profile_credentials`): só `service_role` (a Edge). Devolve ramal + senha
--     decifrada, e ZERO linhas tanto para "perfil sem credencial" quanto para "perfil inexistente"
--     (sem oráculo de existência).
--   * Provisionamento (`set_voip_profile_credentials`): RPC administrativa, só admin/supervisor
--     (authenticated) ou service_role. Cria/rotaciona o segredo no Vault e faz o upsert da linha
--     numa única operação atômica (fail = nada aplicado).
--   * Um ramal pertence a um único atendente (índice único em lower(ramal)): é a trava de dados
--     que impede o "duas sessões com o mesmo ramal se derrubam".
--   * Nenhum objeto existente é criado, alterado ou tem ACL tocada.

-- ============================================================================
-- 1. Tabela — uma credencial por atendente; a senha NÃO mora aqui
-- ============================================================================
create table if not exists public.voip_profile_credentials (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references public.profiles (id) on delete cascade,
  ramal           text not null check (ramal ~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$'),
  vault_secret_id uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.voip_profile_credentials is
  'Credencial SIP/VoIP por atendente. Guarda o ramal e a referência do segredo no Vault (vault_secret_id); a senha SIP nunca é gravada em coluna comum. Sem GRANT ao PostgREST — leitura só pela RPC SECURITY DEFINER chamada pela Edge com service_role.';
comment on column public.voip_profile_credentials.ramal is
  'Ramal/usuário SIP do atendente. Único sem diferenciar maiúsculas/minúsculas: um ramal pertence a um único atendente.';
comment on column public.voip_profile_credentials.vault_secret_id is
  'id do segredo em vault.secrets. A senha é decifrada apenas dentro das RPCs SECURITY DEFINER deste arquivo.';

-- um ramal = no máximo um atendente (case-insensitive)
create unique index if not exists voip_profile_credentials_ramal_lower_key
  on public.voip_profile_credentials (lower(ramal));

-- ============================================================================
-- 2. RLS ligada (defesa em profundidade — deny-all: não há policy)
-- ============================================================================
alter table public.voip_profile_credentials enable row level security;

-- ============================================================================
-- 3. ACL — nenhum acesso de tabela pelo PostgREST
-- ============================================================================
-- Sem GRANT de tabela para ninguém (inclui service_role): o único caminho de leitura é a RPC.
revoke all on table public.voip_profile_credentials
  from public, anon, authenticated, service_role;

-- updated_at — padrão da casa
drop trigger if exists trg_voip_profile_credentials_updated_at
  on public.voip_profile_credentials;
create trigger trg_voip_profile_credentials_updated_at
  before update on public.voip_profile_credentials
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- 4. Leitura — só a Edge (service_role): ramal + senha decifrada do Vault
-- ============================================================================
create or replace function public.get_voip_profile_credentials(p_profile_id uuid)
returns table (ramal text, sip_password text)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $fn$
declare
  v_secret_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'invalid_profile_id' using errcode = '22023';
  end if;

  select c.vault_secret_id into v_secret_id
  from public.voip_profile_credentials c
  where c.profile_id = p_profile_id;

  -- mesma resposta (zero linhas) para perfil sem credencial e para perfil inexistente.
  if v_secret_id is null then
    return;
  end if;

  return query
    select c.ramal, d.decrypted_secret
    from public.voip_profile_credentials c
    join vault.decrypted_secrets d on d.id = c.vault_secret_id
    where c.profile_id = p_profile_id;
end;
$fn$;

revoke all on function public.get_voip_profile_credentials(uuid)
  from public, anon, authenticated;
grant execute on function public.get_voip_profile_credentials(uuid) to service_role;

-- ============================================================================
-- 5. Provisionamento — RPC administrativa (admin/supervisor ou service_role)
-- ============================================================================
create or replace function public.set_voip_profile_credentials(
  p_profile_id uuid,
  p_ramal text,
  p_sip_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $fn$
declare
  v_secret_id uuid;
  v_cred_id   uuid;
begin
  -- Autorização: a Edge (service_role) ou um admin/supervisor autenticado.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_admin_or_supervisor(auth.uid())
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Valida TUDO antes de tocar qualquer coisa (fail = nada aplicado).
  if p_profile_id is null then
    raise exception 'invalid_profile_id' using errcode = '22023';
  end if;
  if p_ramal is null or p_ramal !~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$' then
    raise exception 'invalid_ramal' using errcode = '22023';
  end if;
  if p_sip_password is null or char_length(p_sip_password) not between 1 and 256 then
    raise exception 'invalid_sip_password' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.voip_profile_credentials c
    where lower(c.ramal) = lower(p_ramal) and c.profile_id <> p_profile_id
  ) then
    raise exception 'ramal_em_uso' using errcode = '22023';
  end if;

  -- Serializa provisionamentos do MESMO perfil (corrida não gera dois segredos órfãos).
  perform pg_advisory_xact_lock(
    hashtextextended('voip_profile_credentials:' || p_profile_id::text, 0)
  );

  select c.vault_secret_id into v_secret_id
  from public.voip_profile_credentials c
  where c.profile_id = p_profile_id
  for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_sip_password,
      'voip_sip_password:' || p_profile_id::text
    );
  else
    perform vault.update_secret(v_secret_id, p_sip_password);
  end if;

  insert into public.voip_profile_credentials as c (profile_id, ramal, vault_secret_id)
  values (p_profile_id, p_ramal, v_secret_id)
  on conflict (profile_id) do update
    set ramal           = excluded.ramal,
        vault_secret_id = excluded.vault_secret_id,
        updated_at      = now()
  returning c.id into v_cred_id;

  return v_cred_id;
end;
$fn$;

revoke all on function public.set_voip_profile_credentials(uuid, text, text)
  from public, anon;
grant execute on function public.set_voip_profile_credentials(uuid, text, text)
  to authenticated, service_role;
