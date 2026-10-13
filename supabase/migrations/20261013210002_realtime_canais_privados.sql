-- realtime_canais_privados
-- Rollback: dropa as duas policies criadas em realtime.messages e a função public.can_access_realtime_topic(text); nada mais é tocado (nenhum grant de tabela, nenhum dado, nenhuma tabela nova).
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "realtime_topic_select_autorizado" on realtime.messages;
--   drop policy if exists "realtime_topic_insert_autorizado" on realtime.messages;
--   drop function if exists public.can_access_realtime_topic(text);
--
-- R2 / paridade V3->V2 (auditoria 2026-10-12): os canais Broadcast/Presence
-- `typing:<contactId>` (useTypingPresence), `conversation:<contactId>`
-- (ViewersIndicator) e `team-typing-*` / `team-presence-*` (chat de equipe)
-- ainda NÃO são privados, e o banco real não tinha NENHUMA policy em
-- realtime.messages. Enquanto o canal for público a Realtime não consulta RLS;
-- esta migration prepara a autorização por tópico (o front passa a marcar os
-- canais como `private: true` na trilha de telas/hooks — PD-69/PD-70).
--
-- Regra única: o tópico nomeia o contato ou a conversa de equipe; só acessa
-- quem já pode ver aquilo pela RLS normal do banco:
--   typing:<uuid>        -> is_contact_visible_to_user(uuid, auth.uid())
--   conversation:<uuid>  -> is_contact_visible_to_user(uuid, auth.uid())
--   team-typing-<uuid>   -> is_team_conversation_member(auth.uid(), uuid)
--   team-presence-<uuid> -> is_team_conversation_member(auth.uid(), uuid)
-- Qualquer outro tópico, tópico vazio ou id malformado: NEGA (sem erro — a
-- resposta é sempre a mesma, para não virar oráculo de enumeração).
-- service_role tem BYPASSRLS: o webhook (evolution-webhook-handlers) segue
-- enviando sem depender destas policies.

create or replace function public.can_access_realtime_topic(_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then
      false
    when _topic ~ '^typing:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or _topic ~ '^conversation:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.is_contact_visible_to_user(
        substring(_topic from '[0-9a-fA-F-]{36}$')::uuid,
        auth.uid()
      )
    when _topic ~ '^team-(typing|presence)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.is_team_conversation_member(
        auth.uid(),
        substring(_topic from '[0-9a-fA-F-]{36}$')::uuid
      )
    else
      false
  end;
$$;

revoke all on function public.can_access_realtime_topic(text) from public, anon;
grant execute on function public.can_access_realtime_topic(text) to authenticated, service_role;

-- Assinar/receber (SELECT) e enviar broadcast (INSERT) só valem para o tópico
-- que o usuário autenticado pode acessar. A checagem usa `realtime.topic()`
-- (o tópico da assinatura, injetado pela Realtime) E a coluna `topic` da
-- linha: a primeira fecha a assinatura, a segunda garante que a linha
-- entregue/gravada pertence a um tópico acessível. anon não entra em nenhuma
-- policy: fica negado por padrão. As policies somam por OR, mas cada uma
-- cobre um comando diferente (SELECT x INSERT), então não há furo por combinação.
drop policy if exists "realtime_topic_select_autorizado" on realtime.messages;
create policy "realtime_topic_select_autorizado"
  on realtime.messages
  for select
  to authenticated
  using (
    public.can_access_realtime_topic(realtime.topic())
    and public.can_access_realtime_topic(topic)
  );

drop policy if exists "realtime_topic_insert_autorizado" on realtime.messages;
create policy "realtime_topic_insert_autorizado"
  on realtime.messages
  for insert
  to authenticated
  with check (
    public.can_access_realtime_topic(realtime.topic())
    and public.can_access_realtime_topic(topic)
  );
