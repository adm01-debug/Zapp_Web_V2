-- mini_game_xp_daily_limit
-- Rollback: REVOKE EXECUTE ON FUNCTION public.credit_agent_mini_game_xp(uuid,text,integer) FROM authenticated, service_role; DROP FUNCTION public.credit_agent_mini_game_xp(uuid,text,integer); REVOKE ALL ON TABLE public.agent_mini_game_xp_daily FROM service_role; DROP TABLE public.agent_mini_game_xp_daily;
--
-- Por que: os mini-games passaram a creditar o XP real da partida (xpEarned) e o
-- credito anterior (add_agent_xp) nao tinha trava antifarm. Esta RPC nova conta
-- partidas creditadas por agente + mini-game + dia e recusa a partir da 6a, com a
-- trava feita por INSERT ... ON CONFLICT DO UPDATE ... WHERE (race-safe).

CREATE TABLE public.agent_mini_game_xp_daily (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id    text NOT NULL,
  dia        date NOT NULL DEFAULT CURRENT_DATE,
  partidas   integer NOT NULL DEFAULT 0,
  xp_total   bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_mini_game_xp_daily_pkey PRIMARY KEY (profile_id, game_id, dia),
  CONSTRAINT agent_mini_game_xp_daily_game_id_check CHECK (game_id IN ('speed-typing', 'quiz', 'response-match', 'emoji-decode')),
  CONSTRAINT agent_mini_game_xp_daily_partidas_check CHECK (partidas >= 0),
  CONSTRAINT agent_mini_game_xp_daily_xp_total_check CHECK (xp_total >= 0)
);

COMMENT ON TABLE public.agent_mini_game_xp_daily IS
  'Contador antifarm: partidas de mini-game que ja creditaram XP por agente, por mini-game e por dia (limite 5). Sem policy de RLS: so as funcoes SECURITY DEFINER e o service_role alcancam.';

ALTER TABLE public.agent_mini_game_xp_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_mini_game_xp_daily FROM anon;
REVOKE ALL ON TABLE public.agent_mini_game_xp_daily FROM authenticated;
REVOKE ALL ON TABLE public.agent_mini_game_xp_daily FROM PUBLIC;
GRANT ALL ON TABLE public.agent_mini_game_xp_daily TO service_role;

CREATE OR REPLACE FUNCTION public.credit_agent_mini_game_xp(
  p_profile_id uuid,
  p_game_id    text,
  p_xp         integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_game_id   text;
  v_row       agent_stats%ROWTYPE;
  v_partidas  integer;
  v_new_xp    bigint;
  v_new_level int;
  v_max       constant integer := 5;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_game_id := lower(btrim(coalesce(p_game_id, '')));
  IF v_game_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'p_game_id invalido: %', p_game_id;
  END IF;
  IF v_game_id NOT IN ('speed-typing', 'quiz', 'response-match', 'emoji-decode') THEN
    RAISE EXCEPTION 'p_game_id desconhecido: %', p_game_id;
  END IF;

  IF p_xp IS NULL OR p_xp < 0 THEN
    RAISE EXCEPTION 'p_xp nao pode ser negativo, got %', p_xp;
  END IF;
  IF p_xp > 500 THEN
    RAISE EXCEPTION 'p_xp exceeds single-call maximum of 500, got %', p_xp;
  END IF;

  -- 0 XP nao credita nada e NAO consome partida do dia.
  IF p_xp = 0 THEN
    SELECT d.partidas INTO v_partidas
      FROM public.agent_mini_game_xp_daily d
     WHERE d.profile_id = p_profile_id AND d.game_id = v_game_id AND d.dia = CURRENT_DATE;
    RETURN json_build_object('credited', false, 'reason', 'zero_xp',
      'partidas', coalesce(v_partidas, 0), 'maxPartidasDia', v_max, 'xpCreditado', 0);
  END IF;

  SELECT * INTO v_row FROM public.agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('credited', false, 'reason', 'sem_stats',
      'partidas', 0, 'maxPartidasDia', v_max, 'xpCreditado', 0);
  END IF;

  -- O INSERT ... ON CONFLICT DO UPDATE ... WHERE e a trava do limite: a linha do dia
  -- fica presa por quem chega primeiro e a segunda chamada so reavalia depois do commit
  -- (nunca credita a 6a partida, mesmo em chamadas concorrentes).
  INSERT INTO public.agent_mini_game_xp_daily (profile_id, game_id, dia, partidas, xp_total)
  VALUES (p_profile_id, v_game_id, CURRENT_DATE, 1, p_xp)
  ON CONFLICT (profile_id, game_id, dia) DO UPDATE
     SET partidas   = agent_mini_game_xp_daily.partidas + 1,
         xp_total   = agent_mini_game_xp_daily.xp_total + p_xp,
         updated_at = now()
   WHERE agent_mini_game_xp_daily.partidas < v_max
  RETURNING partidas INTO v_partidas;

  IF NOT FOUND THEN
    RETURN json_build_object('credited', false, 'reason', 'daily_limit',
      'partidas', v_max, 'maxPartidasDia', v_max, 'xpCreditado', 0,
      'newXp', v_row.xp, 'newLevel', v_row.level,
      'previousLevel', v_row.level, 'leveledUp', false);
  END IF;

  v_new_xp    := v_row.xp + p_xp;
  v_new_level := public.calculate_level(v_new_xp);

  UPDATE public.agent_stats
     SET xp = v_new_xp, level = v_new_level, updated_at = now()
   WHERE profile_id = p_profile_id;

  RETURN json_build_object('credited', true, 'reason', 'ok',
    'partidas', v_partidas, 'maxPartidasDia', v_max, 'xpCreditado', p_xp,
    'newXp', v_new_xp, 'newLevel', v_new_level,
    'previousLevel', v_row.level, 'leveledUp', v_new_level > v_row.level);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.credit_agent_mini_game_xp(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_agent_mini_game_xp(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_agent_mini_game_xp(uuid, text, integer)
  TO authenticated, service_role;
