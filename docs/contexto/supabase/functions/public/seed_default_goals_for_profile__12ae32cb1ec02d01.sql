CREATE OR REPLACE FUNCTION public.seed_default_goals_for_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
