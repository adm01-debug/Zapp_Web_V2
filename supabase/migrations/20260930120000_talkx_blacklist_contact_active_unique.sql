-- 20260930120000_talkx_blacklist_contact_active_unique
-- Etapa V07 do docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md (P2-1).
--
-- Hoje a unicidade de contact_id e TOTAL (talkx_blacklist_contact_id_key UNIQUE(contact_id)).
-- Com o soft-delete (removed_at), o mesmo contato NAO pode ser re-suprimido depois de removido:
-- o insert leva 23505 e vira console.warn no webhook de opt-out (evolution-webhook-messages.ts).
-- A V07 troca por unicidade apenas entre as linhas ATIVAS, espelhando o que a V05 fez em phone
-- (talkx_blacklist_phone_active_unique, WHERE phone IS NOT NULL AND removed_at IS NULL).
--
-- PostgREST NAO consegue emitir ON CONFLICT (contact_id) WHERE removed_at IS NULL
-- (postgrest#2123: o supabase-js so aceita on_conflict sem predicado e o planner devolve 42P10
-- contra indice parcial). Por isso a escrita idempotente do webhook passa por uma RPC
-- SECURITY DEFINER (unica via que consegue casar o alvo de conflito parcial e ficar atomica).
--
-- Classe: contrato (drop constraint + add indice + funcao). Aplicar depois do merge/deploy.
-- Idempotente/replayavel: drop-if-exists + create-if-not-exists + create-or-replace.
-- Dado em risco: nenhum (tabela tem 0 linhas em producao, medido 2026-09-30).

alter table public.talkx_blacklist
  drop constraint if exists talkx_blacklist_contact_id_key;
-- rede de seguranca: apos o DROP CONSTRAINT o indice de suporte ja sumiu; este e no-op
drop index if exists public.talkx_blacklist_contact_id_key;

create unique index if not exists talkx_blacklist_contact_active_unique
  on public.talkx_blacklist using btree (contact_id)
  where ((contact_id is not null) and (removed_at is null));

-- ---------------------------------------------------------------------------
-- RPC: escrita idempotente de supressao do webhook de opt-out (E57/E59).
-- Devolve o id do registro criado, ou NULL quando ja havia supressao ATIVA
-- (o que deixa o chamador decidir se envia a confirmacao de novo ou nao).
-- ---------------------------------------------------------------------------
create or replace function public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code public.talkx_blacklist_reason,
  p_origin text,
  p_source_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  insert into public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id)
  values
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id)
  on conflict (contact_id) where ((contact_id is not null) and (removed_at is null)) do nothing
  returning id into v_id;

  return v_id; -- NULL => ja havia supressao ATIVA (idempotente)
end;
$fn$;

revoke all on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  from public, anon, authenticated;
grant execute on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  to service_role;
