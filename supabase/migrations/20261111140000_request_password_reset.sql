-- request_password_reset — pedido de redefinição de senha feito por quem NÃO está logado.
--
-- Defeito corrigido: a tela "Esqueci minha senha" (src/pages/ForgotPassword.tsx) roda
-- como anon e (1) lia public.profiles para achar o user_id — a RLS devolve 0 linhas
-- para anon, então a tela concluía "não existe" e saía sem gravar; (2) gravava direto
-- em public.password_reset_requests, mas desde 20260317222352 o INSERT é só do
-- authenticated (user_id = auth.uid()). Resultado: nenhum pedido chegava ao gestor.
--
-- Agora a tela chama esta função. Ela:
--   - procura o usuário pelo e-mail do lado do servidor (SECURITY DEFINER);
--   - grava o pedido como 'pending' — a LIBERAÇÃO continua exclusiva do gestor
--     (policy "Admins can update reset requests" + Edge approve-password-reset,
--     ambas restritas a is_admin_or_supervisor);
--   - responde sempre do mesmo jeito (void), exista o e-mail ou não, para não revelar
--     quais e-mails têm conta;
--   - não cria outro pedido se o usuário já tem um 'pending' de menos de 15 minutos.
--
-- Rollback (SQL executável):
--   drop function if exists public.request_password_reset(text, text, text);

CREATE OR REPLACE FUNCTION public.request_password_reset(
  p_email text,
  p_reason text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_ip      text;
BEGIN
  -- Formato mínimo; e-mail inválido não revela nada (mesma resposta).
  IF length(v_email) < 3 OR length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN;
  END IF;

  SELECT p.user_id INTO v_user_id
  FROM public.profiles AS p
  WHERE lower(p.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Anti-abuso: um pedido pendente recente basta.
  IF EXISTS (
    SELECT 1 FROM public.password_reset_requests AS r
    WHERE r.user_id = v_user_id
      AND r.status = 'pending'
      AND r.created_at > statement_timestamp() - interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  -- IP de origem como o PostgREST repassa (primeiro da cadeia); só informativo para o gestor.
  BEGIN
    v_ip := nullif(btrim(split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  INSERT INTO public.password_reset_requests (user_id, email, reason, ip_address, user_agent)
  VALUES (
    v_user_id,
    v_email,
    nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    left(v_ip, 64),
    left(nullif(btrim(coalesce(p_user_agent, '')), ''), 500)
  );
END;
$function$;

COMMENT ON FUNCTION public.request_password_reset(text, text, text) IS
  'Pedido de redefinição de senha sem login (tela Esqueci minha senha). Cria pedido pending para aprovação do gestor; resposta idêntica exista ou não o e-mail; 1 pendente por usuário a cada 15 min.';

REVOKE ALL ON FUNCTION public.request_password_reset(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_password_reset(text, text, text) TO anon, authenticated, service_role;
