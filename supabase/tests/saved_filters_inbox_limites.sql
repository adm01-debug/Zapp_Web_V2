-- saved_filters_inbox_limites.sql
-- Prova os limites dos presets de filtro do inbox (cartao t_66f0765c):
--   1) nome unico por usuario ignorando caixa (indice parcial, so o tipo do inbox);
--   2) teto de 20 presets do inbox por usuario (recusa a 21a com erro claro);
--   3) preset de inbox NAO vaza para outro usuario: o gatilho recusa is_shared = true, e a
--      policy de compartilhamento segue INTACTA (a migration nao toca em policy nenhuma).
--
-- Roda no banco LOCAL da copia, como o proprio servidor (superusuario) que desce de nivel
-- para os papeis REAIS com `set local role authenticated` + claims de JWT:
--   zapp-db-local psql <copia> <conjunto> < supabase/tests/saved_filters_inbox_limites.sql
-- Fluxo normal termina com `ROLLBACK` e sem EXCEPTION = verde. Toda escrita fica na transacao.
-- ON_ERROR_STOP: qualquer falha aborta o psql com codigo != 0 (vermelho de verdade, nao so um log).

\set ON_ERROR_STOP on
begin;

-- Usuarios sinteticos em auth.users (saved_filters.user_id tem FK para users, migration
-- 20260926200000_e17_referential_integrity_fks.sql). Tudo some no ROLLBACK final.
-- A = dono dos presets; B = outro usuario; C = caso de nome repetido.
\set uid_a '''11111111-1111-1111-1111-111111111111'''
\set uid_b '''22222222-2222-2222-2222-222222222222'''
\set uid_c '''33333333-3333-3333-3333-333333333333'''

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'sf-a@example.test', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'sf-b@example.test', '', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'sf-c@example.test', '', now(), now(), now());

set local role authenticated;

-- ============ 1) nome repetido em CAIXA diferente e recusado (usuario C) ============
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

insert into public.saved_filters (user_id, entity_type, name)
values (:uid_c, 'inbox_filters', 'Filtro X');

do $$
begin
  begin
    insert into public.saved_filters (user_id, entity_type, name)
    values ('33333333-3333-3333-3333-333333333333', 'inbox_filters', 'fILTRO x');
    raise exception 'saved_filters_inbox_limites T1 FALHOU: nome repetido em caixa diferente foi aceito';
  exception when unique_violation then
    null;  -- esperado: o indice unico em lower(name) barra
  end;
end
$$;

-- ============ 2) teto de 20 presets do inbox por usuario (usuario A) ============
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- 20 presets passam (um INSERT por iteracao: o gatilho ve as linhas anteriores da mesma sessao).
do $$
declare i int;
begin
  for i in 1..20 loop
    insert into public.saved_filters (user_id, entity_type, name)
    values ('11111111-1111-1111-1111-111111111111', 'inbox_filters', 'Preset ' || i);
  end loop;
end
$$;

-- a 21a e recusada, com mensagem clara
do $$
begin
  begin
    insert into public.saved_filters (user_id, entity_type, name)
    values ('11111111-1111-1111-1111-111111111111', 'inbox_filters', 'Preset 21');
    raise exception 'saved_filters_inbox_limites T2 FALHOU: o 21o preset foi aceito';
  exception when check_violation then
    if sqlerrm not like '%Limite de 20%' then
      raise exception 'saved_filters_inbox_limites T2 FALHOU: erro do teto sem mensagem clara: %', sqlerrm;
    end if;
  end;
end
$$;

-- com 20 presets, o usuario AINDA edita o proprio preset (nao e a 21a linha)
update public.saved_filters set name = 'Preset 1 editado'
 where user_id = '11111111-1111-1111-1111-111111111111' and entity_type = 'inbox_filters' and name = 'Preset 1';

do $$
begin
  if not exists (
    select 1 from public.saved_filters
     where user_id = '11111111-1111-1111-1111-111111111111'
       and entity_type = 'inbox_filters' and name = 'Preset 1 editado'
  ) then
    raise exception 'saved_filters_inbox_limites T3 FALHOU: editar um preset existente com 20 no total foi recusado';
  end if;
end
$$;

-- A tenta compartilhar um preset de inbox (UPDATE e INSERT) e e recusada pelo gatilho
do $$
begin
  begin
    update public.saved_filters set is_shared = true
     where user_id = '11111111-1111-1111-1111-111111111111' and entity_type = 'inbox_filters' and name = 'Preset 2';
    raise exception 'saved_filters_inbox_limites T4 FALHOU: compartilhar preset de inbox por UPDATE foi aceito';
  exception when check_violation then
    null;  -- esperado
  end;
  begin
    insert into public.saved_filters (user_id, entity_type, name, is_shared)
    values ('11111111-1111-1111-1111-111111111111', 'inbox_filters', 'Preset compartilhado', true);
    raise exception 'saved_filters_inbox_limites T4 FALHOU: criar preset de inbox ja compartilhado foi aceito';
  exception when check_violation then
    null;  -- esperado (a recusa de compartilhado vem antes do teto)
  end;
end
$$;

-- Os demais tipos continuam podendo ser compartilhados e NAO tem o indice de nome nem o teto:
-- A cria um filtro compartilhado de OUTRO tipo e dois com o mesmo nome em caixas diferentes.
insert into public.saved_filters (user_id, entity_type, name, is_shared)
values ('11111111-1111-1111-1111-111111111111', 'contacts_filters', 'Comp contatos', true);
insert into public.saved_filters (user_id, entity_type, name)
values ('11111111-1111-1111-1111-111111111111', 'contacts_filters', 'Mesmo Nome'),
       ('11111111-1111-1111-1111-111111111111', 'contacts_filters', 'MESMO nome');

-- ============ 3) outro usuario NAO ve o preset de inbox de A ============
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$
declare
  v_inbox  int;
  v_outro  int;
begin
  select count(*) into v_inbox
    from public.saved_filters
   where user_id = '11111111-1111-1111-1111-111111111111' and entity_type = 'inbox_filters';

  if v_inbox <> 0 then
    raise exception 'saved_filters_inbox_limites T4 FALHOU: B enxergou % preset(s) de inbox de A', v_inbox;
  end if;

  -- mas o filtro compartilhado de OUTRO tipo continua visivel (a policy nao mudou)
  select count(*) into v_outro
    from public.saved_filters
   where user_id = '11111111-1111-1111-1111-111111111111' and entity_type = 'contacts_filters' and is_shared;

  if v_outro <> 1 then
    raise exception 'saved_filters_inbox_limites T4 FALHOU: B deveria ver 1 filtro compartilhado de outro tipo, viu %', v_outro;
  end if;
end
$$;

-- ============ 5) a policy de compartilhamento segue exatamente como na main ============
reset role;
do $$
declare v_qual text;
begin
  select qual into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'saved_filters' and policyname = 'Users can view shared filters';
  if v_qual is null or replace(v_qual, ' ', '') not in ('(is_shared=true)', 'is_shared=true') then
    raise exception 'saved_filters_inbox_limites T5 FALHOU: a policy de compartilhamento mudou: %', v_qual;
  end if;
end
$$;

rollback;

\echo 'saved_filters_inbox_limites: OK (nome unico case-insensitive so no inbox; 20 ok / 21a recusada; editar no teto ok; preset de inbox nao pode ser compartilhado; policy intacta)'
