
-- [2026-08-28] Auditoria de refs de banco: a URL desta funcao apontava para um
-- banco antigo do projeto e foi corrigida retroativamente para o banco oficial
-- (tnnnlkbymytvtqngbbqh). Historico no header de 20260827140000; estado vigente
-- da funcao: 20260827150000.
-- Ver docs/audits/AUDITORIA_REFERENCIAS_DB_2026-08-28.md.

-- Fix search_path for the notify function
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_type text;
  v_supabase_url text;
BEGIN
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    SELECT contact_type INTO v_contact_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      v_supabase_url := 'https://tnnnlkbymytvtqngbbqh.supabase.co';

      PERFORM extensions.http_post(
        url := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
        body := jsonb_build_object(
          'contact_id', NEW.contact_id,
          'content', NEW.content,
          'message_id', NEW.id,
          'agent_id', NEW.agent_id,
          'created_at', NEW.created_at
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
