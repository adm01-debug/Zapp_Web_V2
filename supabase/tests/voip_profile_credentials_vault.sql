-- supabase/tests/voip_profile_credentials_vault.sql
-- Prova da migration 20261013230011_voip_profile_credentials.sql no banco LOCAL,
-- chamando as RPCs com os PAPÉIS REAIS (authenticated, anon, service_role) — nunca só como postgres.
--
-- Como rodar (banco local da tarefa, que já tem as migrations reais aplicadas):
--   zapp-db-local psql . v2-2610130612b99d < supabase/tests/voip_profile_credentials_vault.sql
-- Esperado: terminar com "PROVA OK" e nenhum ERROR.
-- Vermelho antes da migration: a tabela/RPCs não existem (primeiro ASSERT explode).
-- Precisa rodar como postgres (superusuário), para poder assumir SET ROLE/anon/authenticated/service_role.
-- NUNCA rodar contra produção: cria usuários sintéticos e assume papéis.
--
-- Tudo roda dentro de BEGIN ... ROLLBACK: os usuários/perfis/segredos sintéticos
-- (domínio @test.local) não ficam no banco depois da prova.

\set ON_ERROR_STOP on

begin;

do $prova$
declare
  vUserA  uuid := '00000000-0000-4000-8000-00000000a001';  -- admin/supervisor
  vUserB  uuid := '00000000-0000-4000-8000-00000000b001';  -- agente comum
  vA      uuid;
  vB      uuid;
  vCred   uuid;
  vSecret uuid;
  vRamal  text;
  vPass   text;
  vN      int;
begin
  -- ── fixtures sintéticas (auth.users dispara a criação do profile) ──────────
  insert into auth.users (id, email, raw_user_meta_data)
  values (vUserA, 'voip-a@test.local', '{"name":"Voip A"}'::jsonb),
         (vUserB, 'voip-b@test.local', '{"name":"Voip B"}'::jsonb);
  insert into public.user_roles (user_id, role) values (vUserA, 'admin');

  select id into vA from public.profiles where user_id = vUserA;
  select id into vB from public.profiles where user_id = vUserB;
  if vA is null or vB is null then
    raise exception 'ASSERT: fixture de profiles falhou (A=%, B=%)', vA, vB;
  end if;

  -- ── estrutura: RLS ligada, sem GRANT ao PostgREST ─────────────────────────
  if not (select relrowsecurity from pg_class where oid = 'public.voip_profile_credentials'::regclass) then
    raise exception 'ASSERT: RLS não está ligada na tabela';
  end if;
  if has_table_privilege('anon', 'public.voip_profile_credentials', 'select')
     or has_table_privilege('authenticated', 'public.voip_profile_credentials', 'select')
     or has_table_privilege('service_role', 'public.voip_profile_credentials', 'select') then
    raise exception 'ASSERT: tabela com GRANT de SELECT ao PostgREST';
  end if;

  if not (select prosecdef from pg_proc where oid = 'public.get_voip_profile_credentials(uuid)'::regprocedure) then
    raise exception 'ASSERT: get_voip_profile_credentials não é SECURITY DEFINER';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.set_voip_profile_credentials(uuid,text,text)'::regprocedure) then
    raise exception 'ASSERT: set_voip_profile_credentials não é SECURITY DEFINER';
  end if;
  if (select array_to_string(proconfig, ',') from pg_proc
        where oid = 'public.set_voip_profile_credentials(uuid,text,text)'::regprocedure)
     not like '%search_path=public, vault, pg_temp%' then
    raise exception 'ASSERT: set_voip_profile_credentials sem search_path fixo';
  end if;
  if has_function_privilege('anon', 'public.set_voip_profile_credentials(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_voip_profile_credentials(uuid)', 'execute') then
    raise exception 'ASSERT: EXECUTE das RPCs aberto para quem não deve';
  end if;

  -- ── provisiona como ADMIN (authenticated + user_roles admin) ──────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', vUserA::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', vUserA::text, 'role', 'authenticated')::text, true);

  vCred := public.set_voip_profile_credentials(vA, '1001', 'S3nh4-A-1');
  if vCred is null then
    raise exception 'ASSERT: admin não conseguiu provisionar';
  end if;

  -- ── entradas inválidas: falham sem aplicar nada ───────────────────────────
  begin
    perform public.set_voip_profile_credentials(vA, 'ram mal!', 'x');
    raise exception 'ASSERT: ramal inválido foi aceito';
  exception when sqlstate '22023' then
    if position('invalid_ramal' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro errado para ramal inválido: %', sqlerrm;
    end if;
  end;
  begin
    perform public.set_voip_profile_credentials(vA, '1009', '');
    raise exception 'ASSERT: senha vazia foi aceita';
  exception when sqlstate '22023' then
    if position('invalid_sip_password' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro errado para senha vazia: %', sqlerrm;
    end if;
  end;
  begin
    perform public.set_voip_profile_credentials(
      '00000000-0000-4000-8000-00000000ffff'::uuid, '1009', 'x');
    raise exception 'ASSERT: perfil inexistente foi aceito';
  exception when sqlstate '22023' then
    if position('profile_not_found' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro errado para perfil inexistente: %', sqlerrm;
    end if;
  end;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.voip_profile_credentials) <> 1 then
    raise exception 'ASSERT: entrada inválida deixou linha aplicada';
  end if;
  perform set_config('role', 'authenticated', true);

  -- ── AGENTE COMUM não provisiona (nem para si) ─────────────────────────────
  perform set_config('request.jwt.claim.sub', vUserB::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', vUserB::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_voip_profile_credentials(vB, '1001', 'x');
    raise exception 'ASSERT: agente comum conseguiu provisionar';
  exception when insufficient_privilege then
    if position('not_authorized' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro inesperado do agente: %', sqlerrm;
    end if;
  end;

  -- ── ANON: negado nas RPCs e na tabela ─────────────────────────────────────
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.set_voip_profile_credentials(vA, '3003', 'x');
    raise exception 'ASSERT: anon conseguiu executar set_voip_profile_credentials';
  exception when insufficient_privilege then
    if position('permission denied' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro inesperado do anon no set: %', sqlerrm;
    end if;
  end;
  begin
    perform ramal from public.get_voip_profile_credentials(vA);
    raise exception 'ASSERT: anon conseguiu executar get_voip_profile_credentials';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.voip_profile_credentials limit 1;
    raise exception 'ASSERT: anon leu a tabela direto';
  exception when insufficient_privilege then
    null;
  end;

  -- ── AUTHENTICATED (admin) não lê a tabela direto: leitura só pela Edge ────
  perform set_config('role', 'authenticated', true);
  begin
    perform 1 from public.voip_profile_credentials limit 1;
    raise exception 'ASSERT: authenticated leu a tabela direto';
  exception when insufficient_privilege then
    null;
  end;

  -- ── SERVICE_ROLE lê pela RPC (caminho da Edge) ────────────────────────────
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select f.ramal, f.sip_password into vRamal, vPass
  from public.get_voip_profile_credentials(vA) f;
  if vRamal <> '1001' or vPass <> 'S3nh4-A-1' then
    raise exception 'ASSERT: leitura service_role devolveu ramal=% senha=%', vRamal, vPass;
  end if;

  -- sem oráculo: perfil sem credencial e perfil inexistente devolvem o MESMO (0 linhas)
  select count(*) into vN from public.get_voip_profile_credentials(vB);
  if vN <> 0 then
    raise exception 'ASSERT: perfil sem credencial devolveu % linhas', vN;
  end if;
  select count(*) into vN
  from public.get_voip_profile_credentials('00000000-0000-4000-8000-00000000ffff'::uuid);
  if vN <> 0 then
    raise exception 'ASSERT: perfil inexistente devolveu % linhas', vN;
  end if;

  -- provisiona o B (ramal próprio) pela Edge/service_role
  perform public.set_voip_profile_credentials(vB, '2002', 'S3nh4-B-1');

  -- ── um ramal pertence a um único atendente ────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', vUserA::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', vUserA::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_voip_profile_credentials(vA, '2002', 'x');
    raise exception 'ASSERT: ramal já em uso por outro atendente foi aceito';
  exception when sqlstate '22023' then
    if position('ramal_em_uso' in sqlerrm) = 0 then
      raise exception 'ASSERT: erro inesperado ao colidir ramal: %', sqlerrm;
    end if;
  end;

  -- ── o que existe antes ────────────────────────────────────────────────────
  perform set_config('role', 'postgres', true);
  select c.vault_secret_id into vSecret
  from public.voip_profile_credentials c where c.profile_id = vA;
  if vSecret is null then
    raise exception 'ASSERT: credencial de A sem vault_secret_id';
  end if;
  select count(*) into vN from vault.secrets where name = 'voip_sip_password:' || vA::text;
  if vN <> 1 then
    raise exception 'ASSERT: segredo de A não está no Vault (n=%)', vN;
  end if;

  -- a coluna comum NUNCA guarda a senha
  select count(*) into vN from public.voip_profile_credentials c
  where (c.*)::text like '%S3nh4-A-1%' or (c.*)::text like '%S3nh4-B-1%';
  if vN <> 0 then
    raise exception 'ASSERT: senha em claro em alguma coluna da tabela';
  end if;

  -- a colisão acima não deixou lixo: nada parcial aplicado (linhas e segredos intactos)
  if (select ramal from public.voip_profile_credentials where profile_id = vA) <> '1001'
     or (select ramal from public.voip_profile_credentials where profile_id = vB) <> '2002' then
    raise exception 'ASSERT: linhas mudaram depois de uma chamada que falhou';
  end if;
  select count(*) into vN from vault.secrets where name like 'voip_sip_password:%';
  if vN <> 2 then
    raise exception 'ASSERT: chamada que falhou criou segredo (n=%)', vN;
  end if;

  -- ── rotação: reaproveita o mesmo segredo do Vault, sem duplicar linha ─────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', vUserA::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', vUserA::text, 'role', 'authenticated')::text, true);
  perform public.set_voip_profile_credentials(vA, '1001', 'S3nh4-A-2');

  perform set_config('role', 'postgres', true);
  if (select vault_secret_id from public.voip_profile_credentials where profile_id = vA) <> vSecret then
    raise exception 'ASSERT: rotação criou segredo novo em vez de reaproveitar';
  end if;
  if (select decrypted_secret from vault.decrypted_secrets where id = vSecret) <> 'S3nh4-A-2' then
    raise exception 'ASSERT: senha não foi rotacionada no Vault';
  end if;

  -- ── nada de duplicata: uma credencial por atendente ──────────────────────
  select count(*) into vN from public.voip_profile_credentials;
  if vN <> 2 then
    raise exception 'ASSERT: tabela com % linhas (esperado 2, uma por atendente)', vN;
  end if;
  select count(*) into vN from vault.secrets where name like 'voip_sip_password:%';
  if vN <> 2 then
    raise exception 'ASSERT: vault.secrets com % segredos (esperado 2)', vN;
  end if;

  perform set_config('role', 'postgres', true);
end;
$prova$;

rollback;

-- ── prova do -- Rollback da migration ────────────────────────────────────────
-- As 3 linhas abaixo são cópia idêntica do bloco "-- Rollback (SQL executável, na ordem):"
-- do topo da migration 20261013230011_voip_profile_credentials.sql. Executadas no banco
-- LOCAL: removem os objetos novos; o ROLLBACK final devolve o estado aplicado.
begin;
  drop function if exists public.set_voip_profile_credentials(uuid, text, text);
  drop function if exists public.get_voip_profile_credentials(uuid);
  drop table if exists public.voip_profile_credentials;
  do $rb$
  begin
    if to_regclass('public.voip_profile_credentials') is not null
       or to_regprocedure('public.get_voip_profile_credentials(uuid)') is not null
       or to_regprocedure('public.set_voip_profile_credentials(uuid,text,text)') is not null then
      raise exception 'ASSERT: o bloco -- Rollback não removeu os objetos da migration';
    end if;
  end;
  $rb$;
rollback;

do $fim$
begin
  if to_regclass('public.voip_profile_credentials') is null then
    raise exception 'ASSERT: o ROLLBACK do teste não devolveu a migration aplicada';
  end if;
end;
$fim$;

\echo PROVA OK: voip_profile_credentials — credencial por atendente, senha no Vault, sem GRANT ao PostgREST
\echo PROVA OK (rollback): o bloco -- Rollback da migration roda e desfaz tudo
