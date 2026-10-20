-- my_active_sessions
-- Rollback: desagenda o job diario 'expire-orphan-user-sessions' e remove as funcoes public.my_active_sessions() e public.expire_orphan_user_sessions(); o cliente volta a ler public.user_sessions direto (com as linhas mortas reaparecendo).
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where jobname = 'expire-orphan-user-sessions';
--   drop function if exists public.expire_orphan_user_sessions();
--   drop function if exists public.my_active_sessions();
--
-- Defeito: DevicesPanel/SecurityOverview listam as sessoes lendo a tabela
-- public.user_sessions direto (filtro is_active=true). Essa tabela e um INVENTARIO do
-- cliente: linha sem auth.sessions correspondente (sessao Auth revogada/limpa) continua
-- com is_active=true e aparece como "dispositivo conectado" para sempre -- as 13 linhas
-- orfas medidas. Pior: nao ha como saber QUAL linha e' a sessao de agora (o JWT nao e'
-- lido), entao o cartao "Sessao atual" nao consegue se identificar.
--
-- Esta migration entrega as duas pecas do lado do banco:
--  1. public.my_active_sessions(): devolve SO as sessoes vivas do PROPRIO chamador
--     (us.user_id = auth.uid()), casando public.user_sessions com auth.sessions por
--     auth_session_id -- linha orfa (sem auth.sessions) simplesmente nao sai. Marca
--     is_current comparando auth_session_id com o claim session_id do JWT da chamada
--     (mesmo criterio da V3). Uma feature flag nao pode montar isso: a decisao depende
--     do auth.uid() e do JWT do chamador, que so o banco ve com seguranca.
--  2. public.expire_orphan_user_sessions() + job diario do pg_cron: marca is_active=false
--     nas linhas sem auth.sessions viva. NAO apaga nada -- so expira. Idempotente (a
--     2a execucao devolve 0). Roda o saneamento das orfas ja existentes no fim do arquivo.
--
-- Semantica de "viva" (mesma nos dois objetos): auth_session_id nao nulo, existe
-- auth.sessions com o MESMO id e o MESMO user_id, e a sessao Auth ainda nao passou do
-- not_after. Nao uso expires_at de user_sessions para expirar: o DEFAULT dessa coluna e'
-- now()+24h, entao expirar por ela mataria sessao legitima de quem fica logado >24h.

-- 1) RPC do chamador: so as sessoes vivas DELE, com o marcador de sessao atual.
CREATE OR REPLACE FUNCTION public.my_active_sessions()
RETURNS TABLE (
  id uuid,
  device_id uuid,
  ip_address text,
  user_agent text,
  started_at timestamptz,
  last_activity_at timestamptz,
  auth_session_id uuid,
  is_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    us.id,
    us.device_id,
    us.ip_address,
    us.user_agent,
    us.started_at,
    us.last_activity_at,
    us.auth_session_id,
    COALESCE(
      us.auth_session_id IS NOT NULL
        AND us.auth_session_id = NULLIF(
              COALESCE(
                NULLIF(current_setting('request.jwt.claim.session_id', true), ''),
                current_setting('request.jwt.claims', true)::jsonb ->> 'session_id'
              ), ''
            )::uuid,
      false
    ) AS is_current
  FROM public.user_sessions AS us
  JOIN auth.sessions AS s
    ON s.id = us.auth_session_id
   AND s.user_id = us.user_id
   AND (s.not_after IS NULL OR s.not_after > now())
  WHERE us.user_id = auth.uid()
    AND us.is_active IS TRUE
  ORDER BY us.last_activity_at DESC NULLS LAST;
$function$;

-- ACL: PUBLIC e anon nao podem nem chamar (anon recebe 42501). Como a funcao depende de
-- auth.uid() e do JWT do chamador, quem executa precisa ser authenticated.
REVOKE ALL ON FUNCTION public.my_active_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_active_sessions() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_active_sessions() TO authenticated;

-- 2) Limpeza: expira (nao apaga) as sessoes sem auth.sessions viva. Reexecutavel.
CREATE OR REPLACE FUNCTION public.expire_orphan_user_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marcadas integer;
BEGIN
  UPDATE public.user_sessions AS us
     SET is_active = false,
         ended_at = COALESCE(us.ended_at, now())
   WHERE us.is_active IS TRUE
     AND NOT EXISTS (
           SELECT 1
             FROM auth.sessions AS s
            WHERE s.id = us.auth_session_id
              AND s.user_id = us.user_id
              AND (s.not_after IS NULL OR s.not_after > now())
         );
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  RETURN v_marcadas;
END;
$function$;

-- A limpeza e' server-side (pg_cron roda como postgres dono do job): nao abre EXECUTE
-- para authenticated nem anon. service_role fica com EXECUTE para reuso em operacao.
REVOKE ALL ON FUNCTION public.expire_orphan_user_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_orphan_user_sessions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_orphan_user_sessions() TO service_role;

-- 3) Job diario (03:23 evita a fila de vacuum/limpezas das 03:12/03:42). Idempotente:
-- se ja existe, nao recria nem duplica.
SELECT cron.schedule(
  'expire-orphan-user-sessions',
  '23 3 * * *',
  $cron$SELECT public.expire_orphan_user_sessions();$cron$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-orphan-user-sessions'
);

-- 4) Saneamento unico das orfas ja existentes (as 13 medidas). Reexecutar nao muda nada.
SELECT public.expire_orphan_user_sessions() AS orfas_expiradas;
