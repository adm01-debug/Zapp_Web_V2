-- gamification_streak_dias_seguidos (PE-30, P1) — "Dias seguidos" = dias, não mensagens
-- Rollback: reverter a definição de public.handle_message_gamification,
--   public.handle_conversation_closure_gamification e public.update_agent_streak
--   para os corpos vigentes (abaixo), dropa a rotina interna
--   public.register_agent_active_day(uuid,date) e a coluna
--   public.agent_stats.last_active_date. Nenhuma mensagem, estatística ou
--   conquista precisa ser desfeita (o backfill só reescreve current_streak,
--   best_streak e last_active_date).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.register_agent_active_day(uuid, date);
--   alter table public.agent_stats drop column if exists last_active_date;
--   create or replace function public.handle_message_gamification() returns trigger language plpgsql security definer set search_path to '' as $$ declare v_new_sent int; v_received int; v_total int; begin if tg_op = 'update' and (old.agent_id is not null or new.agent_id is null) then return new; end if; if new.sender = 'agent' and new.agent_id is not null then insert into public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at) values (new.agent_id, 1, 0, 1, 1, now()) on conflict (profile_id) do update set messages_sent = public.agent_stats.messages_sent + 1, current_streak = public.agent_stats.current_streak + 1, best_streak = greatest(public.agent_stats.best_streak, public.agent_stats.current_streak + 1), updated_at = now() returning messages_sent, messages_received into v_new_sent, v_received; v_total := v_new_sent + v_received; if v_total = any (array[10, 50, 100, 500, 1000]) then perform public.grant_agent_achievement_internal(new.agent_id, 'message_milestone', v_total || ' Mensagens', 'Você enviou/recebeu ' || v_total || ' mensagens!', least(100, v_total / 10)); end if; end if; return new; exception when others then raise warning 'gamification error in handle_message_gamification (message_id=%): % [%]', new.id, sqlerrm, sqlstate; return new; end; $$;
--   create or replace function public.handle_conversation_closure_gamification() returns trigger language plpgsql as $$ declare v_resolved bigint; begin if tg_op = 'update' and (old.closed_by is not null or new.closed_by is null) then return new; end if; if new.closed_by is not null then insert into public.agent_stats (profile_id, messages_sent, messages_received, conversations_resolved, current_streak, best_streak, updated_at) values (new.closed_by, 0, 0, 1, 0, 0, now()) on conflict (profile_id) do update set conversations_resolved = public.agent_stats.conversations_resolved + 1, updated_at = now() returning conversations_resolved into v_resolved; if v_resolved = any (array[1, 10, 50, 100, 500]) then perform public.grant_agent_achievement(new.closed_by, 'resolution_milestone', v_resolved || ' Conversas Encerradas', 'Você encerrou ' || v_resolved || ' conversas!', least(100, v_resolved)); end if; end if; return new; end; $$;
--   create or replace function public.update_agent_streak(p_profile_id uuid, p_increment boolean) returns json language plpgsql security definer set search_path to 'public' as $$ declare v_row agent_stats%rowtype; v_new_streak int; v_new_best_streak int; begin if auth.role() = 'anon' or (auth.role() = 'authenticated' and not (p_profile_id in (select id from profiles where user_id = auth.uid()) or is_admin_or_supervisor(auth.uid()))) then raise exception 'permission denied'; end if; select * into v_row from agent_stats where profile_id = p_profile_id for update; if not found then return null; end if; v_new_best_streak := coalesce(v_row.best_streak, 0); if p_increment then v_new_streak := coalesce(v_row.current_streak, 0) + 1; if v_new_streak > v_new_best_streak then v_new_best_streak := v_new_streak; end if; else v_new_streak := 0; end if; update agent_stats set current_streak = v_new_streak, best_streak = v_new_best_streak, updated_at = now() where profile_id = p_profile_id; return json_build_object('newStreak', v_new_streak, 'newBestStreak', v_new_best_streak); end; $$;
--
-- PROBLEMA (PE-30, docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md):
--   "Dias seguidos" mostrava a contagem de MENSAGENS, não de dias. O gatilho
--   trg_gamification_on_message_sent (handle_message_gamification) fazia
--   current_streak = current_streak + 1 A CADA mensagem enviada e o RPC
--   update_agent_streak(true), chamado pelo navegador, fazia o mesmo — medido
--   em produção: streak = messages_sent nos 9 agentes (ex.: 1204 = 1204 mensagens).
--   A migration 20260927620000 chegou a igualar current_streak/best_streak a
--   messages_sent, consolidando o defeito.
--
-- CORREÇÃO: a sequência passa a ser de DIAS consecutivos com atividade. A
--   atividade é: mensagem ENVIADA pelo agente (messages.sender='agent') OU
--   conversa ENCERRADA pelo agente (conversation_closures.closed_by). O dia é o
--   de America/Sao_Paulo (mesma base de "hoje" usada em daily_goal).
--
--   1. Coluna aditiva public.agent_stats.last_active_date (date): último dia com
--      atividade. Sem default (nulos = agentes nunca ativos).
--   2. Rotina interna public.register_agent_active_day(profile_id, day): idempotente
--      no mesmo dia (várias mensagens no dia contam 1); soma 1 se o último dia
--      ativo foi o anterior; reinicia em 1 se pulou um dia ou mais; ignora dia
--      anterior ao último (evento retrocedido). Não é executável por cliente.
--   3. handle_message_gamification PARA de somar streak por mensagem e passa a
--      registrar o dia (created_at do próprio evento). update_agent_streak(true)
--      (caminho do navegador) passa a registrar o dia de hoje — idempotente.
--      handle_conversation_closure_gamification também registra o dia.
--   4. Backfill a partir do histórico real (mensagens por dia + encerramentos por
--      dia), SEM inflar: current_streak = dias consecutivos até hoje (0 se o
--      último dia ativo é anterior a ontem); best_streak = maior corrida do
--      histórico. Não usa as funções de XP (a PB-18 revoga várias delas).

-- 1. Coluna aditiva ------------------------------------------------------------------------
ALTER TABLE public.agent_stats
  ADD COLUMN IF NOT EXISTS last_active_date date;

COMMENT ON COLUMN public.agent_stats.last_active_date IS
  'Ultimo dia (America/Sao_Paulo) com atividade do agente (mensagem enviada ou conversa encerrada). Base da sequencia current_streak em DIAS.';

-- 2. Registro idempotente do dia ativo ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_agent_active_day(p_profile_id uuid, p_day date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row        agent_stats%ROWTYPE;
  v_new_streak int;
  v_new_best   int;
BEGIN
  IF p_profile_id IS NULL OR p_day IS NULL THEN
    RETURN json_build_object('registered', false, 'newStreak', NULL, 'newBestStreak', NULL);
  END IF;

  SELECT * INTO v_row FROM public.agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Mesmo dia: idempotente (N mensagens no dia contam 1).
  IF v_row.last_active_date = p_day THEN
    RETURN json_build_object('registered', false, 'newStreak', v_row.current_streak, 'newBestStreak', v_row.best_streak);
  END IF;

  -- Evento retrocedido (dia anterior ao último registrado): não mexe na sequência.
  IF v_row.last_active_date IS NOT NULL AND p_day < v_row.last_active_date THEN
    RETURN json_build_object('registered', false, 'newStreak', v_row.current_streak, 'newBestStreak', v_row.best_streak);
  END IF;

  IF v_row.last_active_date = p_day - 1 THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;   -- dia seguinte: soma 1
  ELSE
    v_new_streak := 1;                                        -- pulou um dia ou mais: reinicia
  END IF;
  v_new_best := GREATEST(COALESCE(v_row.best_streak, 0), v_new_streak);

  UPDATE public.agent_stats
     SET current_streak   = v_new_streak,
         best_streak      = v_new_best,
         last_active_date = p_day
   WHERE profile_id = p_profile_id;

  RETURN json_build_object('registered', true, 'newStreak', v_new_streak, 'newBestStreak', v_new_best);
END;
$function$;

-- Rotina interna: nenhum cliente a alcança (o default de CREATE FUNCTION seria EXECUTE para PUBLIC).
REVOKE ALL ON FUNCTION public.register_agent_active_day(uuid, date) FROM PUBLIC, anon, authenticated;

-- 3a. Trigger de mensagem: não soma streak por mensagem; registra o DIA do evento ------------------
CREATE OR REPLACE FUNCTION public.handle_message_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_sent  int;
  v_received  int;
  v_total     int;
  v_agent_id  uuid;
  v_day       date;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.agent_id IS NOT NULL OR NEW.agent_id IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.sender = 'agent' AND NEW.agent_id IS NOT NULL THEN
    v_day := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
    INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, last_active_date, updated_at)
    VALUES (NEW.agent_id, 1, 0, 0, 0, NULL, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET messages_sent   = public.agent_stats.messages_sent + 1,
        updated_at      = now()
    RETURNING messages_sent, messages_received INTO v_new_sent, v_received;

    -- Sequência em DIAS: no primeiro envio do dia soma 1 (ou reinicia), e nada nos demais.
    PERFORM public.register_agent_active_day(NEW.agent_id, v_day);

    v_total := v_new_sent + v_received;
    IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
      PERFORM public.grant_agent_achievement_internal(
        NEW.agent_id, 'message_milestone', v_total || ' Mensagens',
        'Você enviou/recebeu ' || v_total || ' mensagens!',
        LEAST(100, v_total / 10)
      );
    END IF;
  ELSIF NEW.sender = 'contact' THEN
    SELECT assigned_to INTO v_agent_id FROM public.contacts WHERE id = NEW.contact_id;
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at)
      VALUES (v_agent_id, 0, 1, 0, 0, now())
      ON CONFLICT (profile_id) DO UPDATE
      SET messages_received = public.agent_stats.messages_received + 1,
          updated_at        = now()
      RETURNING messages_sent, messages_received INTO v_new_sent, v_received;
      v_total := v_new_sent + v_received;
      IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
        PERFORM public.grant_agent_achievement_internal(
          v_agent_id, 'message_milestone', v_total || ' Mensagens',
          'Você enviou/recebeu ' || v_total || ' mensagens!',
          LEAST(100, v_total / 10)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificacao NUNCA pode reverter o enfileiramento/atendimento.
  RAISE WARNING 'gamification error in handle_message_gamification (message_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- 3b. Trigger de encerramento: conversa encerrada TAMBÉM é dia ativo --------------------------------
CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_resolved  bigint;
  v_day       date;
BEGIN
  -- Para UPDATE: só contar quando closed_by muda de NULL para NOT NULL
  IF TG_OP = 'UPDATE' AND (OLD.closed_by IS NOT NULL OR NEW.closed_by IS NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.closed_by IS NOT NULL THEN
    INSERT INTO public.agent_stats (
      profile_id, messages_sent, messages_received,
      conversations_resolved, current_streak, best_streak, updated_at
    )
    VALUES (NEW.closed_by, 0, 0, 1, 0, 0, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET conversations_resolved = public.agent_stats.conversations_resolved + 1,
        updated_at              = now()
    RETURNING conversations_resolved INTO v_resolved;

    v_day := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
    PERFORM public.register_agent_active_day(NEW.closed_by, v_day);

    IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
      -- Bloco aninhado: se a conquista falhar, o dia ativo (e conversations_resolved)
      -- ja gravados ACIMA continuam valendo. Sem isto, o EXCEPTION WHEN OTHERS do
      -- bloco externo desfazia tudo o que a funcao tinha escrito naquele fechamento
      -- (o gancho de streak se perdia junto).
      BEGIN
        PERFORM public.grant_agent_achievement(
          NEW.closed_by,
          'resolution_milestone',
          v_resolved || ' Conversas Encerradas',
          'Você encerrou ' || v_resolved || ' conversas!',
          LEAST(100, v_resolved)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'gamification achievement error in closure (closure_id=%): % [%]',
          NEW.id, SQLERRM, SQLSTATE;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificação NUNCA pode reverter fechamento de conversa
  RAISE WARNING 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- 3c. RPC do navegador (update_agent_streak): incremento passa a ser por DIA ----------------------
CREATE OR REPLACE FUNCTION public.update_agent_streak(p_profile_id uuid, p_increment boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row        agent_stats%ROWTYPE;
  v_res        json;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN RAISE EXCEPTION 'permission denied'; END IF;

  -- Incremento por dia: idempotente no mesmo dia (o navegador pode chamar a cada envio).
  IF p_increment THEN
    v_res := public.register_agent_active_day(p_profile_id, v_today);
    IF v_res IS NULL THEN RETURN NULL; END IF;
    RETURN json_build_object(
      'newStreak',     (v_res->>'newStreak')::int,
      'newBestStreak', (v_res->>'newBestStreak')::int
    );
  END IF;

  -- Reset explícito (p_increment = false): zera a sequência e libera o dia.
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE agent_stats
     SET current_streak   = 0,
         last_active_date = NULL,
         updated_at       = now()
   WHERE profile_id = p_profile_id;
  RETURN json_build_object('newStreak', 0, 'newBestStreak', COALESCE(v_row.best_streak, 0));
END; $function$;

-- 4. Backfill do histórico real (SEM inflar) --------------------------------------------------------
-- O gatilho BEFORE UPDATE update_agent_stats_updated_at regrava updated_at em TODA linha tocada.
-- Desligo SÓ ele durante o backfill (a migration roda em transação única; o rollback restaura) para
-- a correção de streak não reescrever a data das linhas. O rollback pós-merge reabilita.
ALTER TABLE public.agent_stats DISABLE TRIGGER update_agent_stats_updated_at;
WITH activity AS (
  SELECT m.agent_id AS profile_id,
         (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.messages m
   WHERE m.sender = 'agent' AND m.agent_id IS NOT NULL
  UNION
  SELECT c.closed_by AS profile_id,
         (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.conversation_closures c
   WHERE c.closed_by IS NOT NULL
),
dias AS (
  SELECT DISTINCT profile_id, d FROM activity
),
runs AS (
  SELECT profile_id, d,
         d - (row_number() OVER (PARTITION BY profile_id ORDER BY d))::int AS grp
    FROM dias
),
tamanhos AS (
  SELECT profile_id, grp, count(*)::int AS len, max(d) AS fim
    FROM runs GROUP BY profile_id, grp
),
ultima AS (
  SELECT DISTINCT ON (profile_id) profile_id, len, fim
    FROM tamanhos ORDER BY profile_id, fim DESC
),
melhor AS (
  SELECT profile_id, max(len)::int AS best FROM tamanhos GROUP BY profile_id
),
hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
),
novo AS (
  SELECT s.profile_id,
         CASE WHEN u.fim >= (SELECT d FROM hoje) - 1 THEN u.len ELSE 0 END AS cs,
         GREATEST(m.best, u.len) AS bs,
         u.fim AS lad
    FROM public.agent_stats s
    JOIN ultima u ON u.profile_id = s.profile_id
    JOIN melhor m ON m.profile_id = s.profile_id
)
UPDATE public.agent_stats s
   SET current_streak   = n.cs,
       best_streak      = n.bs,
       last_active_date = n.lad
  FROM novo n
 WHERE s.profile_id = n.profile_id
   AND (s.current_streak   IS DISTINCT FROM n.cs
     OR s.best_streak      IS DISTINCT FROM n.bs
     OR s.last_active_date IS DISTINCT FROM n.lad);

-- Agentes sem NENHUMA atividade no histórico: sequência zerada e sem data.
UPDATE public.agent_stats s
   SET current_streak   = 0,
       best_streak      = 0,
       last_active_date = NULL
 WHERE (s.current_streak <> 0 OR s.best_streak <> 0 OR s.last_active_date IS NOT NULL)
   AND NOT EXISTS (
         SELECT 1 FROM public.messages m
          WHERE m.sender = 'agent' AND m.agent_id = s.profile_id
       )
   AND NOT EXISTS (
         SELECT 1 FROM public.conversation_closures c
          WHERE c.closed_by = s.profile_id
       );

ALTER TABLE public.agent_stats ENABLE TRIGGER update_agent_stats_updated_at;
