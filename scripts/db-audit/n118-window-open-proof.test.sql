\set ON_ERROR_STOP on
BEGIN;

-- Usuários sintéticos só no banco local da tarefa.
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'n118-admin-local@example.invalid', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'n118-agent-local@example.invalid', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.talkx_campaigns (
  id, name, message_template, business_hours_only, schedule_timezone,
  send_window_start, send_window_end, respect_dnd
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'prova n118 window open',
  'oi {{nome}}',
  true,
  'America/Sao_Paulo',
  NULL,
  NULL,
  false
) ON CONFLICT (id) DO UPDATE SET
  business_hours_only = EXCLUDED.business_hours_only,
  schedule_timezone = EXCLUDED.schedule_timezone,
  send_window_start = EXCLUDED.send_window_start,
  send_window_end = EXCLUDED.send_window_end,
  respect_dnd = EXCLUDED.respect_dnd;

-- 1) Sem papel admin/supervisor: 42501, sem vazar campanha por SECURITY DEFINER.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
DO $$
BEGIN
  PERFORM * FROM public.talkx_campaign_window_open(
    '10000000-0000-0000-0000-000000000001',
    '2026-10-05 12:00:00-03'::timestamptz
  );
  RAISE EXCEPTION 'esperava 42501 para usuario sem papel';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok sem papel -> SQLSTATE %', SQLSTATE;
END $$;

-- 2) days presente como JSONB não causa cast jsonb::integer[] e abre no horário.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
INSERT INTO public.talkx_settings (key, value, description)
VALUES ('business_hours', '{"start":"08:00","end":"18:00","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}'::jsonb, 'prova local')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT 'jsonb_days_open' AS caso, allowed, reason, next_window
FROM public.talkx_campaign_window_open(
  '10000000-0000-0000-0000-000000000001',
  '2026-10-05 12:00:00-03'::timestamptz
);

-- 3) business_hours inválido fecha com invalid_business_hours (fail-closed).
UPDATE public.talkx_settings
   SET value = '{"start":"08:00","end":"18:00","tz":"America/Sao_Paulo","days":[]}'::jsonb
 WHERE key = 'business_hours';

SELECT 'invalid_days_closed' AS caso, allowed, reason, next_window
FROM public.talkx_campaign_window_open(
  '10000000-0000-0000-0000-000000000001',
  '2026-10-05 12:00:00-03'::timestamptz
);

-- 4) Setting ausente usa default 08:00-18:00 seg-sex.
DELETE FROM public.talkx_settings WHERE key = 'business_hours';
SELECT 'default_open' AS caso, allowed, reason, next_window
FROM public.talkx_campaign_window_open(
  '10000000-0000-0000-0000-000000000001',
  '2026-10-05 09:00:00-03'::timestamptz
);

ROLLBACK;
