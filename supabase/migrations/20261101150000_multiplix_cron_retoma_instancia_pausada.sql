-- multiplix_cron_retoma_instancia_pausada (C121, opcao A)
-- O worker do Multiplix passou a pausar o dispatch com pause_reason='instance_paused'
-- quando a instancia esta pausada (instance_pauses). Sem esta migration o cron nunca
-- retoma esse motivo e o dispatch fica parado ate retomada manual.
--
-- Mudanca MINIMA sobre o corpo vigente em producao (lido por pg_get_functiondef):
--   1) DECLARE: nova variavel v_instance.
--   2) Retomada: 'instance_paused' entra na lista aceita (alem de outside_window/daily_limit).
--   3) Para 'instance_paused', so retoma quando NAO ha pausa aberta e vigente:
--      - conexao fixa: pela instancia dela (mesmo criterio de is_instance_paused);
--      - conexao NULL (o worker resolve a 1a conectada): so retoma se nenhuma instancia
--        esta pausada, conservador de proposito.
-- Assinatura, SECURITY DEFINER, search_path e o restante do corpo ficam identicos.
--
-- Rollback: CREATE OR REPLACE com o corpo anterior (sem v_instance, IN ('outside_window','daily_limit')
-- e sem o bloco 'instance_paused'). Nada de DROP.

CREATE OR REPLACE FUNCTION public.trigger_pending_multiplix_dispatches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_candidate   record;  -- id + conexao/motivo do candidato do tick
  v_instance    text;
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

  -- F58: o MESMO fechamento, agora para a fila de ITENS. O sweeper de itens existia
  -- desde o F32b e nunca era chamado por ninguem (medido: 0 chamadas no repo). Sem
  -- ele, um item cujo worker morreu entre o POST e o complete ficaria em 'sending'
  -- para sempre e o dispatch nunca drenaria. Roda depois do de destinatarios: os
  -- dois sao independentes e idempotentes, e o de itens e quem fecha o item.
  PERFORM public.sweep_multiplix_stuck_items(500);

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
  -- C121: tambem retoma 'instance_paused', mas so quando a instancia nao esta mais pausada.
  FOR v_candidate IN
    SELECT dispatch.id,
           dispatch.pause_reason,
           dispatch.whatsapp_connection_id AS connection_id
      FROM public.multiplix_dispatches AS dispatch
     WHERE dispatch.status = 'paused'
       AND dispatch.pause_reason IN ('outside_window', 'daily_limit', 'instance_paused')
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

      -- C121: a pausa da instancia so volta quando nao ha pausa aberta e vigente
      -- (mesmo criterio de is_instance_paused). Conexao NULL: o worker resolve a
      -- 1a conectada e nao sabemos qual, entao so retoma se nenhuma instancia esta pausada.
      IF v_candidate.pause_reason = 'instance_paused' THEN
        IF v_candidate.connection_id IS NULL THEN
          IF EXISTS (
            SELECT 1 FROM public.instance_pauses AS pause
             WHERE pause.resumed_at IS NULL AND pause.paused_until > now()
          ) THEN
            CONTINUE;
          END IF;
        ELSE
          SELECT connection.instance_id INTO v_instance
            FROM public.whatsapp_connections AS connection
           WHERE connection.id = v_candidate.connection_id;
          IF v_instance IS NULL OR EXISTS (
            SELECT 1 FROM public.instance_pauses AS pause
             WHERE pause.instance = btrim(v_instance)
               AND pause.resumed_at IS NULL AND pause.paused_until > now()
          ) THEN
            CONTINUE;  -- ainda pausada (ou conexao sem instancia): segue pausado
          END IF;
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
