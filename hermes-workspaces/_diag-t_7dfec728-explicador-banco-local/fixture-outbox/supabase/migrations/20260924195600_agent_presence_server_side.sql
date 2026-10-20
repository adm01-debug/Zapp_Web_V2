-- Substitui a presença client-driven (canal Realtime "agents-presence",
-- onde cada navegador anunciava o próprio status sem nenhuma validação do
-- servidor) por uma tabela server-authoritative. Motivo: o modelo antigo
-- permitia qualquer agente autenticado publicar status ("online"/"away"/
-- "offline") sob a `key` de QUALQUER outro user_id no canal de presença --
-- Realtime Authorization (RLS em realtime.messages) não enxerga o conteúdo
-- do payload de presence, só controla quem entra no canal, então não dava
-- pra travar isso com uma policy. Com uma tabela normal, RLS comum resolve:
-- cada agente só escreve a própria linha (user_id = auth.uid()).
--
-- "offline" continua existindo como escolha explícita do usuário (ocultar
-- status), mas também é inferido no cliente quando o heartbeat (upsert
-- periódico de updated_at) para de chegar -- ver src/hooks/crm/useAgentPresence.ts.

CREATE TABLE IF NOT EXISTS public.agent_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all presence"
  ON public.agent_presence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own presence"
  ON public.agent_presence FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own presence"
  ON public.agent_presence FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_presence;
