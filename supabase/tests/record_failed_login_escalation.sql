-- record_failed_login_escalation.sql
-- Prova de contrato da RPC public.record_failed_login (migration
-- 20261013235910_record_failed_login_escalation.sql, cartão t_4fa0b970).
--
-- Roda como postgres no banco LOCAL da tarefa, dentro de BEGIN…ROLLBACK
-- (nenhuma fixture persiste):
--   zapp-db-local psql . <conjunto> < supabase/tests/record_failed_login_escalation.sql
--
-- O que prova (o contador SÓ zera por clear_login_attempts ou após >= 60 min
-- sem nenhuma tentativa; escalada 2^(n-5) min com TETO de 15 min):
--   T1  5ª falha trava por 1 min; as 4 primeiras não travam (attempts 1..4);
--   T2  bloqueio vencido NÃO zera o contador: escalada 2, 4, 8, 15, 15 min
--       (attempts 6..10) — a regressão que zerava ao vencer está morta;
--   T2b contador alto (40) NÃO estoura o INTEGER de POWER(2,n)::integer;
--       trava no teto de 15 min;
--   T3  >= 60 min sem tentativa zera; 59 min NÃO zera (fronteira);
--   T4  clear_login_attempts (sucesso) zera; a próxima falha volta a 1;
--   T5  contrato: a função final NÃO tem o ramo "bloqueio vencido -> 1"
--       e traz o teto de 15 min e a janela de 60 min;
--   T6  ACL: EXECUTE só para service_role (e o dono); negado a anon,
--       authenticated e PUBLIC;
--   T7  papel real: anon e authenticated recebem permission denied.

begin;

-- ===== T1: 5 falhas = 1 min ==================================================
set local role service_role;

do $$
declare
  r record;
  i integer;
begin
  delete from public.login_attempts where email = 'escalada@test.local';

  for i in 1..4 loop
    select * into r from public.record_failed_login('escalada@test.local', '127.0.0.1', 'ops');
    if r.is_locked then
      raise exception 'T1 FALHOU: travou na %a falha (antes da 5a)', i;
    end if;
    if r.attempts <> i then
      raise exception 'T1 FALHOU: falha % -> attempts=% (esperado %)', i, r.attempts, i;
    end if;
  end loop;

  select * into r from public.record_failed_login('escalada@test.local', '127.0.0.1', 'ops');
  if not r.is_locked or r.attempts <> 5 then
    raise exception 'T1 FALHOU: 5a falha -> is_locked=%, attempts=%', r.is_locked, r.attempts;
  end if;
  if round(extract(epoch from (r.locked_until - now())) / 60) <> 1 then
    raise exception 'T1 FALHOU: 1o bloqueio = % min (esperado 1)',
      round(extract(epoch from (r.locked_until - now())) / 60);
  end if;
  raise notice 'T1 OK: 5a falha trava por 1 min (attempts=5)';
end $$;

-- ===== T2: bloqueio vencido não zera; escalada 2,4,8,15,15 ===================
do $$
declare
  r record;
  i integer;
  n integer;
  esperado constant integer[] := array[2, 4, 8, 15, 15];
begin
  for i in 1..5 loop
    -- simula o bloqueio vencido com tentativa recente (last_attempt_at < 60 min)
    update public.login_attempts
       set locked_until    = now() - interval '1 second',
           last_attempt_at = now() - interval '1 minute'
     where email = 'escalada@test.local';

    select * into r from public.record_failed_login('escalada@test.local', '127.0.0.1', 'ops');

    if r.attempts <> 5 + i then
      raise exception 'T2 FALHOU: contador ZEROU ao vencer (falha % -> attempts=%, esperado %)',
        i, r.attempts, 5 + i;
    end if;
    n := round(extract(epoch from (r.locked_until - now())) / 60);
    if n <> esperado[i] then
      raise exception 'T2 FALHOU: ciclo % travou % min (esperado %)', i, n, esperado[i];
    end if;
    if not r.is_locked then
      raise exception 'T2 FALHOU: ciclo % não travou', i;
    end if;
  end loop;
  raise notice 'T2 OK: bloqueio vencido NÃO zera o contador; escalada 2,4,8,15,15 min';
end $$;

-- ===== T2b: contador alto não estoura o INTEGER; teto de 15 min ==============
do $$
declare
  r record;
  n integer;
begin
  -- attempts bem acima de 36 (POWER(2,35) já estouraria ::integer) com bloqueio vencido:
  -- antes do ajuste do expoente isto levantava "integer out of range".
  update public.login_attempts
     set attempt_count   = 40,
         locked_until    = now() - interval '1 second',
         last_attempt_at = now() - interval '1 minute'
   where email = 'escalada@test.local';

  select * into r from public.record_failed_login('escalada@test.local', '127.0.0.1', 'ops');

  if r.attempts <> 41 then
    raise exception 'T2b FALHOU: attempts=% (esperado 41)', r.attempts;
  end if;
  if not r.is_locked then
    raise exception 'T2b FALHOU: não travou com contador alto';
  end if;
  n := round(extract(epoch from (r.locked_until - now())) / 60);
  if n <> 15 then
    raise exception 'T2b FALHOU: contador alto travou % min (esperado 15)', n;
  end if;
  raise notice 'T2b OK: contador alto (40) não estoura INTEGER; trava no teto de 15 min';
end $$;

-- ===== T3: >= 60 min sem tentativa zera; 59 min não zera =====================
do $$
declare
  r record;
begin
  -- 61 min sem tentativa: histórico expira, recomeça em 1
  update public.login_attempts
     set attempt_count   = 8,
         locked_until    = null,
         last_attempt_at = now() - interval '61 minutes'
   where email = 'escalada@test.local';

  select * into r from public.record_failed_login('escalada@test.local', null, null);
  if r.attempts <> 1 or r.is_locked then
    raise exception 'T3 FALHOU: após 61 min -> attempts=%, is_locked=% (esperado 1/false)',
      r.attempts, r.is_locked;
  end if;

  -- 59 min sem tentativa: ainda conta (não zera)
  update public.login_attempts
     set attempt_count   = 4,
         locked_until    = null,
         last_attempt_at = now() - interval '59 minutes'
   where email = 'escalada@test.local';

  select * into r from public.record_failed_login('escalada@test.local', null, null);
  if r.attempts <> 5 or not r.is_locked then
    raise exception 'T3 FALHOU: 59 min -> attempts=%, is_locked=% (esperado 5/true)',
      r.attempts, r.is_locked;
  end if;
  raise notice 'T3 OK: >= 60 min zera; 59 min continua contando';
end $$;

-- ===== T4: sucesso (clear_login_attempts) zera ===============================
do $$
declare
  v_count integer;
  r record;
begin
  perform public.clear_login_attempts('escalada@test.local');
  select count(*) into v_count from public.login_attempts where email = 'escalada@test.local';
  if v_count <> 0 then
    raise exception 'T4 FALHOU: clear_login_attempts não removeu a linha (count=%)', v_count;
  end if;

  select * into r from public.record_failed_login('escalada@test.local', null, null);
  if r.attempts <> 1 then
    raise exception 'T4 FALHOU: após sucesso, próxima falha vem attempts=% (esperado 1)', r.attempts;
  end if;
  raise notice 'T4 OK: clear_login_attempts zera; próxima falha volta a 1';
end $$;

-- ===== T5: contrato do corpo final ==========================================
do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.record_failed_login(text,text,text)'::regprocedure);

  if src ~* 'locked_until[^;]*<= *now\(\)[^;]*then[[:space:]]+1' then
    raise exception 'T5 FALHOU: a função final ainda zera o contador no bloqueio vencido';
  end if;
  if src not like '%60 minutes%' then
    raise exception 'T5 FALHOU: falta a janela de inatividade de 60 min';
  end if;
  if src not like '%v_max_lock_min constant integer := 15%' then
    raise exception 'T5 FALHOU: falta o teto de 15 min';
  end if;
  raise notice 'T5 OK: sem ramo "bloqueio vencido -> 1"; teto 15 min e janela 60 min presentes';
end $$;

-- ===== T6: ACL (como postgres) ==============================================
reset role;

do $$
declare
  sig regprocedure := 'public.record_failed_login(text,text,text)'::regprocedure;
begin
  if has_function_privilege('anon', sig, 'EXECUTE')
     or has_function_privilege('authenticated', sig, 'EXECUTE') then
    raise exception 'T6 FALHOU: EXECUTE aberto para anon/authenticated';
  end if;
  if not has_function_privilege('service_role', sig, 'EXECUTE') then
    raise exception 'T6 FALHOU: service_role sem EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) g
     where p.oid = sig and g.grantee = 0  -- 0 = PUBLIC
  ) then
    raise exception 'T6 FALHOU: EXECUTE em PUBLIC';
  end if;
  raise notice 'T6 OK: EXECUTE só service_role (+dono); negado a anon/authenticated/PUBLIC';
end $$;

-- ===== T7: papel real — anon e authenticated negados ========================
set local role anon;

do $$
begin
  begin
    perform public.record_failed_login('negado@test.local', null, null);
    raise exception 'T7a FALHOU: anon executou record_failed_login';
  exception when insufficient_privilege then
    raise notice 'T7a OK: anon negado (permission denied)';
  end;
end $$;

reset role;
set local role authenticated;

do $$
begin
  begin
    perform public.record_failed_login('negado@test.local', null, null);
    raise exception 'T7b FALHOU: authenticated executou record_failed_login';
  exception when insufficient_privilege then
    raise notice 'T7b OK: authenticated negado (permission denied)';
  end;
end $$;

reset role;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.
