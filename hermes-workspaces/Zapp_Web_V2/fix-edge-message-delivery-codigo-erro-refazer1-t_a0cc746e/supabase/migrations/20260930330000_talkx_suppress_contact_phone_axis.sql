-- 20260930330000_talkx_suppress_contact_phone_axis
-- Etapa de correção do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 (auditoria adversarial
-- pós-merge, achado V07 phone-axis).
--
-- A RPC talkx_suppress_contact (V07, 20260930160000) só tratava o conflito no eixo
-- contact_id (ON CONFLICT (contact_id) WHERE ... — índice parcial
-- talkx_blacklist_contact_active_unique). Mas existe um segundo índice único parcial,
-- talkx_blacklist_phone_active_unique (V05, WHERE phone IS NOT NULL AND removed_at
-- IS NULL). Quando o mesmo phone (avulso, ou de outro contact_id) já tinha uma
-- supressão ATIVA, o INSERT estourava 23505 cru em vez de retornar NULL (idempotente).
--
-- Fix: ON CONFLICT DO NOTHING sem alvo — cobre QUALQUER violação única, incluindo
-- os dois eixos (contact_id e phone), tornando a supressão idempotente nos dois eixos.
-- Semântica preservada: devolve NULL quando já havia supressão ativa.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION) -> aplicada logo após o merge e o deploy.
-- rollback: restaurar a definição anterior reaplicando o CREATE OR REPLACE FUNCTION da
--           migration 20260930160000_talkx_blacklist_contact_active_unique.sql (V07).

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
  on conflict do nothing
  returning id into v_id;

  return v_id; -- NULL => já havia supressão ATIVA (idempotente, em qualquer eixo)
end;
$fn$;

revoke all on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  from public, anon, authenticated;
grant execute on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  to service_role;
