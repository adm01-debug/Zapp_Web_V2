-- whisper_mark_read_policy
-- Rollback: dropa a policy "Users can mark own whisper messages as read" e desfaz o recorte de coluna em public.whisper_messages, devolvendo ao papel authenticated o privilegio de UPDATE como estava (nivel de TABELA, herdado do grant padrao do Supabase) — sem policy de UPDATE nenhuma, o estado de antes.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Users can mark own whisper messages as read" ON public.whisper_messages;
--   REVOKE UPDATE (is_read) ON public.whisper_messages FROM authenticated;
--   GRANT UPDATE ON public.whisper_messages TO authenticated;
--
-- PROBLEMA (cartao t_2bfa2617)
-- `whisper_messages.is_read` nunca sai de false. O front (WhisperMode.tsx, "Mark as
-- read when viewing") faz exatamente `.update({ is_read: true }).eq('contact_id', X)
-- .eq('is_read', false)`, mas a tabela nao tem NENHUMA policy de UPDATE: a policy
-- "Authenticated users can manage whisper_messages" (FOR ALL) foi DROPada pela
-- migration 20260317222442, que recriou so INSERT/SELECT/DELETE. Com RLS ligada e
-- sem policy de UPDATE, o PostgREST devolve 200 com 0 linhas e nenhum erro — o
-- contador de nao lidas (useWhisperCount) fica cravado para sempre.
--
-- CORRECAO (so DDL/RLS; nao toca dado, nao mexe em gatilho, nao afrouxa nada)
-- 1) Policy de UPDATE para o papel authenticated, restrita a QUEM A MENSAGEM E
--    DIRIGIDA: target_agent_id = public.current_profile_id(). O remetente (que ja
--    pode LER a propria mensagem pela policy de SELECT) e os demais agentes NAO
--    entram; nao existe ramo para admin/supervisor (o is_read e leitura pessoal de
--    quem recebeu).
-- 2) Recorte de coluna: REVOKE UPDATE na tabela + GRANT UPDATE (is_read) apenas.
--    Policy RLS nao sabe dizer QUAL COLUNA muda; sem isso o destinatario poderia
--    reescrever `content`, `sender_id`, `contact_id` ou `created_at` do sussurro
--    (usando o UPDATE novo como caminho de edicao). Hoje ninguem consegue esse
--    UPDATE (nao ha policy), entao o REVOKE nao tira de ninguem nada que funcione.
--    `anon` fica como esta (a policy e TO authenticated; sem policy, o anon segue
--    barrado pela RLS).
-- Efeitos colaterais conferidos: nao ha gatilho em public.whisper_messages
-- (nenhuma coluna updated_at na tabela); a operacao e uma transacao so; a tabela
-- esta na publicacao supabase_realtime, mas o UPDATE nao muda a visibilidade de
-- ninguem alem do proprio destinatario (a policy de SELECT continua a mesma).

DROP POLICY IF EXISTS "Users can mark own whisper messages as read" ON public.whisper_messages;
CREATE POLICY "Users can mark own whisper messages as read" ON public.whisper_messages
  FOR UPDATE TO authenticated
  USING (target_agent_id = public.current_profile_id())
  WITH CHECK (target_agent_id = public.current_profile_id());

REVOKE UPDATE ON public.whisper_messages FROM authenticated;
GRANT UPDATE (is_read) ON public.whisper_messages TO authenticated;
