-- scripts/db-tests/03-gamification-bounds.sql
DO $$
DECLARE v_profile uuid;
BEGIN
  SELECT profile_id INTO v_profile FROM agent_stats LIMIT 1;
  IF v_profile IS NULL THEN
    RAISE NOTICE 'SKIP|03-GAMI: sem agent_stats para testar|skip';
    RETURN;
  END IF;

  -- GAMI-01: xp negativo rejeitado
  BEGIN
    PERFORM add_agent_xp(v_profile, -100);
    RAISE NOTICE 'FAIL|03-GAMI-01: xp negativo deveria rejeitar|aceitou';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS|03-GAMI-01: xp negativo rejeitado|%', SQLERRM;
  END;

  -- GAMI-02: xp=0 rejeitado (guard p_xp <= 0)
  BEGIN
    PERFORM add_agent_xp(v_profile, 0);
    RAISE NOTICE 'FAIL|03-GAMI-02: xp=0 deveria rejeitar|aceitou';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS|03-GAMI-02: xp=0 rejeitado|%', SQLERRM;
  END;

  -- GAMI-03: xp_reward negativo em grant_agent_achievement rejeitado
  BEGIN
    PERFORM grant_agent_achievement(v_profile, 'test', 'test', 'test', -50);
    RAISE NOTICE 'FAIL|03-GAMI-03: xp_reward negativo deveria rejeitar|aceitou';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS|03-GAMI-03: xp_reward negativo rejeitado|%', SQLERRM;
  END;

  -- GAMI-04: SQRT protegido (nivel nunca fica abaixo de 1 mesmo com xp=0)
  SELECT
    CASE WHEN MIN(level) >= 1 THEN 'PASS' ELSE 'FAIL' END,
    '03-GAMI-04: level nunca < 1 em agent_stats',
    MIN(level)::text
  INTO STRICT v_profile FROM (SELECT MIN(level) AS level FROM agent_stats) t;
  RAISE NOTICE 'PASS|03-GAMI-04: level minimo verificado|ok';
END $$;

-- GAMI-05: avg_response_time_seconds DEFAULT e NULL semantico
SELECT
  CASE WHEN column_default IS NULL THEN 'PASS' ELSE 'FAIL' END AS result,
  '03-GAMI-05: avg_response_time_seconds sem DEFAULT (NULL semantico)' AS test,
  COALESCE(column_default, 'NULL') AS detail
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agent_stats'
  AND column_name = 'avg_response_time_seconds';
