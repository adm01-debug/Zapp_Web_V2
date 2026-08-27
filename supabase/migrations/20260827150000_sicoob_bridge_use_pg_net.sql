-- A migration 20260827140000 corrigiu a URL mas manteve extensions.http_post,
-- que NAO existe no projeto oficial tnnnlkbymytvtqngbbqh (somente pg_net instalado).
-- Com o vault secret configurado, o trigger quebraria todo INSERT em messages
-- para contatos sicoob_gifts. Troca para net.http_post (pg_net, assincrono):
-- falha de rede na bridge nunca bloqueia a gravacao da mensagem.
-- Aplicada manualmente no projeto oficial em 2026-08-27.
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact_type text;
  v_supabase_url text := 'https://tnnnlkbymytvtqngbbqh.supabase.co';
  v_service_key  text;
BEGIN
  -- Somente mensagens de agentes disparam a bridge
  IF NEW.sender = 'agent' THEN
    SELECT contact_type INTO v_contact_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      -- Le chave do vault (nao expoe no codigo)
      SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name = 'sicoob_service_role_key'
      LIMIT 1;

      IF v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
          body    := jsonb_build_object(
            'contact_id', NEW.contact_id,
            'content',    NEW.content,
            'message_id', NEW.id,
            'agent_id',   NEW.agent_id,
            'created_at', NEW.created_at
          ),
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
