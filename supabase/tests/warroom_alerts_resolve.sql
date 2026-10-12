-- supabase/tests/warroom_alerts_resolve.sql
-- Contrato de BANCO da migration 20261011181949_warroom_alerts_resolve.sql
-- (paridade V3 -> V2: alertas do War Room resolvíveis, com histórico).
--
-- Roda em Postgres 17 DESCARTÁVEL (docker) e exerce as RPCs sob os papéis REAIS
-- (authenticated/anon) — nunca como postgres — trocando de papel com set_config('role', ...)
-- e injetando o JWT com set_config('request.jwt.claims', ...). A migration é aplicada VERBATIM
-- do arquivo do repositório (\i), então a prova acompanha o arquivo, não uma cópia.
-- Tudo numa transação, com ROLLBACK no fim (o container é descartável).
--
-- Uso:  psql -v ON_ERROR_STOP=1 -v mig_dir=/repo/supabase/migrations -d postgres -U postgres -f <este arquivo>
--
-- Ambiente x contrato: as tabelas/funções de apoio (profiles, user_roles, is_admin_or_supervisor,
-- current_profile_id, audit_logs, log_audit_event e a warroom_alerts ANTERIOR à migration) são
-- montadas à mão — é ambiente, não contrato. O contrato é o que a migration aplicada produz.

\set ON_ERROR_STOP on

-- papéis fora da transação (CREATE ROLE não roda em bloco de transação)
create role anon nologin;
create role authenticated nologin;

begin;

-- ============================ AMBIENTE ============================
create schema if not exists auth;

create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  full_name text
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null
);

create or replace function public.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as
$$ select exists(select 1 from public.user_roles where user_id = p_user and role = 'admin') $$;

create or replace function public.is_admin_or_supervisor(p_user uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as
$$ select exists(select 1 from public.user_roles where user_id = p_user and role in ('admin','supervisor')) $$;

create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.profiles where user_id = auth.uid() limit 1 $$;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  user_agent text,
  created_at timestamptz default now()
);

create or replace function public.log_audit_event(
  p_action text, p_entity_type text default null, p_entity_id text default null,
  p_details jsonb default null, p_user_agent text default null
) returns void language plpgsql security definer set search_path = pg_catalog, public as
$fn$
declare v_user_id uuid; v_entity uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return; end if;
  if p_entity_id is not null and p_entity_id <> '' then
    begin v_entity := p_entity_id::uuid; exception when others then v_entity := null; end;
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, details, user_agent)
  values (v_user_id, p_action, p_entity_type, v_entity, p_details, p_user_agent);
end
$fn$;

-- warroom_alerts no estado ANTERIOR à migration (fiel ao canônico: colunas, RLS e policies)
create table public.warroom_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null default 'warning',
  title text not null,
  message text not null,
  source text,
  is_read boolean default false,
  dismissed_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  dedupe_key text
);
alter table public.warroom_alerts enable row level security;
create policy "Authenticated can view alerts" on public.warroom_alerts
  for select to authenticated using (true);
create policy "Admins can update alerts" on public.warroom_alerts
  for update to authenticated using (public.is_admin_or_supervisor(auth.uid()));
create policy "Admins can insert alerts" on public.warroom_alerts
  for insert to authenticated with check (public.is_admin_or_supervisor(auth.uid()));

-- privilégio de tabela no estado basal do Supabase (a RLS é quem restringe linha/operação)
grant select, insert, update, delete on public.warroom_alerts to anon, authenticated;

-- helper de asserção (ambiente)
create or replace function public._t_assert(p_cond boolean, p_msg text) returns void
language plpgsql as
$$ begin if not p_cond then raise exception 'FALHOU: %', p_msg; end if; end $$;

-- ============================ CONTRATO (migration VERBATIM) ============================
\i :mig_dir/20261011181949_warroom_alerts_resolve.sql

-- ============================ FIXTURES ============================
insert into public.profiles(id, user_id, full_name) values
  ('a1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','Admin'),
  ('a2222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','Supervisor'),
  ('a3333333-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333','Atendente');

insert into public.user_roles(user_id, role) values
  ('11111111-1111-1111-1111-111111111111','admin'),
  ('22222222-2222-2222-2222-222222222222','supervisor'),
  ('33333333-3333-3333-3333-333333333333','agent');

insert into public.warroom_alerts(id, alert_type, title, message, source, is_read, created_at) values
  ('b1111111-1111-1111-1111-111111111111','warning','SLA','Fila acima do limite','sla-monitor',false, now()),
  ('b2222222-2222-2222-2222-222222222222','critical','SLA','Fila critica','sla-monitor',false, now()),
  ('b3333333-3333-3333-3333-333333333333','critical','SLA','Fila critica 2','sla-monitor',false, now()),
  ('b4444444-4444-4444-4444-444444444444','critical','SLA','Antigo','sla-monitor',false, now() - interval '48 hours');

\echo '== estrutura =='
do $$
begin
  perform public._t_assert((select count(*) from information_schema.columns
    where table_schema='public' and table_name='warroom_alerts'
      and column_name in ('resolved_at','resolved_by','resolution_note')) = 3,
    'faltam colunas de resolucao em warroom_alerts');
  perform public._t_assert((select data_type from information_schema.columns
    where table_schema='public' and table_name='warroom_alerts' and column_name='resolved_at')
    = 'timestamp with time zone', 'resolved_at deveria ser timestamptz');
  perform public._t_assert((select is_nullable from information_schema.columns
    where table_schema='public' and table_name='warroom_alerts' and column_name='resolved_by')
    = 'YES', 'resolved_by deveria ser nullable (aditiva)');
  perform public._t_assert(exists(select 1 from pg_indexes
    where schemaname='public' and indexname='idx_warroom_alerts_created_at'), 'indice por created_at ausente');
  perform public._t_assert(exists(select 1 from pg_indexes
    where schemaname='public' and indexname='idx_warroom_alerts_active'), 'indice parcial de ativos ausente');
  perform public._t_assert((select pg_get_indexdef(indexrelid) like '%WHERE (resolved_at IS NULL)%'
    from pg_index where indexrelid = 'public.idx_warroom_alerts_active'::regclass), 'idx_warroom_alerts_active deveria ser parcial');
  perform public._t_assert((select prosecdef from pg_proc where oid='public.resolve_warroom_alert(uuid,text)'::regprocedure),
    'resolve_warroom_alert deveria ser SECURITY DEFINER');
  perform public._t_assert((select prosecdef from pg_proc where oid='public.warroom_alerts_summary(interval)'::regprocedure),
    'warroom_alerts_summary deveria ser SECURITY DEFINER');
  perform public._t_assert((select 'search_path=pg_catalog, public' = any(proconfig) from pg_proc
    where oid='public.resolve_warroom_alert(uuid,text)'::regprocedure), 'resolve_warroom_alert sem search_path fixo');
  perform public._t_assert((select 'search_path=pg_catalog, public' = any(proconfig) from pg_proc
    where oid='public.warroom_alerts_summary(interval)'::regprocedure), 'warroom_alerts_summary sem search_path fixo');
  perform public._t_assert((select 'search_path=pg_catalog, public' = any(proconfig) from pg_proc
    where oid='public.prevent_direct_warroom_alert_resolution_update()'::regprocedure), 'trigger de blindagem sem search_path fixo');
  perform public._t_assert(exists(select 1 from pg_trigger
    where tgname = 'trg_prevent_direct_warroom_alert_resolution_update'
      and tgrelid = 'public.warroom_alerts'::regclass), 'trigger de blindagem resolved_* ausente');
end $$;

\echo '== limite de 500 caracteres da nota =='
do $$
declare v_ok500 boolean := false; v_erro501 boolean := false;
begin
  -- Com o gatilho de INSERT ativo, este teste estrutural da constraint liga a mesma flag
  -- interna que a RPC usa, para isolar o limite de 500 caracteres da blindagem de auditoria.
  perform set_config('app.warroom_resolve','on',true);

  begin
    insert into public.warroom_alerts(title, message, resolution_note)
    values ('t','m', repeat('a', 500));
    v_ok500 := true;
  exception when others then v_ok500 := false;
  end;
  begin
    insert into public.warroom_alerts(title, message, resolution_note)
    values ('t','m', repeat('a', 501));
  exception when check_violation then v_erro501 := true;
  end;

  perform set_config('app.warroom_resolve','off',true);

  perform public._t_assert(v_ok500, 'nota com 500 caracteres deveria passar');
  perform public._t_assert(v_erro501, 'nota com 501 caracteres deveria violar warroom_alerts_resolution_note_len');
  -- limpa as linhas de teste para nao contaminar as contagens mais abaixo
  delete from public.warroom_alerts where title = 't' and message = 'm';
end $$;

\echo '== permissoes (quem pode / quem nao pode / anonimo) =='
do $$
begin
  perform public._t_assert(has_function_privilege('authenticated','public.resolve_warroom_alert(uuid,text)','EXECUTE'),
    'authenticated deveria poder executar resolve_warroom_alert');
  perform public._t_assert(not has_function_privilege('anon','public.resolve_warroom_alert(uuid,text)','EXECUTE'),
    'anon NAO deveria poder executar resolve_warroom_alert');
  perform public._t_assert(has_function_privilege('authenticated','public.warroom_alerts_summary(interval)','EXECUTE'),
    'authenticated deveria poder executar warroom_alerts_summary');
  perform public._t_assert(not has_function_privilege('anon','public.warroom_alerts_summary(interval)','EXECUTE'),
    'anon NAO deveria poder executar warroom_alerts_summary');
end $$;

-- anonimo: EXECUTE negado pelo Postgres (REVOKE do Publico)
do $$
declare v_estado text := 'sem-erro';
begin
  perform set_config('role','anon',true);
  begin
    perform public.resolve_warroom_alert('b1111111-1111-1111-1111-111111111111'::uuid, null);
  exception when insufficient_privilege then v_estado := 'negado';
            when others then v_estado := 'outro:'||sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_estado = 'negado', 'anon NAO poderia executar resolve_warroom_alert ('||v_estado||')');
end $$;

do $$
declare v_estado text := 'sem-erro';
begin
  perform set_config('role','anon',true);
  begin
    perform public.warroom_alerts_summary();
  exception when insufficient_privilege then v_estado := 'negado';
            when others then v_estado := 'outro:'||sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_estado = 'negado', 'anon NAO poderia executar warroom_alerts_summary ('||v_estado||')');
end $$;

-- authenticated sem papel de staff (atendente): negado DENTRO da funcao
do $$
declare v_msg text := 'sem-erro';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','33333333-3333-3333-3333-333333333333')::text, true);
  begin
    perform public.resolve_warroom_alert('b1111111-1111-1111-1111-111111111111'::uuid, null);
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_msg = 'not_authorized', 'atendente deveria receber not_authorized, veio: '||v_msg);
end $$;

-- authenticated sem papel de staff (atendente): summary tambem tem o mesmo portao
do $$
declare v_msg text := 'sem-erro';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','33333333-3333-3333-3333-333333333333')::text, true);
  begin
    perform public.warroom_alerts_summary();
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_msg = 'not_authorized', 'summary para atendente deveria dar not_authorized, veio: '||v_msg);
end $$;

-- staff nao pode forjar resolved_* por INSERT direto: precisa passar pela RPC para auditar
\echo '== insert direto de resolved_* e recusado =='
do $$
declare v_msg text := 'sem-erro'; v_existe int; v_aud int;
begin
  perform set_config('app.warroom_resolve','off',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111')::text, true);
  begin
    insert into public.warroom_alerts(id, alert_type, title, message, source, is_read, resolved_by)
    values ('b5555555-5555-5555-5555-555555555555','warning','Forjado','Resolucao sem auditoria','sla-monitor',false,
            'a3333333-3333-3333-3333-333333333333'::uuid);
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);

  select count(*) into v_existe from public.warroom_alerts where id = 'b5555555-5555-5555-5555-555555555555'::uuid;
  select count(*) into v_aud from public.audit_logs where entity_id = 'b5555555-5555-5555-5555-555555555555'::uuid;

  perform public._t_assert(v_msg = 'resolution_update_not_allowed', 'INSERT direto com resolved_* deveria ser recusado, veio: '||v_msg);
  perform public._t_assert(v_existe = 0, 'INSERT direto recusado nao deveria deixar linha forjada');
  perform public._t_assert(v_aud = 0, 'INSERT direto recusado nao deveria gravar auditoria falsa');
end $$;

-- staff nao pode forjar resolved_* por UPDATE direto: precisa passar pela RPC para auditar
\echo '== update direto de resolved_* e recusado =='
do $$
declare v_msg text := 'sem-erro'; v_aud int; v_ts timestamptz; v_by uuid; v_note text;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111')::text, true);
  begin
    update public.warroom_alerts
       set resolved_at = now(),
           resolved_by = 'a3333333-3333-3333-3333-333333333333'::uuid,
           resolution_note = 'sem auditoria'
     where id = 'b1111111-1111-1111-1111-111111111111'::uuid;
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);

  select resolved_at, resolved_by, resolution_note into v_ts, v_by, v_note
    from public.warroom_alerts where id = 'b1111111-1111-1111-1111-111111111111'::uuid;
  select count(*) into v_aud from public.audit_logs where entity_id = 'b1111111-1111-1111-1111-111111111111'::uuid;

  perform public._t_assert(v_msg = 'resolution_update_not_allowed', 'UPDATE direto de resolved_* deveria ser recusado, veio: '||v_msg);
  perform public._t_assert(v_ts is null and v_by is null and v_note is null, 'UPDATE direto nao deveria gravar resolved_*');
  perform public._t_assert(v_aud = 0, 'UPDATE direto nao deveria gravar auditoria falsa');
end $$;

-- authenticated staff (admin): resolve, grava colunas e auditoria SEM dado pessoal
\echo '== admin resolve (caminho feliz) =='
do $$
declare
  v_admin_user uuid := '11111111-1111-1111-1111-111111111111';
  v_admin_profile uuid := 'a1111111-1111-1111-1111-111111111111';
  v_alert uuid := 'b2222222-2222-2222-2222-222222222222';
  v_res jsonb; v_ts timestamptz; v_by uuid; v_note text; v_aud jsonb;
  v_nota text := 'resolvido no teste';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_user)::text, true);
  v_res := public.resolve_warroom_alert(v_alert, v_nota);
  select resolved_at, resolved_by, resolution_note into v_ts, v_by, v_note
    from public.warroom_alerts where id = v_alert;
  perform set_config('role','postgres',true);

  perform public._t_assert(coalesce((v_res->>'ok')::boolean,false), 'admin deveria resolver (res='||v_res::text||')');
  perform public._t_assert(coalesce((v_res->>'already_resolved')::boolean,true) = false, 'primeira resolucao nao deveria ser already_resolved');
  perform public._t_assert(v_ts is not null, 'resolved_at nao gravou');
  perform public._t_assert(v_by = v_admin_profile, 'resolved_by nao gravou o profile do admin');
  perform public._t_assert(v_note = v_nota, 'resolution_note nao gravou');

  select details into v_aud from public.audit_logs
    where action = 'warroom_alert_resolved' and entity_id = v_alert;
  perform public._t_assert(v_aud is not null, 'auditoria nao gravou');
  perform public._t_assert(v_aud->>'note_length' = char_length(v_nota)::text, 'auditoria deveria gravar note_length');
  perform public._t_assert(position(v_nota in coalesce(v_aud::text,'')) = 0, 'auditoria NAO pode conter o texto da nota');
end $$;

-- idempotencia: resolver de novo nao reescreve quem/quando nem duplica auditoria
\echo '== idempotencia =='
do $$
declare
  v_alert uuid := 'b2222222-2222-2222-2222-222222222222';
  v_res jsonb; v_ts_antes timestamptz; v_ts_depois timestamptz; v_aud int;
begin
  select resolved_at into v_ts_antes from public.warroom_alerts where id = v_alert;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','22222222-2222-2222-2222-222222222222')::text, true);
  v_res := public.resolve_warroom_alert(v_alert, 'outra nota');
  perform set_config('role','postgres',true);
  select resolved_at into v_ts_depois from public.warroom_alerts where id = v_alert;
  select count(*) into v_aud from public.audit_logs where action='warroom_alert_resolved' and entity_id = v_alert;

  perform public._t_assert(coalesce((v_res->>'already_resolved')::boolean,false), 'segunda resolucao deveria retornar already_resolved');
  perform public._t_assert(v_ts_antes = v_ts_depois, 'resolved_at nao deveria ser reescrito');
  perform public._t_assert(v_aud = 1, 'nao deveria duplicar auditoria (aud='||v_aud||')');
end $$;

-- supervisor tambem pode (staff)
\echo '== supervisor resolve =='
do $$
declare v_res jsonb;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','22222222-2222-2222-2222-222222222222')::text, true);
  v_res := public.resolve_warroom_alert('b3333333-3333-3333-3333-333333333333'::uuid, null);
  perform set_config('role','postgres',true);
  perform public._t_assert(coalesce((v_res->>'ok')::boolean,false), 'supervisor deveria resolver');
end $$;

-- nota longa e alerta inexistente
\echo '== entradas invalidas =='
do $$
declare v_msg text := 'sem-erro';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111')::text, true);
  begin
    perform public.resolve_warroom_alert('b1111111-1111-1111-1111-111111111111'::uuid, repeat('x',501));
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_msg = 'note_too_long', 'nota com 501 deveria dar note_too_long, veio: '||v_msg);
end $$;

do $$
declare v_msg text := 'sem-erro';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111')::text, true);
  begin
    perform public.resolve_warroom_alert('00000000-0000-0000-0000-000000000000'::uuid, null);
  exception when others then v_msg := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  perform public._t_assert(v_msg = 'alert_not_found', 'alerta inexistente deveria dar alert_not_found, veio: '||v_msg);
end $$;

-- contagens do painel: janela 24h exclui o alerta antigo (48h)
\echo '== warroom_alerts_summary (janela) =='
do $$
declare v24 jsonb; v48 jsonb;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111')::text, true);
  v24 := public.warroom_alerts_summary('24 hours');
  v48 := public.warroom_alerts_summary('48 hours');
  perform set_config('role','postgres',true);

  perform public._t_assert((v24->>'total')::int = 3, 'summary 24h total deveria ser 3, veio '||v24::text);
  perform public._t_assert((v24->>'resolvidos')::int = 2, 'summary 24h resolvidos deveria ser 2, veio '||v24::text);
  perform public._t_assert((v24->>'ativos')::int = 1, 'summary 24h ativos deveria ser 1, veio '||v24::text);
  perform public._t_assert((v24->>'criticos')::int = 2, 'summary 24h criticos deveria ser 2 (mesma leitura da V3), veio '||v24::text);
  perform public._t_assert((v48->>'total')::int = 4, 'summary 48h deveria incluir o alerta antigo, veio '||v48::text);
end $$;

\echo 'OK: warroom_alerts_resolve (estrutura, permissao, resolucao com auditoria, idempotencia, contagens)'
rollback;
