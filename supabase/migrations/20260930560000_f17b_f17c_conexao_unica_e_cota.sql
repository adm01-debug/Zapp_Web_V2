-- ============================================================================
-- F17b / F17c — ritmo por conexao e retomada por cota no cron do Multiplix
-- ============================================================================
-- rollback: reaplicar o corpo imediatamente anterior de
--   public.trigger_pending_multiplix_dispatches(), que segue no repo em
--   supabase/migrations/20260929610000_multiplix_cron_window_and_limits.sql
--   (linhas 156-260). Nada de dado ou de job muda: o job cron.job
--   'multiplix-send-trigger' (*/2 * * * *) continua chamando a mesma funcao, e a
--   ACL (REVOKE PUBLIC/anon/authenticated + GRANT service_role) e reaplicada
--   identica nos dois lados.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE/GRANT).
--
-- Contexto (medido em 01/10/2026 contra o banco canonico tnnnlkbymytvtqngbbqh):
--   * O fan-out vigente particiona por conexao ordenando por dispatch.updated_at
--     e emite no maximo um net.http_post por particao por tick. Isso nunca foi
--     um mutex: record_/complete_/reschedule_multiplix_recipient reescrevem
--     updated_at a cada destinatario, entao o dispatch B (parado em 'sending',
--     carimbo antigo) vira position 1 da particao e recebe POST enquanto A ainda
--     envia — duas edges na MESMA instancia do WhatsApp, que e o risco de
--     bloqueio que a F17 existe para eliminar. A garantia passa a ser de ESTADO:
--     nao deixar coexistir duas linhas 'sending' na mesma conexao.
--   * F17c: a retomada cobria so pause_reason='outside_window'. O worker tambem
--     auto-pausa com 'daily_limit' (multiplix-send/index.ts) e nada retomava —
--     o disparo ficava pausado para sempre, mesmo com a cota virando no dia
--     seguinte. A cota e medida por public.multiplix_connection_daily_usage(uuid),
--     a MESMA funcao que o worker usa (talkx + multiplix do dia, dia local de
--     Sao Paulo, limit = talkx_settings.daily_limit_per_connection).
--
-- Onde o guard NAO pode ir: dentro do WHERE do FOR. O `FOR ... IN SELECT` do
-- PL/pgSQL e um cursor com o snapshot do inicio do loop — ele nao enxergaria a
-- promocao feita pela iteracao anterior do mesmo tick e promoveria A e B juntos
-- (bug silencioso). No corpo do loop o EXISTS e um statement novo, com snapshot
-- novo, e ve a promocao anterior.
--
-- Escopo consciente desta migration: o guard vale para o caminho do cron. O funil
-- public.transition_multiplix_dispatch('start') fica sem guard (a acao manual
-- "Iniciar" na edge ainda pode levar um segundo dispatch a 'sending' na mesma
-- conexao). Fechar isso muda contrato observavel (novo codigo de erro para a
-- edge) e merece teste negativo proprio — registrado como achado, nao silenciado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_pending_multiplix_dispatches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_candidate   record;  -- id + conexao/motivo do candidato do tick
  v_send_url    text;
  v_anon_key    text;
  v_cron_secret text;
BEGIN
  -- O scheduler e um chamador privilegiado (EXECUTE so para service_role +
  -- pg_cron). Declara o papel localmente para as RPCs do motor aceitarem a
  -- promocao/retomada; is_local=true limita o efeito a esta transacao.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- F11b: fecha item preso (POST feito, lease expirado) antes de qualquer fan-out,
  -- para o dispatch nao ficar preso em 'sending' para sempre.
  PERFORM public.sweep_multiplix_stuck_recipients(500);

  -- F10a + F17b: dispatch agendado cujo horario chegou — no maximo um por conexao.
  FOR v_candidate IN
    SELECT dispatch.id,
           dispatch.whatsapp_connection_id AS connection_id
      FROM public.multiplix_dispatches AS dispatch
     WHERE dispatch.status = 'scheduled'
       AND dispatch.scheduled_at IS NOT NULL
       AND dispatch.scheduled_at <= statement_timestamp()
     ORDER BY dispatch.scheduled_at
     LIMIT 10
  LOOP
    BEGIN
      -- F17b: nunca promover para 'sending' se ja existe outro dispatch enviando
      -- na mesma conexao. NULL entra como coringa de proposito: o composer nao
      -- oferece escolha de conexao, entao whatsapp_connection_id nasce NULL e o
      -- worker resolve NULL para "primeira conexao conectada" — que pode ser
      -- justamente a conexao do outro dispatch. Tratar NULL como bucket separado
      -- deixaria as duas edges na mesma instancia sem o banco perceber.
      -- O coringa vale nos DOIS sentidos: um 'sending' NULL bloqueia qualquer
      -- candidato, e um candidato NULL e bloqueado por qualquer 'sending'. A
      -- primeira versao desta migration cobria so o primeiro sentido (comparar com
      -- IS NOT DISTINCT FROM nao bloqueia candidato NULL) — o agente de teste mediu
      -- o buraco no banco descartavel e ele esta fechado aqui.
      IF EXISTS (
        SELECT 1
          FROM public.multiplix_dispatches AS other
         WHERE other.status = 'sending'
           AND other.id <> v_candidate.id
           AND (v_candidate.connection_id IS NULL
                OR other.whatsapp_connection_id IS NULL
                OR other.whatsapp_connection_id = v_candidate.connection_id)
      ) THEN
        CONTINUE;
      END IF;

      PERFORM public.transition_multiplix_dispatch(v_candidate.id, 'start');
    EXCEPTION WHEN OTHERS THEN
      -- Um dispatch invalido (sem destinatario, sem template) nao pode travar o tick.
      NULL;
    END;
  END LOOP;

  -- F10b + F17c: retoma o que o worker auto-pausou fora da janela OU por cota do
  -- dia, mas SO com a janela aberta de novo — sem isso o cron reabriria o
  -- dispatch a cada 2 min e o worker pausaria de novo (churn de pausa/retomada
  -- sem enviar nada), e fora da janela o dispatch ficaria 'sending' ocioso
  -- (a edge devolve ok:false sem pausar).
  FOR v_candidate IN
    SELECT dispatch.id,
           dispatch.pause_reason,
           dispatch.whatsapp_connection_id AS connection_id
      FROM public.multiplix_dispatches AS dispatch
     WHERE dispatch.status = 'paused'
       AND dispatch.pause_reason IN ('outside_window', 'daily_limit')
       AND public.multiplix_dispatch_window_is_open(dispatch.id)
     ORDER BY dispatch.updated_at
     LIMIT 10
  LOOP
    BEGIN
      -- F17c: a pausa por cota so volta quando ha cota sobrando de verdade, pela
      -- MESMA medicao que o worker usa. Sem esta checagem o cron reabriria e o
      -- worker re-pausaria a cada 2 min indefinidamente (1 cold start de edge +
      -- 3 RPCs por tick) — o churn que a F10b ja tinha evitado para a janela.
      -- Fail-closed: sem cota mensuravel, continua pausado.
      IF v_candidate.pause_reason = 'daily_limit' THEN
        IF v_candidate.connection_id IS NULL THEN
          -- Sem conexao fixa o worker nunca pausou por cota (resolveDailyRoom
          -- devolve null) e a RPC de cota levantaria 22023. Nada a medir.
          CONTINUE;
        END IF;
        IF COALESCE(
             (public.multiplix_connection_daily_usage(v_candidate.connection_id) ->> 'remaining')::integer,
             0
           ) <= 0 THEN
          CONTINUE;  -- ainda sem espaco: segue pausado, sem churn
        END IF;
      END IF;

      -- F17b: mesma guarda de conexao da promocao (repetida de proposito: deixar
      -- o guard junto do PERFORM deixa explicito qual transicao ele protege).
      IF EXISTS (
        SELECT 1
          FROM public.multiplix_dispatches AS other
         WHERE other.status = 'sending'
           AND other.id <> v_candidate.id
           AND (v_candidate.connection_id IS NULL
                OR other.whatsapp_connection_id IS NULL
                OR other.whatsapp_connection_id = v_candidate.connection_id)
      ) THEN
        CONTINUE;
      END IF;

      PERFORM public.transition_multiplix_dispatch(v_candidate.id, 'start');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  SELECT decrypted_secret INTO v_send_url
  FROM vault.decrypted_secrets WHERE name = 'multiplix_send_url' LIMIT 1;

  -- Correcao de fato (medida em 01/10/2026): o comentario anterior dizia que o
  -- vault deste projeto nao guarda a service-role key. Ele guarda — o secret
  -- 'sicoob_service_role_key' e um JWT com iss=supabase, ref=tnnnlkbymytvtqngbbqh
  -- e claim role=service_role. O Bearer abaixo continua com a anon key porque ela
  -- e irrelevante como credencial aqui: a edge valida o header x-cron-secret
  -- (contra get_multiplix_cron_secret(), em tempo constante) ANTES do guard de
  -- Bearer e, com isCronAuth=true, nunca olha o Authorization. O Bearer com a anon
  -- key serve so para satisfazer o gateway da propria plataforma. Trocar por
  -- service-role reutilizaria um segredo batizado para outra integracao sem
  -- ganho de seguranca; ver a decisao registrada no PR do Bloco A.
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets WHERE name = 'zapp_anon_key' LIMIT 1;

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'multiplix_cron_secret' LIMIT 1;

  IF v_send_url IS NULL OR v_cron_secret IS NULL THEN
    RETURN; -- sem segredo/rota configurados, nao ha como chamar a edge
  END IF;

  -- F17: no maximo UM dispatch por conexao por tick. Mantido como esta — a defesa
  -- de verdade agora e o guard de estado acima, porque ordenar por updated_at e
  -- instavel (o dispatch em envio tem o carimbo reescrito a cada destinatario por
  -- record/complete/reschedule_multiplix_recipient).
  FOR v_candidate IN
    SELECT ranked.id
      FROM (
        SELECT dispatch.id,
               row_number() OVER (
                 PARTITION BY COALESCE(dispatch.whatsapp_connection_id::text, 'sem-conexao')
                 ORDER BY dispatch.updated_at
               ) AS position
          FROM public.multiplix_dispatches AS dispatch
         WHERE dispatch.status = 'sending'
      ) AS ranked
     WHERE ranked.position <= 1
     ORDER BY ranked.id
     LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := v_send_url,
      body := jsonb_build_object('dispatchId', v_candidate.id::text, 'action', 'start'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_pending_multiplix_dispatches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_pending_multiplix_dispatches() TO service_role;
