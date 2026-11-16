-- P02: Habilitar MFA obrigatório para todos os usuários admin/supervisor
-- Severidade: ALTA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- NOTA: MFA obrigatório é configurado no Supabase Auth (não SQL puro).

-- ============================================================
-- DIAGNÓSTICO (somente leitura — pode executar):
-- ============================================================

SELECT
  u.email,
  u.last_sign_in_at,
  count(f.id) as mfa_factors
FROM auth.users u
LEFT JOIN auth.mfa_factors f ON f.user_id = u.id
GROUP BY u.email, u.last_sign_in_at
HAVING count(f.id) = 0;
-- Resultado: 10 usuários sem MFA

-- ============================================================
-- APLICAR (via painel Supabase — não via SQL):
-- ============================================================

/*
Passos para habilitar MFA no painel Supabase:
1. Authentication > Policies > Enable MFA
2. Ou criar regra de auth hook que rejeita login sem MFA

Via SQL (auth hook — TEMPLATE, não testado):
CREATE OR REPLACE FUNCTION auth.hook_mfa_required()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  factor_count int;
BEGIN
  SELECT count(*) INTO factor_count
  FROM auth.mfa_factors
  WHERE user_id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid
    AND status = 'verified';

  IF factor_count = 0 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'MFA obrigatório. Configure um autenticador antes de continuar.'
      )
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;
*/

-- ============================================================
-- ROLLBACK:
-- ============================================================

/*
-- Remover auth hook se criado:
DROP FUNCTION IF EXISTS auth.hook_mfa_required();

-- No painel: Authentication > Policies > Disable MFA
*/