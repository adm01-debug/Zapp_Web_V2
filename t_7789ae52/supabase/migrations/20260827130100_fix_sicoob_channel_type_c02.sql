-- Fix C-02: notify_sicoob_on_reply verificava channel_type='internal_chat'
-- que NUNCA ocorre no banco (todos os 219 msgs têm channel_type='whatsapp').
-- Condição removida. Bridge dispara para sender='agent' + contact_type='sicoob_gifts'.
-- Vault: lê 'sicoob_service_role_key' com guard de NULL.
-- TODO: configurar vault secret 'sicoob_service_role_key' para ativar envio HTTP.
-- [2026-08-28] Auditoria de refs de banco: a URL default desta funcao apontava
-- para um banco antigo do projeto e foi corrigida retroativamente para o banco
-- oficial (tnnnlkbymytvtqngbbqh). Historico no header de 20260827140000; estado
-- vigente da funcao: 20260827150000.
-- Ver docs/audits/AUDITORIA_REFERENCIAS_DB_2026-08-28.md.
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
      -- Lê chave do vault (não expõe no código)
      SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name = 'sicoob_service_role_key'
      LIMIT 1;

      IF v_service_key IS NOT NULL THEN
        PERFORM extensions.http_post(
          url     := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
          body    := jsonb_build_object(
            'contact_id', NEW.contact_id,
            'content',    NEW.content,
            'message_id', NEW.id,
            'agent_id',   NEW.agent_id,
            'created_at', NEW.created_at
          )::text,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          )::jsonb
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
