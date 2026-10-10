-- ledger-divergence/version-collision: ancora para excecao de 20260927450000.
-- O SQL abaixo e idempotente e replica o conteudo do ledger de 20260927450000
-- (gamification_guard_fix_xp_cap). Ja aplicado em producao via MCP em 2026-09-27.
CREATE OR REPLACE FUNCTION public.add_agent_xp(p_profile_id uuid, p_xp integer)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row       agent_stats%ROWTYPE;
  v_new_xp    int;
  v_new_level int;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_xp <= 0 THEN
    RAISE EXCEPTION 'p_xp must be a positive integer, got %', p_xp;
  END IF;
  IF p_xp > 500 THEN
    RAISE EXCEPTION 'p_xp exceeds single-call maximum of 500, got %', p_xp;
  END IF;
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_new_xp := v_row.xp + p_xp;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);
  UPDATE agent_stats SET xp = v_new_xp, level = v_new_level, updated_at = now()
  WHERE profile_id = p_profile_id;
  RETURN json_build_object('newXp', v_new_xp, 'newLevel', v_new_level,
    'previousLevel', v_row.level, 'leveledUp', v_new_level > v_row.level);
END;
$$;
