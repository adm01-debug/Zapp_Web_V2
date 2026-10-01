-- ai_block03_pr1_drop_defaults_sentiment
-- versão 20260930500000 reservada para hermes-ia-bloco-03-pr1-mascaras-acl-26100108352104 em 2026-10-01T08:35:39-03:00 (hermes-db-migrar --nova)
-- Classe: contrato. Remove os defaults que mascaravam ausencia em conversation_analyses (sentiment/urgency),
-- torna sentiment nullable e para de fabricar neutral no trigger de CRM e no produtor crm-integration.
-- rollback: alter table public.conversation_analyses alter column urgency set default 'media';
--           alter table public.conversation_analyses alter column sentiment set default 'neutro';
--           alter table public.conversation_analyses alter column sentiment set not null;  -- FALHA se houver NULL legitimo
--           create or replace function public.enqueue_crm_sync_from_closure() com o corpo anterior (no corpo do PR).

-- ============================================================================
-- Bloco 03 do plano de IA — PR-1 · MIGRATION A (correcao de mascara)
-- Versao reservada via hermes-db-migrar --nova=<nome>. Classe: contrato
-- (ALTER COLUMN ... DROP DEFAULT / DROP NOT NULL + CREATE OR REPLACE FUNCTION).
--
-- DEFEITO QUE ELA FECHA: os defaults e o trigger FABRICAM dado que ninguem mediu.
--   * conversation_analyses.sentiment  DEFAULT 'neutro' + NOT NULL
--     -> INSERT que omite o campo vira "sentimento neutro" (afirmacao falsa);
--        e o NOT NULL proibe a UNICA representacao honesta da ausencia (NULL).
--   * conversation_analyses.urgency    DEFAULT 'media'   -> idem, "urgencia media".
--   * enqueue_crm_sync_from_closure()  COALESCE(ai_sentiment,'neutral')
--     -> ausencia de sentimento vira o valor inventado 'neutral' (vocabulario EN
--        ja extinto) no payload ao CRM externo, indistinguivel de "mediu e deu neutro".
--   * crm-integration/index.ts:171     payload.sentiment || 'neutral'
--     -> mesma fabricacao no produtor Edge (correcao em arquivo .ts, no mesmo PR).
--
-- NAO PERDE DADO: nenhum INSERT/UPDATE/DELETE. Remove default, afrouxa NOT NULL
-- e troca o corpo de uma funcao. Linhas existentes ficam byte a byte iguais.
--
-- IDEMPOTENTE: DROP DEFAULT / DROP NOT NULL sao no-op quando ja aplicados;
-- CREATE OR REPLACE FUNCTION substitui o corpo. Aplicar 2x nao quebra.
--
-- ROLLBACK: devolver defaults + NOT NULL + o corpo antigo do trigger. ATENCAO:
-- `set not null` so passa se NAO existir nenhuma linha com sentiment NULL —
-- ou seja, o rollback deixa de ser cego depois que o novo comportamento gera
-- linhas legitimamente nulas. Ver 2026..._rollback_migration_a.sql.
-- ============================================================================

-- ── (1) sentiment deixa de inventar 'neutro' ────────────────────────────────
alter table public.conversation_analyses alter column sentiment drop default;

-- ── (2) sentiment passa a aceitar a ausencia (NULL) ─────────────────────────
alter table public.conversation_analyses alter column sentiment drop not null;

-- ── (3) urgency deixa de inventar 'media' ───────────────────────────────────
alter table public.conversation_analyses alter column urgency drop default;

-- ── (4) o trigger do CRM deixa de inventar 'neutral' ────────────────────────
-- Unica mudanca de comportamento: 'sentiment' recebe o valor REAL da coluna.
--   * contato com ai_sentiment preenchido -> o valor canonico segue no payload;
--   * contato com ai_sentiment NULL       -> NULL, e jsonb_strip_nulls REMOVE a
--     chave 'sentiment' (ausencia viaja como chave ausente, nunca como token);
--   * contato inexistente                 -> nao ha payload (RETURN NEW cedo).
create or replace function public.enqueue_crm_sync_from_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_contact public.contacts%rowtype;
  v_phone text;
  v_phone_valid boolean;
begin
  select * into v_contact from public.contacts where id = NEW.contact_id;
  if not found then return NEW; end if;

  v_phone := regexp_replace(coalesce(v_contact.phone, ''), '[^0-9]', '', 'g');
  v_phone_valid := length(v_phone) between 8 and 15;

  insert into public.crm_sync_outbox (
    closure_id, contact_id, idempotency_key, normalized_phone, payload,
    status, last_error_code
  ) values (
    NEW.id,
    NEW.contact_id,
    'closure:' || NEW.id::text,
    case when v_phone_valid then v_phone else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'channel', coalesce(v_contact.channel_type, 'whatsapp'),
      'direction', 'inbound',
      'assunto', left('Conversa encerrada - ' || v_contact.name, 300),
      'resumo', left(coalesce(NEW.notes, NEW.close_reason), 2000),
      -- Ausencia e ausencia: nada e inventado na fronteira com o CRM.
      'sentiment', v_contact.ai_sentiment,
      'zapp_conversation_id', NEW.id::text
    )),
    case when v_phone_valid then 'pending' else 'dead_letter' end,
    case when v_phone_valid then null else 'INVALID_PHONE' end
  ) on conflict (closure_id) do nothing;
  return NEW;
end;
$function$;

revoke all on function public.enqueue_crm_sync_from_closure() from public;

-- ============================================================================
-- CORRECAO NO MESMO PR, FORA DESTE ARQUIVO SQL (.ts):
-- supabase/functions/crm-integration/index.ts:171
--   -  p_sentiment: payload.sentiment || 'neutral',
--   +  p_sentiment: typeof payload.sentiment === 'string' ? payload.sentiment : null,
-- (o operador || trata string vazia como ausencia e inventa token; ?? resolve so
--  null/undefined; typeof garante que so string entra no contrato externo).
-- ============================================================================
