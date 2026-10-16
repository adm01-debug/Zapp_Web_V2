-- whisper_mark_read_policy
-- Rollback: dropa o gatilho e a funcao whisper_messages_somente_is_read, dropa a policy "Users can mark own whisper messages as read" e devolve ao papel authenticated o UPDATE de TABELA (o recorte de coluna sai junto) — sem policy de UPDATE nenhuma, o estado de antes.
-- Rollback (SQL executavel, na ordem):
--   DROP TRIGGER IF EXISTS whisper_messages_somente_is_read ON public.whisper_messages;
--   DROP FUNCTION IF EXISTS public.whisper_messages_somente_is_read();
--   DROP POLICY IF EXISTS "Users can mark own whisper messages as read" ON public.whisper_messages;
--   REVOKE UPDATE (is_read) ON public.whisper_messages FROM authenticated;
--   GRANT UPDATE ON public.whisper_messages TO authenticated;
--
-- PROBLEMA (cartao t_1c2e589e, achado L5 da paridade 11)
-- `whisper_messages.is_read` nunca sai de false. O front (WhisperMode.tsx, "marca
-- como lido ao abrir") faz `.update({ is_read: true }).eq('contact_id', X)
-- .eq('is_read', false)` — sem `target_agent_id` — e a tabela NAO tem policy de
-- UPDATE: a policy FOR ALL original ("Authenticated users can manage
-- whisper_messages") foi derrubada pela 20260317222442, que recriou so
-- INSERT/SELECT/DELETE. Com RLS ligada e sem policy de UPDATE, o PostgREST
-- responde 200 com 0 linhas e nenhum erro: a leitura nunca e gravada e o selo de
-- nao lido (useWhisperCount) fica cravado.
--
-- O QUE ESTA MIGRATION FAZ (so DDL/RLS: nao toca dado, nao afrouxa nada)
-- 1) Policy de UPDATE para `authenticated` restrita a QUEM A MENSAGEM E DIRIGIDA:
--    `target_agent_id = public.current_profile_id()` no USING e no WITH CHECK.
--    Remetente, terceiro e admin que nao seja o destinatario NAO entram (o
--    is_read e leitura pessoal de quem recebeu; nao ha ramo administrativo).
-- 2) Recorte de coluna: REVOKE do UPDATE de tabela em `authenticated` + GRANT do
--    UPDATE apenas de `is_read`. Sem isso o UPDATE novo funcionaria como caminho
--    de edicao (a policy RLS nao sabe dizer QUAL coluna mudou). Hoje nenhum
--    UPDATE autenticado funciona, entao o REVOKE nao tira de ninguem nada que
--    estivesse em uso; `anon` segue barrado pela propria ausencia de policy.
-- 3) Gatilho BEFORE UPDATE que recusa qualquer coluna que nao seja `is_read`,
--    comparando `to_jsonb(OLD)` com `to_jsonb(NEW)` sem a coluna. Serve para os
--    papeis que passam POR CIMA da RLS (service_role) ou que tem UPDATE de tabela:
--    sem ele, o congelamento das outras colunas dependeria so do privilegio.
--    A funcao compara o registro inteiro, entao coluna nova no futuro ja entra
--    barrada, sem precisar mexer aqui.
--
-- EFEITOS COLATERAIS CONFERIDOS
-- - `public.whisper_messages` nao tem coluna `updated_at` nem outro gatilho de
--   UPDATE (conferido no banco local), entao o gatilho novo nao reescreve data
--   nenhuma e nao concorre com gatilho existente.
-- - Tudo roda em uma transacao (BEGIN/COMMIT do hermes-db-migrar): falhou, nada
--   ficou aplicado.
-- - Nenhum GRANT/papel fora do pedido: so `authenticated` (na tabela e na coluna)
--   e o EXECUTE da funcao nova. `anon` e `service_role` ficam como estavam.
-- - A funcao nasce com `SET search_path = public, pg_temp` e sem EXECUTE para
--   PUBLIC/anon/authenticated (gatilho nao exige EXECUTE do papel que dispara).
-- - A tabela esta na publicacao supabase_realtime, mas o UPDATE nao muda a
--   visibilidade de ninguem alem do proprio destinatario (SELECT intacto).

DROP POLICY IF EXISTS "Users can mark own whisper messages as read" ON public.whisper_messages;
CREATE POLICY "Users can mark own whisper messages as read" ON public.whisper_messages
  FOR UPDATE TO authenticated
  USING (target_agent_id = public.current_profile_id())
  WITH CHECK (target_agent_id = public.current_profile_id());

REVOKE UPDATE ON public.whisper_messages FROM authenticated;
GRANT UPDATE (is_read) ON public.whisper_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.whisper_messages_somente_is_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (to_jsonb(OLD) - 'is_read') IS DISTINCT FROM (to_jsonb(NEW) - 'is_read') THEN
    RAISE EXCEPTION 'whisper_messages: so a coluna is_read pode ser alterada'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.whisper_messages_somente_is_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whisper_messages_somente_is_read() FROM anon;
REVOKE ALL ON FUNCTION public.whisper_messages_somente_is_read() FROM authenticated;

DROP TRIGGER IF EXISTS whisper_messages_somente_is_read ON public.whisper_messages;
CREATE TRIGGER whisper_messages_somente_is_read
  BEFORE UPDATE ON public.whisper_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.whisper_messages_somente_is_read();
