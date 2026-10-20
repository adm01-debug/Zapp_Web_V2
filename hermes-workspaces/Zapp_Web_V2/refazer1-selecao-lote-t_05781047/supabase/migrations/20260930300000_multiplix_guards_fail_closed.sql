-- multiplix_guards_fail_closed
-- versão 20260930300000 reservada para hermes-multiplix-guards-fail-closed-26093014476657 em 2026-09-30T14:47:14-03:00 (hermes-db-migrar --nova)
--
-- rollback: o caminho de volta e REAPLICAR os dois corpos integros de supabase/migrations/20260929590000_multiplix_mutability_guard.sql
-- rollback: (o defeito #1267 esta so no predicado do topo daquela versao: `IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;`).
-- rollback: nao cabe SQL curto aqui: os corpos tem ~130 linhas no total e reescreve-los de memoria criaria uma terceira versao divergente dos guards.
--
-- #1267 (MÉDIO, dono: módulo Multiplix) — guards FAIL-OPEN por GUC.
--
-- Os dois guards de mutabilidade da Multiplix (`enforce_multiplix_dispatch_mutability`,
-- `enforce_multiplix_recipient_mutability`) começavam por:
--
--     IF COALESCE(auth.role(), '') <> 'authenticated' THEN
--       RETURN COALESCE(NEW, OLD);          -- passa a linha
--     END IF;
--
-- A intenção é "o guard só vale para o ator `authenticated`; service_role (worker, RPCs do motor,
-- pg_cron) e o dono postgres escrevem livremente" (ver o comentário de 20260929590000). O problema é
-- que `auth.role()` lê a GUC do JWT: **sem a GUC o COALESCE vira `''`**, `'' <> 'authenticated'` é
-- verdadeiro e a guarda **desaparece sem erro nenhum** — fail-open. Quem chega à tabela numa sessão com
-- o papel `authenticated` mas sem a claim (caminho novo, worker futuro, função que limpa a GUC, job
-- criado como `authenticated`) escreve por cima do motor de envio exatamente como o F05 tentou impedir.
--
-- Correção (fail-closed), em duas travas:
--   1. quem está dispensado passa a ser decidido pelo **papel REAL da sessão** (`current_user`), que não
--      depende de GUC e nunca é NULL — preserva o caminho legítimo do dono `postgres` (é ele que roda as
--      migrations, os backfills e TODOS os jobs do pg_cron hoje), do `service_role` e do `anon`;
--   2. se a sessão for mesmo `authenticated` e a claim não estiver definida, **levanta erro** em vez de
--      liberar a escrita silenciosamente.
-- A partir daí o corpo do guard é idêntico ao de 20260929590000 — nenhuma regra de negócio mudou
-- (draft-only no INSERT, conteúdo congelado fora do rascunho, contadores do worker, etc.).
--
-- Só estas duas funções entram: das 17 funções Multiplix que citam `auth.role()`, as outras 15 usam
-- `<> 'service_role' THEN RAISE EXCEPTION 'service_role_required'`, isto é, já são fail-closed (verificado
-- no canônico; `transition_multiplix_dispatch` e `sweep_multiplix_stuck_recipients`, por exemplo).
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação. CREATE OR REPLACE preserva os
-- grants existentes (o REVOKE de PUBLIC/anon de 20260930113613 continua valendo).

CREATE OR REPLACE FUNCTION public.enforce_multiplix_dispatch_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- #1267: dispensado só quem NÃO é o ator `authenticated`, decidido pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- #1267: sessão `authenticated` sem a claim do JWT não é "livre" — é indistinguível de ataque. Nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'multiplix_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'multiplix_dispatch_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'multiplix_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'multiplix_dispatch_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'multiplix_dispatch_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Transicao de status: quem muda draft/scheduled/sending/paused e a RPC
  -- transition_multiplix_dispatch (service_role). Staff so alterna o rotulo
  -- entre rascunho e agendado.
  IF OLD.status NOT IN ('draft', 'scheduled') OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'multiplix_dispatch_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- Conteudo e publico congelam fora do rascunho: o worker le o template a cada
  -- item, entao editar durante o envio muda o que sai no meio do disparo.
  IF OLD.status <> 'draft' AND (
    NEW.message_template IS DISTINCT FROM OLD.message_template
    OR NEW.media_url IS DISTINCT FROM OLD.media_url
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.audience_filters IS DISTINCT FROM OLD.audience_filters
    OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
    OR NEW.name IS DISTINCT FROM OLD.name
  ) THEN
    RAISE EXCEPTION 'multiplix_dispatch_content_locked' USING ERRCODE = '42501';
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     AND OLD.status <> 'draft'
     AND NOT (NEW.status = 'scheduled' AND OLD.status = 'draft') THEN
    RAISE EXCEPTION 'multiplix_dispatch_schedule_locked' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.paused_at IS DISTINCT FROM OLD.paused_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.pause_reason IS DISTINCT FROM OLD.pause_reason THEN
    RAISE EXCEPTION 'multiplix_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_multiplix_recipient_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_status text;
BEGIN
  -- #1267: dispensado só quem NÃO é o ator `authenticated`, decidido pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- #1267: sessão `authenticated` sem a claim do JWT não é "livre" — é indistinguível de ataque. Nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'multiplix_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sem caso de uso legitimo para staff reescrever destinatario: o estado de
  -- entrega e do worker (claim/lease/snapshot) e o UPDATE direto permitia
  -- sent -> pending (reenvio) e troca de destino_e164 (reenvio para outro numero).
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'multiplix_recipient_update_denied' USING ERRCODE = '42501';
  END IF;

  SELECT dispatch.status INTO v_dispatch_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = COALESCE(NEW.dispatch_id, OLD.dispatch_id);

  IF v_dispatch_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'multiplix_recipient_%_requires_draft', lower(TG_OP) USING ERRCODE = '55000';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
