-- PostgreSQL 17 contract for 20261107120000_goal_notifications_own_insert_policy.sql.
-- psql -X -v ON_ERROR_STOP=1 -v mig_dir="$PWD/supabase/migrations" \
--   -f supabase/tests/goal_notifications_own_insert_policy.sql
\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif
BEGIN;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.queue_members (queue_id uuid NOT NULL, profile_id uuid NOT NULL);
CREATE TABLE public.goals_configurations (
  id uuid PRIMARY KEY, profile_id uuid, queue_id uuid, goal_type text NOT NULL,
  daily_target integer NOT NULL, weekly_target integer NOT NULL,
  monthly_target integer NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(p_uid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT p_uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  type text NOT NULL, title text NOT NULL, message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, dedupe_key text UNIQUE,
  is_read boolean NOT NULL DEFAULT false, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles, public.queue_members, public.goals_configurations TO authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

\i :mig_dir/20261107120000_goal_notifications_own_insert_policy.sql

INSERT INTO public.profiles VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
INSERT INTO public.goals_configurations VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',NULL,'messages_sent',10,70,300,true),
 ('55555555-5555-4555-8555-555555555555',NULL,'66666666-6666-4666-8666-666666666666','contacts_handled',5,35,150,true);
INSERT INTO public.queue_members VALUES
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111');

CREATE FUNCTION pg_temp.run_as(p_role text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; RESET ROLE; RETURN 'OK ' || n;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN 'ERROR ' || SQLSTATE; END;
END $f$;
CREATE FUNCTION pg_temp.expect(p_label text, p_actual text, p_expected text) RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected %, got %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_actual;
END $f$;

SELECT pg_temp.expect('table UPDATE revoked',
  has_table_privilege('authenticated','public.notifications','UPDATE')::text,'false');
SELECT pg_temp.expect('is_read column granted',
  has_column_privilege('authenticated','public.notifications','is_read','UPDATE')::text,'true');
SELECT pg_temp.expect('title column denied',
  has_column_privilege('authenticated','public.notifications','title','UPDATE')::text,'false');

SELECT pg_temp.expect('valid personal goal', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(id,user_id,type,title,message,metadata,dedupe_key)
 VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'goal','Meta','Concluida',%L::jsonb,%L)$q$,
 jsonb_build_object('goal_id','33333333-3333-4333-8333-333333333333','goal_type','messages_sent',
 'period','daily','current',10,'target',10)::text,
 'goal:v1:33333333-3333-4333-8333-333333333333:daily:'||current_date)), 'OK 1');

SELECT pg_temp.expect('visible queue goal for member', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(user_id,type,title,message,metadata,dedupe_key)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','goal','Fila','Concluida',%L::jsonb,%L)$q$,
 jsonb_build_object('goal_id','55555555-5555-4555-8555-555555555555','goal_type','contacts_handled',
 'period','daily','current',5,'target',5)::text,
 'goal:v1:55555555-5555-4555-8555-555555555555:daily:'||current_date)), 'OK 1');

SELECT pg_temp.expect('fake goal denied', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(user_id,type,title,message,metadata,dedupe_key)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','goal','Meta','Falsa',%L::jsonb,%L)$q$,
 jsonb_build_object('goal_id','99999999-9999-4999-8999-999999999999','goal_type','messages_sent',
 'period','daily','current',10,'target',10)::text,
 'goal:v1:99999999-9999-4999-8999-999999999999:daily:'||current_date)), 'ERROR 42501');

SELECT pg_temp.expect('unreached goal denied', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(user_id,type,title,message,metadata,dedupe_key)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','goal','Meta','Precoce',%L::jsonb,%L)$q$,
 jsonb_build_object('goal_id','33333333-3333-4333-8333-333333333333','goal_type','messages_sent',
 'period','daily','current',1,'target',10)::text,
 'goal:v1:33333333-3333-4333-8333-333333333333:daily:'||(current_date+1))), 'ERROR 42501');

SELECT pg_temp.expect('oversized numeric denied', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(user_id,type,title,message,metadata,dedupe_key)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','goal','Meta','Gigante',%L::jsonb,%L)$q$,
 ('{"goal_id":"33333333-3333-4333-8333-333333333333","goal_type":"messages_sent",'||
 '"period":"daily","current":'||repeat('9',10000)||',"target":10}')::text,
 'goal:v1:33333333-3333-4333-8333-333333333333:daily:'||(current_date-1))), 'ERROR 42501');

SELECT pg_temp.expect('invalid calendar date fails closed cleanly', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',format($q$
 INSERT INTO notifications(user_id,type,title,message,metadata,dedupe_key)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','goal','Meta','Data',%L::jsonb,%L)$q$,
 jsonb_build_object('goal_id','33333333-3333-4333-8333-333333333333','goal_type','messages_sent',
 'period','daily','current',10,'target',10)::text,
 'goal:v1:33333333-3333-4333-8333-333333333333:daily:9999-99-99')), 'ERROR 42501');

SELECT pg_temp.expect('owner cannot forge title after insert', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 $$UPDATE notifications SET title='forged' WHERE id='44444444-4444-4444-8444-444444444444'$$),
 'ERROR 42501');
SELECT pg_temp.expect('owner marks own row read', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 $$UPDATE notifications SET is_read=true,read_at=now() WHERE id='44444444-4444-4444-8444-444444444444'$$),
 'OK 1');
SELECT pg_temp.expect('other user updates zero rows', pg_temp.run_as(
 'authenticated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 $$UPDATE notifications SET is_read=true,read_at=now() WHERE id='44444444-4444-4444-8444-444444444444'$$),
 'OK 0');

ROLLBACK;
