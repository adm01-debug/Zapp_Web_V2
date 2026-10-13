-- supabase/tests/user_ui_preferences.sql
-- Prova de RLS "própria linha" da tabela public.user_ui_preferences no banco LOCAL.
-- Roda pelo psql como postgres e troca para os PAPÉIS REAIS (authenticated, anon, service_role).
-- Comando:
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/user_ui_preferences.sql
-- VERMELHO sem a migration (a tabela não existe). VERDE com ela aplicada.
-- Tudo roda dentro de uma transação e termina com ROLLBACK: não deixa lixo no banco.
\set ON_ERROR_STOP on

begin;

-- ---- fixtures: dois usuários sintéticos em auth.users (banco LOCAL) ----
-- session_replication_role=replica desliga os gatilhos de auth/profile: só o id importa aqui.
set local session_replication_role = replica;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2');
set local session_replication_role = origin;

-- ---- estrutura: RLS habilitada ----
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.user_ui_preferences'::regclass) then
    raise exception 'user_ui_preferences: RLS NAO esta habilitada';
  end if;
end $$;

-- ================= USUÁRIO A (authenticated) =================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

-- A insere a própria linha (WITH CHECK permite)
insert into public.user_ui_preferences (user_id, prefs)
values ('00000000-0000-4000-8000-0000000000a1', '{"skin":"navy","radius":"md"}'::jsonb);

do $$
declare v_n int;
begin
  select count(*) into v_n from public.user_ui_preferences;
  if v_n <> 1 then
    raise exception 'A deveria enxergar 1 linha (a propria); enxergou %', v_n;
  end if;
end $$;

-- A nao pode gravar na linha de B (WITH CHECK nega com 42501)
do $$
begin
  begin
    insert into public.user_ui_preferences (user_id, prefs)
    values ('00000000-0000-4000-8000-0000000000b2', '{}'::jsonb);
    raise exception 'FALHA: A conseguiu inserir a linha de B';
  exception
    when insufficient_privilege then null;  -- esperado: RLS WITH CHECK
  end;
end $$;

-- CHECK de objeto: prefs precisa ser objeto JSON (array negado com 23514)
do $$
begin
  begin
    insert into public.user_ui_preferences (user_id, prefs)
    values ('00000000-0000-4000-8000-0000000000a1', '[1,2,3]'::jsonb)
    on conflict (user_id) do update set prefs = excluded.prefs;
    raise exception 'FALHA: prefs array foi aceito pela tabela';
  exception
    when check_violation then null;  -- esperado: user_ui_preferences_prefs_object
  end;
end $$;

-- CHECK de tamanho: acima de 16 KiB negado com 23514
do $$
begin
  begin
    insert into public.user_ui_preferences (user_id, prefs)
    values ('00000000-0000-4000-8000-0000000000a1', jsonb_build_object('blob', repeat('x', 20000)))
    on conflict (user_id) do update set prefs = excluded.prefs;
    raise exception 'FALHA: prefs acima do teto de tamanho foi aceito';
  exception
    when check_violation then null;  -- esperado: user_ui_preferences_prefs_size
  end;
end $$;

-- gatilho updated_at: reescreve mesmo o valor que o app tenta gravar
do $$
declare v_depois timestamptz;
begin
  update public.user_ui_preferences
     set prefs = '{"skin":"light"}'::jsonb,
         updated_at = timestamptz '2000-01-01 00:00:00+00'
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  select updated_at into v_depois from public.user_ui_preferences
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  if v_depois < now() - interval '1 day' then
    raise exception 'gatilho updated_at nao reescreveu o valor (ficou %)', v_depois;
  end if;
end $$;

-- ================= USUÁRIO B (authenticated) =================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

insert into public.user_ui_preferences (user_id, prefs)
values ('00000000-0000-4000-8000-0000000000b2', '{}'::jsonb);

do $$
declare v_n int;
begin
  select count(*) into v_n from public.user_ui_preferences;
  if v_n <> 1 then
    raise exception 'B deveria enxergar 1 linha (a propria); enxergou %', v_n;
  end if;

  select count(*) into v_n from public.user_ui_preferences
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  if v_n <> 0 then
    raise exception 'B enxergou a linha de A';
  end if;

  update public.user_ui_preferences set prefs = '{}'::jsonb
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'B atualizou a linha de A (% linhas)', v_n;
  end if;

  delete from public.user_ui_preferences
   where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'B apagou a linha de A (% linhas)', v_n;
  end if;
end $$;

-- ================= ANON (sem login) =================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare v_n int;
begin
  -- anon pode ser negado de duas formas, ambas aceitáveis: sem privilégio de tabela
  -- (42501) ou por RLS sem policy (0 linhas). Nunca pode LER linha alguma.
  begin
    select count(*) into v_n from public.user_ui_preferences;
    if v_n <> 0 then
      raise exception 'anon enxergou % linha(s)', v_n;
    end if;
  exception
    when insufficient_privilege then null;  -- esperado: sem GRANT para anon
  end;

  begin
    insert into public.user_ui_preferences (user_id, prefs)
    values ('00000000-0000-4000-8000-0000000000a1', '{}'::jsonb);
    raise exception 'FALHA: anon conseguiu inserir na tabela';
  exception
    when insufficient_privilege then null;  -- esperado: sem GRANT/policy para anon
  end;
end $$;

-- ================= SERVICE_ROLE (dono do sistema) =================
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.user_ui_preferences;
  if v_n <> 2 then
    raise exception 'service_role deveria enxergar as 2 linhas; enxergou %', v_n;
  end if;
end $$;

reset role;
rollback;

\echo 'user_ui_preferences: OK (RLS propria linha + CHECKs + gatilho; anon negado; service_role ve tudo)'
