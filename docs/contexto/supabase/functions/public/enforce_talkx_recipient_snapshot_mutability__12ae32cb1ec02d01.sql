CREATE OR REPLACE FUNCTION public.enforce_talkx_recipient_snapshot_mutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- MAPA: dispensado só quem NÃO é o ator `authenticated`, pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- MAPA: sessão `authenticated` sem a claim do JWT não é "livre" — nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'talkx_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A partir daqui: authenticated com claim. O guard do snapshot vale.
  IF current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    -- O pai não fica mais visível durante um ON DELETE CASCADE. Permite essa única ação
    -- referencial; delete direto de destinatário ainda acha o pai e é rejeitado.
    IF TG_OP = 'DELETE'
       AND NOT EXISTS (
         SELECT 1 FROM public.talkx_campaigns
         WHERE id = OLD.campaign_id
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'talkx_recipient_snapshot_required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
