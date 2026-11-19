-- X091: talkx_template_library_stats + talkx_template_stats
--
-- Causa: `src/hooks/integrations/useTalkXTemplateStats.ts` chama estas duas RPCs
-- (linhas 103 e 126) e elas nunca existiram no banco. Em producao o
-- `POST /rest/v1/rpc/talkx_template_library_stats` responde **404** e, com ele,
-- a faixa de KPIs da tela 04 (biblioteca de templates) e o card "Desempenho
-- deste template" da tela 05 ficam em erro permanente.
--
-- A migration X086 (20261108202000) entregou `talkx_template_library_kpis()`
-- (sem argumentos) e `talkx_template_metrics(uuid)` -- nomes e contratos
-- diferentes, que o front nao usa. Esta migration entrega o que o front
-- realmente consome, sem tocar nas duas anteriores.
--
-- Contrato: o das interfaces `TalkXTemplateLibraryStats` e `TalkXTemplateStats`
-- do proprio hook, campo por campo. Nada do front muda.
--
-- Definicoes (trilha de templates F08, registradas no hook):
--   enviados      = destinatarios com `sent_at` na janela
--   t. resposta   = destinatarios com `replied_at` / enviados da janela
--   t. conversao  = conversoes da campanha do template na janela / enviados
--   t. rejeicao   = opt-outs das campanhas do template na janela / enviados
--                   (falha de envio NAO e rejeicao)
--
-- Limite conhecido e assumido: `talkx_campaign_optouts` e agregada por campanha
-- (`optout_count`, `last_optout_at`) -- nao ha opt-out por destinatario com
-- data. A janela de rejeicao usa `last_optout_at`, que e o unico sinal temporal
-- existente. Quando houver opt-out por destinatario, troque so o CTE `opt`.
--
-- Acesso: SECURITY DEFINER + GRANT para `authenticated`, como o hook documenta.
-- Devolve **somente agregados**: nenhum `contact_id`, telefone ou conteudo de
-- mensagem sai daqui. Coerente com a policy `talkx_templates_select`
-- (`auth.uid() IS NOT NULL`), que ja deixa qualquer usuario autenticado ler a
-- biblioteca de templates.

DROP FUNCTION IF EXISTS public.talkx_template_stats(uuid, timestamptz, timestamptz)

CREATE OR REPLACE FUNCTION public.talkx_template_stats(
  p_template_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dur interval;
  v_cur jsonb;
  v_prev jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_template_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'invalid window' USING ERRCODE = '22023';
  END IF;

  v_dur := p_to - p_from;

  WITH janelas(idx, ini, fim) AS (
    VALUES (1, p_from, p_to), (2, p_from - v_dur, p_from)
  ),
  envios AS (
    SELECT j.idx,
           COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL)    AS sent,
           COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replied
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_recipients r
           ON r.campaign_id = c.id
          AND r.sent_at >= j.ini
          AND r.sent_at <  j.fim
    GROUP BY j.idx
  ),
  conv AS (
    SELECT j.idx, COUNT(cv.id) AS converted
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_conversions cv
           ON cv.campaign_id = c.id
          AND COALESCE(cv.occurred_at, cv.created_at) >= j.ini
          AND COALESCE(cv.occurred_at, cv.created_at) <  j.fim
    GROUP BY j.idx
  ),
  opt AS (
    SELECT j.idx, COALESCE(SUM(o.optout_count), 0)::bigint AS opted_out
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_campaign_optouts o
           ON o.campaign_id = c.id
          AND o.last_optout_at >= j.ini
          AND o.last_optout_at <  j.fim
    GROUP BY j.idx
  ),
  agregados AS (
    SELECT e.idx,
           jsonb_build_object(
             'sent', e.sent,
             'replied', e.replied,
             'converted', cv.converted,
             'opted_out', o.opted_out,
             'reply_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((e.replied::numeric * 100) / e.sent, 1) END,
             'conversion_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((cv.converted::numeric * 100) / e.sent, 1) END,
             'rejection_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((o.opted_out::numeric * 100) / e.sent, 1) END
           ) AS obj
    FROM envios e
    JOIN conv cv ON cv.idx = e.idx
    JOIN opt  o  ON o.idx  = e.idx
  )
  SELECT (SELECT obj FROM agregados WHERE idx = 1),
         (SELECT obj FROM agregados WHERE idx = 2)
  INTO v_cur, v_prev;

  v_cur := COALESCE(v_cur, jsonb_build_object(
    'sent', 0, 'replied', 0, 'converted', 0, 'opted_out', 0,
    'reply_rate_pct', NULL, 'conversion_rate_pct', NULL, 'rejection_rate_pct', NULL
  ));

  -- `previous` nulo quando o periodo anterior nao teve envio nenhum: sem base,
  -- a tela nao mostra seta de variacao (decisao A9, aplicada no hook).
  RETURN v_cur || jsonb_build_object(
    'previous',
    CASE WHEN COALESCE((v_prev->>'sent')::bigint, 0) > 0 THEN v_prev ELSE NULL END
  );
END;
$$

GRANT EXECUTE ON FUNCTION public.talkx_template_stats(uuid, timestamptz, timestamptz) TO authenticated

DROP FUNCTION IF EXISTS public.talkx_template_library_stats(integer, integer)

CREATE OR REPLACE FUNCTION public.talkx_template_library_stats(
  p_days integer DEFAULT 30,
  p_top integer DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days      integer     := GREATEST(1, COALESCE(p_days, 30));
  -- `p_top` chega do front (`{ p_days: 30, p_top: 3 }`). O contrato de hoje
  -- expoe so o lider em `most_used`; `p_top` limita o ranking consultado, para
  -- a assinatura casar com a chamada sem mudar a forma do retorno.
  v_top       integer     := GREATEST(1, LEAST(COALESCE(p_top, 3), 20));
  v_now       timestamptz := now();
  v_cur_from  timestamptz;
  v_prev_from timestamptz;
  v_result    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  v_cur_from  := v_now - make_interval(days => v_days);
  v_prev_from := v_now - make_interval(days => v_days * 2);

  WITH meses AS (
    -- 8 pontos de sparkline, do mais antigo para o mais recente.
    SELECT date_trunc('month', v_now) - make_interval(months => g) AS ini,
           date_trunc('month', v_now) - make_interval(months => g - 1) AS fim,
           7 - g AS ord
    FROM generate_series(7, 0, -1) AS g
  ),
  vivos AS (
    SELECT * FROM public.talkx_templates WHERE archived_at IS NULL
  ),
  envios AS (
    -- Enviados por template, com a janela a que pertencem.
    SELECT c.template_id,
           r.sent_at,
           r.replied_at
    FROM public.talkx_campaigns c
    JOIN public.talkx_recipients r ON r.campaign_id = c.id
    WHERE c.template_id IS NOT NULL
      AND r.sent_at IS NOT NULL
      AND r.sent_at >= LEAST(v_prev_from, date_trunc('month', v_now) - make_interval(months => 7))
  ),
  base_atual AS (
    SELECT COUNT(*) AS sent, COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM envios WHERE sent_at >= v_cur_from
  ),
  base_anterior AS (
    SELECT COUNT(*) AS sent, COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM envios WHERE sent_at >= v_prev_from AND sent_at < v_cur_from
  ),
  ranking AS (
    -- Mais usado = por MENSAGENS enviadas na janela, nunca por `use_count`
    -- (que conta campanhas).
    SELECT e.template_id, COUNT(*) AS messages
    FROM envios e
    WHERE e.sent_at >= v_cur_from
    GROUP BY e.template_id
    ORDER BY COUNT(*) DESC, e.template_id
    LIMIT v_top
  ),
  lider AS (
    SELECT r.template_id, r.messages, t.name
    FROM ranking r LEFT JOIN public.talkx_templates t ON t.id = r.template_id
    ORDER BY r.messages DESC, r.template_id
    LIMIT 1
  ),
  melhor_resposta AS (
    SELECT e.template_id,
           ROUND((COUNT(*) FILTER (WHERE e.replied_at IS NOT NULL)::numeric * 100) / COUNT(*), 1) AS taxa
    FROM envios e
    WHERE e.sent_at >= v_cur_from
    GROUP BY e.template_id
    HAVING COUNT(*) > 0
    ORDER BY 2 DESC, e.template_id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM vivos),
    'created_current_month', (
      SELECT COUNT(*) FROM vivos
      WHERE created_at >= date_trunc('month', v_now)
    ),
    'created_previous_month', (
      SELECT COUNT(*) FROM vivos
      WHERE created_at >= date_trunc('month', v_now) - interval '1 month'
        AND created_at <  date_trunc('month', v_now)
    ),
    'created_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (SELECT COUNT(*) FROM vivos v WHERE v.created_at >= m.ini AND v.created_at < m.fim) AS n
        FROM meses m
      ) q
    ),
    'approved', (SELECT COUNT(*) FROM vivos WHERE status = 'approved'),
    'approved_period', (
      SELECT COUNT(*) FROM vivos WHERE status = 'approved' AND updated_at >= v_cur_from
    ),
    'approved_previous_period', (
      SELECT COUNT(*) FROM vivos
      WHERE status = 'approved' AND updated_at >= v_prev_from AND updated_at < v_cur_from
    ),
    'approved_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (
          SELECT COUNT(*) FROM vivos v
          WHERE v.status = 'approved' AND v.updated_at >= m.ini AND v.updated_at < m.fim
        ) AS n
        FROM meses m
      ) q
    ),
    'most_used', (
      SELECT jsonb_build_object(
        'name', l.name,
        'messages', l.messages,
        'series', (
          SELECT jsonb_agg(q.n ORDER BY q.ord)
          FROM (
            SELECT m.ord, (
              SELECT COUNT(*) FROM envios e
              WHERE e.template_id = l.template_id AND e.sent_at >= m.ini AND e.sent_at < m.fim
            ) AS n
            FROM meses m
          ) q
        )
      )
      FROM lider l
    ),
    'with_media', (SELECT COUNT(*) FROM vivos WHERE media_url IS NOT NULL),
    'with_media_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (
          SELECT COUNT(*) FROM vivos v
          WHERE v.media_url IS NOT NULL AND v.created_at >= m.ini AND v.created_at < m.fim
        ) AS n
        FROM meses m
      ) q
    ),
    'avg_reply_rate_pct', (
      SELECT CASE WHEN sent > 0 THEN ROUND((replied::numeric * 100) / sent, 1) END FROM base_atual
    ),
    'avg_reply_rate_previous_pct', (
      SELECT CASE WHEN sent > 0 THEN ROUND((replied::numeric * 100) / sent, 1) END FROM base_anterior
    ),
    'reply_base_current', (SELECT sent FROM base_atual),
    'reply_base_previous', (SELECT sent FROM base_anterior),
    'best_reply', (
      SELECT jsonb_build_object(
        'name', t.name,
        'version', tv.version_number,
        'reply_rate_pct', mr.taxa
      )
      FROM melhor_resposta mr
      LEFT JOIN public.talkx_templates t ON t.id = mr.template_id
      LEFT JOIN public.talkx_template_versions tv ON tv.id = t.current_version_id
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$

GRANT EXECUTE ON FUNCTION public.talkx_template_library_stats(integer, integer) TO authenticated
