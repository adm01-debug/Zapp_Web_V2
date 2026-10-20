-- Fix search_path for calculate_level function
CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$$;