-- connection_alert_preferences
-- Rollback: remove a tabela de preferencias de alerta de conexao (RLS, policies, grants e gatilho caem com ela).
-- Rollback (SQL executavel, na ordem):
--   DROP TRIGGER IF EXISTS set_connection_alert_preferences_updated_at ON public.connection_alert_preferences;
--   DROP TABLE IF EXISTS public.connection_alert_preferences;
--
-- wave/connection-alert-preferences: preferencias, POR USUARIO, de como e quando
-- avisar sobre a saude da conexao de WhatsApp do atendimento:
--   * canais  -> push_enabled (notificacao no navegador) e email_enabled (e-mail);
--   * tipos   -> alert_on_degraded (conexao degradada) e alert_on_disconnected (conexao caida);
--   * padroes -> todos LIGADOS (true), para o usuario receber os avisos sem configurar nada.
--
-- Uma linha por usuario (UNIQUE em user_id): o hook do front faz upsert em
-- onConflict=user_id. Leitura e escrita so da PROPRIA linha; DELETE nao e concedido
-- (preferencia nao se apaga, se desliga). Toda a autorizacao vive na RLS, nao em
-- funcao SECURITY DEFINER.
--
-- Tabela NOVA e aditiva: nada existente e alterado. Rollback acima e executavel.

SET search_path = public;

CREATE TABLE public.connection_alert_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  alert_on_degraded boolean NOT NULL DEFAULT true,
  alert_on_disconnected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_alert_preferences_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.connection_alert_preferences IS
  'Preferencias por usuario de alerta de conexao (canais: navegador/e-mail; tipos: degradada/desconectada). Uma linha por usuario; RLS por linha; sem DELETE.';

ALTER TABLE public.connection_alert_preferences ENABLE ROW LEVEL SECURITY;

-- Leitura da propria linha.
CREATE POLICY connection_alert_preferences_select_own
  ON public.connection_alert_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Insercao so da propria linha.
CREATE POLICY connection_alert_preferences_insert_own
  ON public.connection_alert_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Atualizacao so da propria linha (USING filtra o alvo, WITH CHECK impede trocar o dono).
CREATE POLICY connection_alert_preferences_update_own
  ON public.connection_alert_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Sem policy de DELETE de proposito: preferencia se desliga, nunca se apaga.

-- Grants explicitos: o padrao da Supabase concede ALL a anon/authenticated em tabela
-- nova (licao E44), entao revoga tudo e devolve so o necessario.
REVOKE ALL ON public.connection_alert_preferences FROM anon;
REVOKE ALL ON public.connection_alert_preferences FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.connection_alert_preferences TO authenticated;
GRANT ALL ON public.connection_alert_preferences TO service_role;

-- updated_at automatico (reusa a funcao canonica do projeto).
CREATE TRIGGER set_connection_alert_preferences_updated_at
  BEFORE UPDATE ON public.connection_alert_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
