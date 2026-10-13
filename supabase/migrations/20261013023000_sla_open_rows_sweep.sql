-- sla_open_rows_sweep
-- Rollback: tira o job do pg_cron e derruba a varredura e o avaliador. Nenhuma tabela,
-- policy, gatilho ou grant de objeto existente muda (so as duas funcoes novas saem).
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if to_regclass('cron.job') is not null then perform cron.unschedule('sla-first-response-sweep'); end if; exception when others then null; end $$;
--   drop function if exists public.sla_first_response_sweep(integer, interval);
--   drop function if exists public.sla_first_response_evaluate(uuid, uuid, timestamptz);
--
-- R2-SLA (P1) — "o alerta de SLA de 1a resposta morre na virada do dia".
--
-- Injúria: a linha ABERTA de conversation_sla (first_response_at IS NULL) é quem segura o
-- relógio da 1a resposta, mas NADA, no banco, a mantém viva ao longo do dia. Quem observa o
-- SLA (painel, War Room) recorta por "hoje": a conversa que chegou às 23h58 e continua sem
-- resposta às 00h05 sai do recorte e o alerta some — mesmo que o prazo já tenha estourado.
-- O prazo de 1a resposta é CURTO (2/5/15 min por configuração), então quase todo estouro
-- acontece depois que a mensagem envelheceu; um recorte por dia perde exatamente o caso que
-- mais importa (a mensagem que atravessou a meia-noite sem atendimento).
--
-- Correção: uma varredura NO BANCO, agendada no pg_cron a cada minuto, que não olha o dia —
-- olha a REGRA COMPLETA: a linha está ABERTA (first_response_at IS NULL, resolved_at IS NULL)
-- e o instante da 1a mensagem já passou do prazo resolvido (first_message_at <= now() - prazo).
-- Ela:
--   1. reavalia as linhas ABERTAS que já venceram ou entraram no limiar de aviso, sem filtro
--      de data alguma — o que resolve a mensagem que atravessou a meia-noite;
--   2. abre a linha de um CICLO NOVO (o cliente escreveu depois da última resposta do atendente
--      e ninguém respondeu), de forma idempotente (o índice parcial
--      ux_conversation_sla_open_per_contact mais ON CONFLICT ... DO NOTHING impede duplicata
--      por contato);
--   3. marca first_response_breached = true quando o prazo estourou — o UPDATE na
--      conversation_sla é o que dispara o realtime que o app já escuta — e registra o alerta
--      em sla_alert_events chamando record_sla_alert (mesma via do resto do projeto), com
--      'warning' no limiar de aviso e 'breached' no estouro;
--   4. mantém a varredura LEVE: a busca de ciclos novos usa o índice de mensagens recentes
--      (idx_messages_created_at) e só olha uma janela (p_lookback, padrao 24h), o prazo curto
--      nunca precisa de mais; não varre os 3 mil contatos a cada minuto nem faz backfill de
--      histórico antigo.
--
-- O prazo sai do MESMO resolve_applicable_sla (PB-39) que o registro da resposta usa — uma
-- única regra para medir e para alertar. O limiar de aviso espelha o front (useSLACalculation):
-- avisa quando falta no máximo 30% do prazo, com piso de 1 minuto.
--
-- Nada é adicionado em publishable/grant de objeto existente: só as duas funções novas, com
-- EXECUTE revogado de PUBLIC/anon/authenticated. Nenhuma tabela nova (nada de RLS nova).

-- ============================================================================
-- 1) Avaliador de UMA linha aberta: resolve o prazo, avisa ou estoura
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sla_first_response_evaluate(
  p_contact_id uuid,
  p_open_id uuid,
  p_first_message_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_minutes integer;
  v_deadline timestamptz;
  v_warn_ante interval;
  v_acted boolean := false;
BEGIN
  IF p_contact_id IS NULL OR p_open_id IS NULL OR p_first_message_at IS NULL THEN
    RETURN false;
  END IF;

  -- Mesma trava por contato de register_first_response_internal: a varredura e o registro da
  -- resposta nao se atropelam (quem entra depois ve a linha ja fechada e nao age).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42));

  -- O job do pg_cron roda SEM JWT (auth.uid() e auth.role() nulos). record_sla_alert exige
  -- staff; marcamos a sessao como service_role de forma LOCAL a transacao para que o alerta
  -- do SISTEMA possa ser registrado pela mesma via (record_sla_alert), sem reimplementar a
  -- idempotencia dele. Efeito colateral contido: e transaction-local e so a varredura chama.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  END IF;

  -- Prazo pela hierarquia unica; 5 min e o padrao de sistema (mesmo fallback do registro).
  SELECT r.first_response_minutes INTO v_minutes
    FROM public.resolve_applicable_sla(p_contact_id) r
   LIMIT 1;
  v_minutes := coalesce(v_minutes, 5);

  v_deadline := p_first_message_at + make_interval(mins => v_minutes);
  -- Limiar de aviso = falta <= 30% do prazo, com piso de 1 minuto (espelha useSLACalculation).
  v_warn_ante := greatest(
    make_interval(secs => ceil(v_minutes * 60 * 0.3)),
    interval '1 minute'
  );

  IF now() >= v_deadline THEN
    UPDATE public.conversation_sla
       SET first_response_breached = true
     WHERE id = p_open_id
       AND first_response_at IS NULL
       AND coalesce(first_response_breached, false) = false;
    PERFORM public.record_sla_alert(p_contact_id, 'first_response', 'breached');
    v_acted := true;
  ELSIF now() >= v_deadline - v_warn_ante THEN
    PERFORM public.record_sla_alert(p_contact_id, 'first_response', 'warning');
    v_acted := true;
  END IF;

  RETURN v_acted;
END;
$function$;

REVOKE ALL ON FUNCTION public.sla_first_response_evaluate(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2) Varredura: linhas abertas + ciclos novos, sem filtro de dia
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sla_first_response_sweep(
  p_limit integer DEFAULT 500,
  p_lookback interval DEFAULT interval '24 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_row record;
  v_open_id uuid;
  v_acted integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'invalid_sweep_limit' USING ERRCODE = '22023';
  END IF;
  p_limit := least(p_limit, 5000);

  IF p_lookback IS NULL OR p_lookback < interval '1 hour' OR p_lookback > interval '7 days' THEN
    p_lookback := interval '24 hours';
  END IF;

  -- (A) Linhas ABERTAS que ja venceram OU entraram no limiar de aviso. O filtro e a REGRA
  -- COMPLETA (aberta + vencida), nunca o dia: a mensagem que atravessou a meia-noite entra.
  -- O LATERAL resolve o prazo uma vez por linha e mantem o lote só com o que ha a fazer.
  FOR v_row IN
    SELECT s.id AS open_id, s.contact_id, s.first_message_at
      FROM public.conversation_sla s
      LEFT JOIN LATERAL (
        SELECT r.first_response_minutes
          FROM public.resolve_applicable_sla(s.contact_id) r
         LIMIT 1
      ) a ON true
     WHERE s.first_response_at IS NULL
       AND s.resolved_at IS NULL
       AND coalesce(s.first_response_breached, false) = false
       AND now() >= s.first_message_at
                  + make_interval(mins => coalesce(a.first_response_minutes, 5))
                  - greatest(
                      make_interval(secs => ceil(coalesce(a.first_response_minutes, 5) * 60 * 0.3)),
                      interval '1 minute'
                    )
     ORDER BY s.first_message_at ASC
     LIMIT p_limit
  LOOP
    IF public.sla_first_response_evaluate(v_row.contact_id, v_row.open_id, v_row.first_message_at) THEN
      v_acted := v_acted + 1;
    END IF;
  END LOOP;

  -- (B) CICLOS NOVOS: o cliente escreveu (dentro da janela recente) depois da ultima resposta
  -- EFETIVA do atendente (sent/delivered/read) e ninguem respondeu ainda. Restringir a janela
  -- usa o indice de mensagens recentes e evita varrer contatos parados há dias (sem backfill).
  FOR v_row IN
    WITH eff AS (
      SELECT m.contact_id, m.created_at, (m.sender = 'agent') AS is_out
        FROM public.messages m
       WHERE m.contact_id IS NOT NULL
         AND (m.sender = 'contact'
              OR (m.sender = 'agent' AND m.status IN ('sent', 'delivered', 'read')))
         AND m.created_at > now() - p_lookback
    ),
    last_out AS (
      SELECT e.contact_id, max(e.created_at) AS last_out_at
        FROM eff e
       WHERE e.is_out
       GROUP BY e.contact_id
    ),
    pending AS (
      SELECT e.contact_id, min(e.created_at) AS pending_since
        FROM eff e
        LEFT JOIN last_out lo ON lo.contact_id = e.contact_id
       WHERE NOT e.is_out
         AND e.created_at > coalesce(lo.last_out_at, '-infinity'::timestamptz)
       GROUP BY e.contact_id
    )
    SELECT p.contact_id, p.pending_since
      FROM pending p
     WHERE NOT EXISTS (
             SELECT 1 FROM public.conversation_sla s
              WHERE s.contact_id = p.contact_id
                AND s.first_response_at IS NULL
           )
     ORDER BY p.pending_since ASC
     LIMIT p_limit
  LOOP
    v_open_id := NULL;

    -- Mesma trava por contato de register_first_response_internal (o INSERT e o gatilho da
    -- resposta nao podem criar/escolher linhas abertas diferentes ao mesmo tempo).
    PERFORM pg_advisory_xact_lock(hashtextextended(v_row.contact_id::text, 42));

    -- Idempotente por contato: o indice parcial garante no maximo UMA linha aberta.
    INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at)
    VALUES (v_row.contact_id, v_row.pending_since, NULL)
    ON CONFLICT (contact_id) WHERE first_response_at IS NULL DO NOTHING
    RETURNING id INTO v_open_id;

    -- Corrida com o gatilho de resposta / outro tick: assume a linha aberta que ja existe.
    IF v_open_id IS NULL THEN
      SELECT s.id INTO v_open_id
        FROM public.conversation_sla s
       WHERE s.contact_id = v_row.contact_id
         AND s.first_response_at IS NULL
       ORDER BY s.created_at DESC
       LIMIT 1;
    END IF;

    IF v_open_id IS NOT NULL
       AND public.sla_first_response_evaluate(v_row.contact_id, v_open_id, v_row.pending_since) THEN
      v_acted := v_acted + 1;
    END IF;
  END LOOP;

  RETURN v_acted;
END;
$function$;

REVOKE ALL ON FUNCTION public.sla_first_response_sweep(integer, interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_first_response_sweep(integer, interval)
  TO service_role;

-- ============================================================================
-- 3) Job do pg_cron: a cada minuto, no banco, sem depender de navegador aberto
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-first-response-sweep') THEN
      PERFORM cron.schedule(
        'sla-first-response-sweep',
        '* * * * *',
        'select public.sla_first_response_sweep()'
      );
    END IF;
  END IF;
EXCEPTION WHEN others THEN
  -- No banco local o postgres nao tem os poderes sobre cron.* (a trava de pg_cron do
  -- conjunto local tambem desliga o agendador); em producao o job e criado. Nao abortar.
  RAISE WARNING 'sla_first_response_sweep_cron_skipped: %', sqlerrm;
END;
$$;
