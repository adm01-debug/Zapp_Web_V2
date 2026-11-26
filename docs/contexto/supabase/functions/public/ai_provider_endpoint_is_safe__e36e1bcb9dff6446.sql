CREATE OR REPLACE FUNCTION public.ai_provider_endpoint_is_safe(endpoint text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT endpoint IS NULL OR (
    endpoint ~ '^https://'
    AND position('@' in endpoint) = 0
    AND endpoint !~ '^https://[0-9]'
    AND endpoint !~ '^https://\[[0-9a-fA-F:]+\]'
    -- sem porta explícita (443 é o padrão do https; ":443" também não é aceito aqui)
    AND endpoint !~ '^https://[^/]+:[0-9]+'
    -- sem hostname interno/localhost
    AND endpoint !~* '^https://([^/]*\.)?(localhost|local|internal|lan|home|corp|intranet)([:/]|$)'
  );
$function$
