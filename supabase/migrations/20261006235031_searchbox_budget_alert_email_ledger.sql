-- searchbox_budget_alert_email_ledger (R2-API-058 / #230) — area banco
-- Rollback: SELECT cron.schedule('searchbox-budget-alert', '0 12 * * *', (SELECT previous_command FROM public.searchbox_budget_alert_cron WHERE id));
-- Rollback: DROP FUNCTION IF EXISTS public.searchbox_budget_alert_tick();
-- Rollback: DROP TABLE IF EXISTS public.searchbox_budget_alert_emails;
-- Rollback: DROP TABLE IF EXISTS public.searchbox_budget_alert_cron;
--
-- DEFEITO: o alerta mensal de custo do autocomplete tinha dois canais com ledgers diferentes.
--   canal app    -> public.notifications, 1 por mes, chaveado por type + metadata->>'mes';
--   canal e-mail -> ledger NENHUM. O job do cron (20261002601230) rodava, TODO dia, duas
--                   instrucoes: notify_searchbox_budget() E net.http_post(...) INCONDICIONAL;
--                   a edge searchbox-budget-alert so consulta o consumo e envia. Enquanto o mes
--                   ficasse acima do limiar, o e-mail repetia em CADA execucao diaria.
--
-- CORRECAO: o canal de e-mail ganha identidade mensal e ledger PROPRIO, com decisao ATOMICA
-- antes do envio. O job passa a chamar public.searchbox_budget_alert_tick(), que:
--   (1) roda o canal app (notify_searchbox_budget(), corpo INALTERADO);
--   (2) reivindica o mes em public.searchbox_budget_alert_emails (PK = mes) —
--       INSERT ... ON CONFLICT (mes) DO NOTHING no mes novo; no mes ja reivindicado, so
--       status='failed' (falha CONFIRMADA) libera nova tentativa;
--   (3) SO quando a reivindicacao venceu faz o net.http_post do canal e-mail, gravando o
--       request_id do pg_net na mesma linha.
--
-- Estados do ledger: 'pending' (tentativa feita, sem confirmacao -> NAO reenvia: resultado
-- incerto exige conciliacao), 'sent' (envio confirmado), 'failed' (falha confirmada -> a proxima
-- execucao retenta), 'uncertain' (conciliacao manual). Quem confirma o envio e a edge
-- searchbox-budget-alert (area do worker edge): ela grava 'sent'/'failed' na linha do mes via
-- service_role. Enquanto nao houver confirmacao a linha fica 'pending' e o e-mail NAO se repete.
--
-- A URL do canal nao entra como literal neste arquivo (a trava do modo V2 proibe host no SQL):
-- a migration CAPTURA a URL que ja vive no comando vigente do job e a guarda como DADO em
-- public.searchbox_budget_alert_cron, junto do comando anterior — que o rollback restaura
-- EXATAMENTE como estava (e melhor que recriar o comando a mao).
--
-- E-mail ja enviado NAO tem rollback (o passado nao se desfaz); o rollback acima devolve o comando
-- anterior do job, remove a funcao nova, o ledger e a tabela de estado do canal.

-- Ledger do canal de e-mail: uma linha por mes. O mes e a IDENTIDADE do incidente — a 2a
-- execucao do mes cai na mesma linha (PK) e nao cria alerta novo.
CREATE TABLE public.searchbox_budget_alert_emails (
  mes           text PRIMARY KEY CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  sessoes       integer NOT NULL CHECK (sessoes >= 0),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed', 'uncertain')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  request_id    bigint,
  http_status   integer,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Tabela de estado do canal: RLS ligada + negada por padrao. Quem escreve e a funcao
-- SECURITY DEFINER (dona postgres) e a edge (service_role, que confirma 'sent'/'failed').
ALTER TABLE public.searchbox_budget_alert_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.searchbox_budget_alert_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.searchbox_budget_alert_emails TO service_role;

COMMENT ON TABLE public.searchbox_budget_alert_emails IS
  'Ledger do canal de E-MAIL do alerta mensal de custo do autocomplete: 1 linha por mes (PK). '
  'pending = tentativa sem confirmacao (nao reenvia); sent/failed/uncertain = confirmados pela edge.';
COMMENT ON COLUMN public.searchbox_budget_alert_emails.request_id IS
  'id do request devolvido por net.http_post (pg_net), para conciliacao do envio.';

-- Estado do canal (linha unica): o alvo do POST e o comando anterior do job.
CREATE TABLE public.searchbox_budget_alert_cron (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  url              text NOT NULL,
  previous_command text NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.searchbox_budget_alert_cron ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.searchbox_budget_alert_cron FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.searchbox_budget_alert_cron TO service_role;

COMMENT ON TABLE public.searchbox_budget_alert_cron IS
  'Estado do canal de e-mail do alerta: alvo (url) do net.http_post e o comando ANTERIOR do job '
  '(restaurado exatamente pelo rollback). A url e capturada do comando vigente — nao ha host literal no arquivo.';

-- Captura a URL do canal e o comando anterior do proprio job (fonte viva do contrato).
INSERT INTO public.searchbox_budget_alert_cron (id, url, previous_command)
SELECT true,
       (regexp_match(command, 'https?://[^''[:space:]]*/functions/v1/searchbox-budget-alert'))[1],
       command
  FROM cron.job
 WHERE jobname = 'searchbox-budget-alert'
 ORDER BY jobid
 LIMIT 1;

DO $$
BEGIN
  IF (SELECT url FROM public.searchbox_budget_alert_cron WHERE id) IS NULL THEN
    RAISE EXCEPTION 'nao achei a URL do canal de e-mail no comando atual do job searchbox-budget-alert'
      USING HINT = 'o job 20261002601230_searchbox_budget_alert_cron.sql precisa existir antes desta migration';
  END IF;
END $$;

-- Tick unico do cron. Substitui o par "notify + net.http_post incondicional" do job antigo.
CREATE OR REPLACE FUNCTION public.searchbox_budget_alert_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mes     text;
  v_sessoes integer;
  v_limite  integer := 400;
  v_count   integer;
  v_linhas  integer;
  v_claim   boolean := false;
  v_url     text;
  v_request bigint;
BEGIN
  -- Canal 1 (app): inalterado.
  v_count := public.notify_searchbox_budget();

  v_mes := to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM');

  SELECT coalesce(sum(sessoes), 0) INTO v_sessoes
  FROM public.searchbox_usage_daily
  WHERE dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

  IF v_sessoes < v_limite THEN
    RETURN v_count;
  END IF;

  -- Canal 2 (e-mail): reivindicacao ATOMICA do mes ANTES de qualquer envio.
  -- A PK (mes) e a trava: a linha do mes so nasce uma vez.
  INSERT INTO public.searchbox_budget_alert_emails (mes, sessoes, status, attempt_count)
  VALUES (v_mes, v_sessoes, 'pending', 1)
  ON CONFLICT (mes) DO NOTHING;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas = 1 THEN
    v_claim := true;
  ELSE
    -- Mes ja reivindicado: so falha CONFIRMADA libera nova tentativa. O UPDATE e guardado
    -- por status='failed' e trava a linha, entao duas execucoes concorrentes nao enviam duas vezes.
    UPDATE public.searchbox_budget_alert_emails
       SET status        = 'pending',
           attempt_count = attempt_count + 1,
           sessoes       = v_sessoes,
           last_error    = NULL,
           updated_at    = now()
     WHERE mes = v_mes
       AND status = 'failed';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 1 THEN
      v_claim := true;
    END IF;
  END IF;

  IF NOT v_claim THEN
    RETURN v_count;
  END IF;

  SELECT url INTO v_url FROM public.searchbox_budget_alert_cron WHERE id;
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'canal de e-mail do alerta de custo sem alvo configurado';
  END IF;

  v_request := net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'searchbox_alert_cron_secret')
    ),
    timeout_milliseconds := 30000
  );

  UPDATE public.searchbox_budget_alert_emails
     SET request_id = v_request,
         updated_at = now()
   WHERE mes = v_mes;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.searchbox_budget_alert_tick() FROM PUBLIC, anon, authenticated;

-- O job mantem o nome e o horario; muda o comando (cron.schedule atualiza o job de mesmo nome).
SELECT cron.schedule(
  'searchbox-budget-alert',
  '0 12 * * *',
  $$SELECT public.searchbox_budget_alert_tick();$$
);
