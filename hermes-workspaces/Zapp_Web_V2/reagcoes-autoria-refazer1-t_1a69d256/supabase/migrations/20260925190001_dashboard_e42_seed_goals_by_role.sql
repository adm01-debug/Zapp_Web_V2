-- Reconciliacao (2026-09-25): DDL ja aplicado ao vivo em producao (registro
-- 20260925190001 em supabase_migrations.schema_migrations) antes de existir
-- arquivo de migration versionado. Corpo SQL abaixo e copia exata das
-- statements do ledger (nao alterado) — canonicamente identico ao que ja
-- roda no banco oficial.

CREATE OR REPLACE FUNCTION public.seed_default_goals_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.goals_configurations (profile_id, goal_type, daily_target, weekly_target, monthly_target, is_active)
  VALUES
    (NEW.id, 'messages_sent',
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 10 ELSE 50 END,
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 50 ELSE 250 END,
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 200 ELSE 1000 END,
      true),
    (NEW.id, 'contacts_handled',
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 3 ELSE 10 END,
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 15 ELSE 50 END,
      CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 60 ELSE 200 END,
      true),
    (NEW.id, 'resolution_rate', 80, 80, 85, true)
  ON CONFLICT (profile_id, goal_type) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_profile_created_seed_goals
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_goals_for_profile();

INSERT INTO public.goals_configurations (profile_id, goal_type, daily_target, weekly_target, monthly_target, is_active)
SELECT p.id, gt.goal_type,
  CASE
    WHEN gt.goal_type = 'resolution_rate' THEN 80
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'messages_sent' THEN 10
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'contacts_handled' THEN 3
    WHEN gt.goal_type = 'messages_sent' THEN 50
    WHEN gt.goal_type = 'contacts_handled' THEN 10
  END AS daily_target,
  CASE
    WHEN gt.goal_type = 'resolution_rate' THEN 80
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'messages_sent' THEN 50
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'contacts_handled' THEN 15
    WHEN gt.goal_type = 'messages_sent' THEN 250
    WHEN gt.goal_type = 'contacts_handled' THEN 50
  END AS weekly_target,
  CASE
    WHEN gt.goal_type = 'resolution_rate' THEN 85
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'messages_sent' THEN 200
    WHEN p.role IN ('admin', 'supervisor') AND gt.goal_type = 'contacts_handled' THEN 60
    WHEN gt.goal_type = 'messages_sent' THEN 1000
    WHEN gt.goal_type = 'contacts_handled' THEN 200
  END AS monthly_target,
  true
FROM public.profiles p
CROSS JOIN (VALUES ('messages_sent'), ('contacts_handled'), ('resolution_rate')) AS gt(goal_type)
ON CONFLICT (profile_id, goal_type) DO NOTHING;
