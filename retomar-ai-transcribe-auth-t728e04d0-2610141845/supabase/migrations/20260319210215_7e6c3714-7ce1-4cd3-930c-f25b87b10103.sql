
-- [2026-08-28] Auditoria de refs de banco: o fallback de URL desta funcao
-- apontava para um banco antigo do projeto e foi corrigido retroativamente para
-- o banco oficial (tnnnlkbymytvtqngbbqh). Historico no header de 20260827140000;
-- estado vigente da funcao: 20260827150000.
-- Ver docs/audits/AUDITORIA_REFERENCIAS_DB_2026-08-28.md.

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to notify Sicoob when agent replies to internal_chat contacts
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_type text;
  v_channel_type text;
  v_supabase_url text;
BEGIN
  -- Only process agent messages on internal_chat channel
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    -- Verify the contact is sicoob_gifts type
    SELECT contact_type, channel_type INTO v_contact_type, v_channel_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      -- Get supabase URL for edge function call
      v_supabase_url := current_setting('app.settings.supabase_url', true);
      
      IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://tnnnlkbymytvtqngbbqh.supabase.co';
      END IF;

      -- Call the sicoob-bridge-reply edge function via pg_net
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

-- Create trigger on messages table
DROP TRIGGER IF EXISTS trg_sicoob_reply ON public.messages;
CREATE TRIGGER trg_sicoob_reply
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_sicoob_on_reply();
